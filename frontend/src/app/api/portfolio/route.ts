/**
 * Server-side relay for Blockscout's token-balances endpoint.
 *
 * ## Why a route rather than a direct fetch
 *
 * Three reasons, in order of how much they matter:
 *
 *  1. **Size.** `/addresses/{a}/token-balances` is unpaginated. A busy wallet
 *     answers with every ERC-20 it has ever touched — the probe address came
 *     back with 2,152 entries and 952 KB — and almost all of it is dust nobody
 *     asked about. Trimming here means the browser downloads a few KB.
 *  2. **Shape.** Blockscout returns raw units as strings and decimals as
 *     strings, and mixes ERC-20 with ERC-721/1155 in the same array. Doing that
 *     arithmetic once, on the server, keeps `BigInt` handling out of five
 *     components.
 *  3. **Failure legibility.** A 5xx from Blockscout is transient — the probe
 *     caught the same URL answering 500 and then 200 seconds apart — so it has
 *     to read as "try again", not as "this wallet is empty". That distinction
 *     is the same one the contract makes, and it is worth making in one place.
 *
 * This endpoint reads a PUBLIC address's public balances. It takes no
 * credential, holds no state, and never sees a wallet signature.
 */
import type { ChainName, Holding } from "@/types";

export const dynamic = "force-dynamic";

/**
 * The Blockscout host per chain.
 *
 * Duplicated from `lib/risk.ts` on purpose: that module is the UI's meaning
 * layer and carries React-facing concerns, and a route handler should not
 * inherit them just to learn four hostnames. The contract holds the same four
 * in `get_config().chains`, which is the authority either way.
 */
const HOSTS: Record<ChainName, string> = {
  ethereum: "https://eth.blockscout.com",
  base: "https://base.blockscout.com",
  arbitrum: "https://arbitrum.blockscout.com",
  polygon: "https://polygon.blockscout.com",
};

/** How many holdings to return. Beyond this it is dust, and it is a long tail. */
const MAX_HOLDINGS = 40;

/** Blockscout can stall for a while on a wallet with thousands of entries. */
const UPSTREAM_TIMEOUT_MS = 25_000;

type RawBalance = {
  token?: {
    address_hash?: string;
    address?: string;
    decimals?: string | null;
    exchange_rate?: string | null;
    name?: string | null;
    symbol?: string | null;
    type?: string | null;
  } | null;
  value?: string | null;
};

/**
 * Raw units → a display amount, without ever putting the raw string through
 * `Number`.
 *
 * A token with 18 decimals and a large supply overflows a double's 53 bits of
 * integer precision long before it overflows its range, so the integer part is
 * divided out in `BigInt` and only the remainder — always smaller than one
 * whole token — is turned into a float. `Number(whole)` can still saturate for
 * an absurd balance, which is why `Number.isFinite` guards the result.
 */
function toAmount(raw: string, decimals: number): number {
  let value: bigint;
  try {
    value = BigInt(raw);
  } catch {
    return 0;
  }
  if (value < 0n) return 0;
  const scale = 10n ** BigInt(Math.max(0, Math.min(36, decimals)));
  const whole = Number(value / scale);
  const frac = Number(value % scale) / Number(scale);
  const amount = whole + frac;
  return Number.isFinite(amount) ? amount : 0;
}

function isChain(value: string | null): value is ChainName {
  return value !== null && value in HOSTS;
}

function fail(status: number, error: string, hint: string): Response {
  return Response.json({ error, hint }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const address = (params.get("address") ?? "").trim().toLowerCase();
  const chain = params.get("chain");

  if (!/^0x[0-9a-f]{40}$/.test(address)) {
    return fail(400, "Not a 20-byte hex address.", "Pass ?address=0x… with 40 hex characters.");
  }
  if (!isChain(chain)) {
    return fail(400, `Unsupported chain: ${chain}.`, `One of ${Object.keys(HOSTS).join(", ")}.`);
  }

  const url = `${HOSTS[chain]}/api/v2/addresses/${address}/token-balances`;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]),
      cache: "no-store",
    });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return fail(
      504,
      timedOut
        ? `Blockscout did not answer within ${UPSTREAM_TIMEOUT_MS / 1000}s.`
        : "Could not reach Blockscout.",
      "This is a transient upstream condition, not an empty wallet. Try again in a moment.",
    );
  }

  // 404 means Blockscout genuinely has no record of the address; a 5xx means
  // Blockscout is having a moment. Reporting the second as the first would show
  // a funded wallet as empty, which is the single worst thing this page could do.
  if (upstream.status === 404) {
    return Response.json(
      { chain, address, total: 0, returned: 0, usd_total: 0, priced: 0, holdings: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!upstream.ok) {
    return fail(
      502,
      `Blockscout answered ${upstream.status} for this address.`,
      upstream.status >= 500
        ? "Blockscout 5xx responses are transient — the same URL often answers on a retry."
        : "Check the address and chain.",
    );
  }

  let rows: RawBalance[];
  try {
    const parsed: unknown = await upstream.json();
    rows = Array.isArray(parsed) ? (parsed as RawBalance[]) : [];
  } catch {
    return fail(502, "Blockscout returned a body that was not JSON.", "Try again in a moment.");
  }

  const holdings: Holding[] = [];
  for (const row of rows) {
    const token = row.token;
    // ERC-721 and ERC-1155 ride in the same array. Only fungible balances mean
    // anything here, and only the contract's four chains can be scored anyway.
    if (!token || token.type !== "ERC-20") continue;

    const tokenAddress = (token.address_hash ?? token.address ?? "").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(tokenAddress)) continue;

    const decimals = Number(token.decimals ?? 18);
    const raw = String(row.value ?? "0");
    const amount = toAmount(raw, Number.isFinite(decimals) ? decimals : 18);
    if (amount <= 0) continue;

    const rate = Number(token.exchange_rate ?? NaN);
    holdings.push({
      chain,
      token_address: tokenAddress,
      symbol: token.symbol?.slice(0, 24) || "—",
      name: token.name?.slice(0, 64) || "Unknown token",
      decimals: Number.isFinite(decimals) ? decimals : 18,
      raw,
      amount,
      // `null`, never `0`: an unpriced token is not a worthless one, and
      // folding the two together would misstate how much of the wallet the
      // dollar figure actually covers.
      usd: Number.isFinite(rate) && rate > 0 ? amount * rate : null,
    });
  }

  // Priced holdings first, largest first; unpriced fall to the back in symbol
  // order so the cut-off is at least stable between reloads.
  holdings.sort((a, b) => {
    if (a.usd !== null && b.usd !== null) return b.usd - a.usd;
    if (a.usd !== null) return -1;
    if (b.usd !== null) return 1;
    return a.symbol.localeCompare(b.symbol);
  });

  const kept = holdings.slice(0, MAX_HOLDINGS);
  const priced = kept.filter((row) => row.usd !== null);

  return Response.json(
    {
      chain,
      address,
      total: holdings.length,
      returned: kept.length,
      usd_total: priced.reduce((sum, row) => sum + (row.usd ?? 0), 0),
      priced: priced.length,
      holdings: kept,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
