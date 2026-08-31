"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Search, TriangleAlert } from "lucide-react";
import { ChainSelector } from "./ChainSelector";
import { ScoreCard } from "./ScoreCard";
import { ConnectWallet } from "./ConnectWallet";
import { useWallet } from "./WalletProvider";
import {
  describeWriteError,
  getConfig,
  getRisk,
  requestRisk,
  waitForScan,
} from "@/lib/contract";
import { extractAddress } from "@/lib/format";
import { chainMeta } from "@/lib/risk";
import type { ChainName, RiskRecord } from "@/types";

type Phase =
  | { kind: "idle" }
  | { kind: "looking" }
  | { kind: "existing"; record: RiskRecord }
  | { kind: "signing" }
  | { kind: "validating"; startedAt: number }
  | { kind: "done"; record: RiskRecord }
  | { kind: "error"; message: string };

/** The steps shown while a consensus round runs, with the reason for each wait. */
const PROGRESS_STEPS = [
  "Submitting the request on-chain",
  "Validators fetching the token record from Blockscout",
  "Reading the verified ABI for mint, pause and blacklist functions",
  "Bucketing every metric into the feature vector",
  "Comparing vectors — every node must match exactly",
  "Writing the agreed score to storage",
];

export function ScanForm({ initialChain = "ethereum" }: { initialChain?: ChainName }) {
  const { account, chainOk } = useWallet();
  const [input, setInput] = useState("");
  const [chain, setChain] = useState<ChainName>(initialChain);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [step, setStep] = useState(0);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  /**
   * Walks the progress copy while the round runs. Cosmetic, and honest about it.
   *
   * The counter is reset where the phase is SET rather than here: a synchronous
   * setState in an effect body triggers a second render pass before paint, and
   * the reset has a perfectly good home in `scan()` where the transition
   * actually happens.
   */
  useEffect(() => {
    if (phase.kind !== "validating") return;
    const timer = setInterval(
      () => setStep((s) => Math.min(s + 1, PROGRESS_STEPS.length - 1)),
      7000,
    );
    return () => clearInterval(timer);
  }, [phase.kind]);

  const address = extractAddress(input);
  const meta = chainMeta(chain);

  /** Look for an existing record as soon as a valid address is typed. */
  const lookup = useCallback(
    async (token: string, on: ChainName) => {
      setPhase({ kind: "looking" });
      try {
        const record = await getRisk(token, on);
        setPhase(record ? { kind: "existing", record } : { kind: "idle" });
      } catch {
        setPhase({ kind: "idle" });
      }
    },
    [],
  );

  useEffect(() => {
    if (!address) return;
    if (phase.kind === "signing" || phase.kind === "validating") return;
    const timer = setTimeout(() => void lookup(address, chain), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, chain]);

  async function scan() {
    if (!address || !account) return;
    const previous =
      phase.kind === "existing" ? phase.record.scored_at : 0;

    setPhase({ kind: "signing" });
    abort.current?.abort();
    abort.current = new AbortController();

    try {
      // The fee is read rather than assumed: it is owner-settable within
      // 0..0.1 GEN, and these demo deployments run at 0.
      let fee = 0n;
      try {
        const config = await getConfig();
        fee = BigInt(String(config.fee_wei ?? 0));
      } catch {
        fee = 0n;
      }

      await requestRisk(account, address, chain, fee);
      setStep(0);
      setPhase({ kind: "validating", startedAt: Date.now() });

      const record = await waitForScan(address, chain, previous, {
        signal: abort.current.signal,
      });

      if (record) {
        setPhase({ kind: "done", record });
      } else {
        setPhase({
          kind: "error",
          message: meta.healthy
            ? "The round did not settle in time. The transaction may still land — try looking the token up again in a minute."
            : `${meta.label}'s data source is degraded, so this round cannot settle. ${meta.note ?? ""}`,
        });
      }
    } catch (error) {
      if ((error as Error)?.message === "aborted") return;
      setPhase({ kind: "error", message: describeWriteError(error) });
    }
  }

  const busy = phase.kind === "signing" || phase.kind === "validating";
  const shown =
    phase.kind === "done"
      ? phase.record
      : phase.kind === "existing"
        ? phase.record
        : null;

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-hairline bg-surface p-6 shadow-card">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label
              htmlFor="token"
              className="mb-1.5 block text-sm font-medium text-ink-800"
            >
              Token contract address
            </label>
            <input
              id="token"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="0xdAC17F958D2ee523a2206206994597C13D831ec7"
              spellCheck={false}
              autoComplete="off"
              disabled={busy}
              className="w-full rounded-xl border border-hairline bg-canvas px-4 py-3 font-mono text-sm text-ink-900 outline-none transition placeholder:text-ink-300 focus:border-ink-400 disabled:opacity-60"
            />
          </div>

          <div className="sm:w-52">
            <label
              htmlFor="chain"
              className="mb-1.5 block text-sm font-medium text-ink-800"
            >
              Chain
            </label>
            <ChainSelector value={chain} onChange={setChain} />
          </div>
        </div>

        {input && !address ? (
          <p className="mt-2.5 text-xs text-danger-600">
            That is not a 42-character 0x address. Paste the contract address, or an
            explorer URL ending in one.
          </p>
        ) : null}

        {!meta.healthy ? (
          <div className="mt-4 flex gap-2.5 rounded-xl border border-warn-500/25 bg-warn-50 p-3.5">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn-600" aria-hidden />
            <p className="text-xs leading-relaxed text-warn-700">
              <span className="font-semibold">{meta.label} scans cannot settle.</span>{" "}
              {meta.note} The contract refuses and refunds rather than scoring on
              partial evidence — reads on already-scored tokens still work.
            </p>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {account ? (
            <button
              type="button"
              onClick={scan}
              disabled={!address || busy || !chainOk}
              className="inline-flex items-center gap-2 rounded-xl bg-ink-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Search className="size-4" aria-hidden />
              )}
              {phase.kind === "signing"
                ? "Confirm in wallet…"
                : phase.kind === "validating"
                  ? "Validators working…"
                  : phase.kind === "existing"
                    ? "Re-scan this token"
                    : "Scan token"}
            </button>
          ) : (
            <>
              <ConnectWallet />
              <span className="text-xs text-ink-500">
                Connect a wallet to run a new scan. Reading existing scores needs no
                wallet.
              </span>
            </>
          )}

          {phase.kind === "looking" ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-500">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Checking for an existing score…
            </span>
          ) : null}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {phase.kind === "validating" ? (
          <motion.div
            key="progress"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl border border-hairline bg-surface p-6 shadow-card"
          >
            <div className="flex items-center gap-2.5">
              <Loader2 className="size-4 animate-spin text-ink-500" aria-hidden />
              <p className="text-sm font-semibold text-ink-900">
                Consensus round in progress
              </p>
            </div>
            <p className="mt-1.5 text-xs text-ink-500">
              Each validator independently fetches and buckets the same evidence. This
              usually takes 30–90 seconds.
            </p>

            <ol className="mt-5 space-y-2.5">
              {PROGRESS_STEPS.map((label, i) => {
                const state = i < step ? "done" : i === step ? "active" : "todo";
                return (
                  <li key={label} className="flex items-start gap-2.5">
                    <span
                      className={`mt-1 size-2 shrink-0 rounded-full ${
                        state === "done"
                          ? "bg-safe-500"
                          : state === "active"
                            ? "animate-pulse bg-ink-500"
                            : "bg-ink-200"
                      }`}
                      aria-hidden
                    />
                    <span
                      className={`text-xs leading-relaxed ${
                        state === "todo" ? "text-ink-400" : "text-ink-700"
                      }`}
                    >
                      {label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </motion.div>
        ) : null}

        {phase.kind === "error" ? (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex gap-3 rounded-2xl border border-danger-500/25 bg-danger-50 p-5"
          >
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger-600" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-danger-700">
                The scan did not complete
              </p>
              <p className="mt-1 text-xs leading-relaxed text-danger-700/80">
                {phase.message}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {shown ? (
        <div className="space-y-3">
          {phase.kind === "existing" ? (
            <p className="text-xs text-ink-500">
              This token already has a score. Re-scanning runs a fresh consensus round
              and appends to its history.
            </p>
          ) : null}
          <ScoreCard record={shown} />
        </div>
      ) : null}
    </div>
  );
}
