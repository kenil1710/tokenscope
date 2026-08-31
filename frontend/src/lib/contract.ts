/**
 * Typed access to the deployed TokenScope contract.
 *
 * Two things worth knowing before reading further:
 *
 *  1. **Views return objects, not JSON strings.** TokenScope's `@gl.public.view`
 *     methods are annotated `-> typing.Any` and return dicts, and `genlayer-js`
 *     hands back a parsed structure. So there is no `JSON.parse` anywhere here.
 *
 *  2. **`request_risk` does not throw.** It is payable, and a payable call that
 *     raises keeps the deposit with no record to refund it from — so every
 *     refusal comes back as `{status: "REJECTED", reason}` with the fee
 *     credited. The UI must read `status`, not catch.
 */
import { CONTRACT_ADDRESS, getReadClient, getWalletClient } from "./genlayer";
import type {
  BadgeReport,
  ChainName,
  Comparison,
  ComparisonMissing,
  Config,
  Evidence,
  Leaderboard,
  RiskHistory,
  RiskRecord,
  RiskTrend,
  RugReport,
  Stats,
  TrackedTokens,
  Verification,
} from "@/types";

export type TransactionHash = `0x${string}`;

/** A read that failed, with enough context to show the user something useful. */
export class ContractReadError extends Error {
  constructor(
    readonly method: string,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ContractReadError";
  }
}

/**
 * Every read is budgeted. Studio can sit on a `gen_call` for a long time under
 * load, and a page that waits forever looks broken in a way a timeout does not.
 */
const READ_TIMEOUT_MS = 30_000;

async function read<T>(method: string, args: unknown[] = []): Promise<T> {
  try {
    const result = await Promise.race([
      getReadClient().readContract({
        address: CONTRACT_ADDRESS,
        functionName: method,
        // The SDK's CalldataEncodable union doesn't describe our arg shapes;
        // the contract's own signature is the real check here.
        args: args as never,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`timed out after ${READ_TIMEOUT_MS / 1000}s`)),
          READ_TIMEOUT_MS,
        ),
      ),
    ]);
    return result as T;
  } catch (error) {
    throw new ContractReadError(
      method,
      `Could not read ${method} from the contract. Check your connection and that the network is up.`,
      error,
    );
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

/**
 * The latest risk record for a token, or `null` when it was never scored.
 *
 * `found: false` is a normal answer, not an error: most addresses have never
 * been through a consensus round, and the UI should offer to scan rather than
 * show a failure.
 */
export async function getRisk(
  token: string,
  chain: ChainName,
): Promise<RiskRecord | null> {
  const payload = await read<RiskRecord | { found: false }>("get_risk", [token, chain]);
  return payload.found ? (payload as RiskRecord) : null;
}

export async function getRiskById(scoreId: number): Promise<RiskRecord | null> {
  const payload = await read<RiskRecord | { found: false }>("get_risk_by_id", [scoreId]);
  return payload.found ? (payload as RiskRecord) : null;
}

export function getRiskHistory(
  token: string,
  chain: ChainName,
  count = 12,
): Promise<RiskHistory> {
  return read<RiskHistory>("get_risk_history", [token, chain, count]);
}

export function getRiskTrend(token: string, chain: ChainName): Promise<RiskTrend> {
  return read<RiskTrend>("get_risk_trend", [token, chain]);
}

export function getBadge(token: string, chain: ChainName): Promise<BadgeReport> {
  return read<BadgeReport>("get_badge", [token, chain]);
}

export function checkRugPull(token: string, chain: ChainName): Promise<RugReport> {
  return read<RugReport>("check_rug_pull", [token, chain]);
}

export function compareTokens(
  a: string,
  b: string,
  chain: ChainName,
): Promise<Comparison | ComparisonMissing> {
  return read<Comparison | ComparisonMissing>("compare_tokens", [a, b, chain]);
}

export function getSafestTokens(chain: ChainName, count = 20): Promise<Leaderboard> {
  return read<Leaderboard>("get_safest_tokens", [chain, count]);
}

export function getRiskiestTokens(chain: ChainName, count = 20): Promise<Leaderboard> {
  return read<Leaderboard>("get_riskiest_tokens", [chain, count]);
}

export function verifyRisk(scoreId: number): Promise<Verification> {
  return read<Verification>("verify_risk", [scoreId]);
}

export function getEvidence(scoreId: number): Promise<Evidence> {
  return read<Evidence>("get_evidence", [scoreId]);
}

export function getStats(): Promise<Stats> {
  return read<Stats>("get_stats");
}

export function getConfig(): Promise<Config> {
  return read<Config>("get_config");
}

export function getTrackedTokens(): Promise<TrackedTokens> {
  return read<TrackedTokens>("get_tracked_tokens");
}

/**
 * Every token the contract knows about, as `{chain, address}` pairs.
 *
 * `get_tracked_tokens` returns storage keys of the form `chain:0xaddress`,
 * which is an implementation detail the UI should not have to know.
 */
export async function listTrackedTokens(): Promise<
  { chain: ChainName; address: string }[]
> {
  const { keys } = await getTrackedTokens();
  const out: { chain: ChainName; address: string }[] = [];
  for (const key of keys ?? []) {
    const at = key.indexOf(":");
    if (at <= 0) continue;
    out.push({
      chain: key.slice(0, at) as ChainName,
      address: key.slice(at + 1),
    });
  }
  return out;
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * Request a risk assessment. Payable.
 *
 * Returns a transaction hash; the result arrives once consensus settles, which
 * is what `waitForScan` below polls for. Note the contract answers a refusal as
 * a RETURN VALUE rather than a revert, so a settled transaction can still carry
 * `status: "REJECTED"` — see `readScanResult`.
 */
export async function requestRisk(
  account: `0x${string}`,
  token: string,
  chain: ChainName,
  fee: bigint,
): Promise<TransactionHash> {
  return getWalletClient(account).writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "request_risk",
    args: [token, chain] as never,
    value: fee,
  }) as Promise<TransactionHash>;
}

// ── Polling ──────────────────────────────────────────────────────────────────

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("aborted"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });

export type ScanPhase =
  | "signing"
  | "submitted"
  | "validating"
  | "settled"
  | "rejected"
  | "timeout";

/**
 * Waits for a scored record to appear for this token.
 *
 * Polls `get_risk` rather than the transaction receipt, and deliberately so:
 * the useful end state is "a record exists that is newer than when I asked",
 * which is exactly what the page then renders. Watching the receipt would tell
 * us the transaction settled without telling us whether it produced a score —
 * a refusal settles just as successfully as a scan.
 *
 * `since` is the `scored_at` of whatever record existed before the request (0
 * when there was none), so a token that was already scored does not report the
 * old record as this scan's result.
 */
export async function waitForScan(
  token: string,
  chain: ChainName,
  since: number,
  options: {
    signal?: AbortSignal;
    onPhase?: (phase: ScanPhase) => void;
    timeoutMs?: number;
    intervalMs?: number;
  } = {},
): Promise<RiskRecord | null> {
  const { signal, onPhase, timeoutMs = 240_000, intervalMs = 4_000 } = options;
  const deadline = Date.now() + timeoutMs;
  onPhase?.("validating");

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error("aborted");
    try {
      const record = await getRisk(token, chain);
      if (record && record.scored_at > since) {
        onPhase?.("settled");
        return record;
      }
    } catch {
      // A read failing mid-poll is usually the rate limiter or a slow node,
      // neither of which means the scan failed. Keep waiting for the deadline.
    }
    await sleep(intervalMs, signal);
  }

  onPhase?.("timeout");
  return null;
}

/**
 * Turns whatever went wrong into something worth showing a person.
 *
 * The wallet's own rejection is the common case and should never read like a
 * fault; everything else keeps its message, trimmed.
 */
export function describeWriteError(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const code = (error as { code?: number })?.code;

  if (code === 4001 || /user rejected|user denied/i.test(raw)) {
    return "You cancelled the transaction in your wallet.";
  }
  if (/insufficient funds/i.test(raw)) {
    return "Not enough GEN in this wallet to cover the fee.";
  }
  if (/rate limit/i.test(raw)) {
    return "The RPC rate limit was hit. Wait a moment and try again.";
  }
  if (/chain|network/i.test(raw) && /mismatch|wrong/i.test(raw)) {
    return "Your wallet is on a different network. Switch it and try again.";
  }
  if (!raw) return "The transaction could not be sent.";
  return raw.length > 220 ? `${raw.slice(0, 220)}…` : raw;
}
