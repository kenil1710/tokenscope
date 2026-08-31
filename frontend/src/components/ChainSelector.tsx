"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, TriangleAlert } from "lucide-react";
import { ChainMark } from "./ChainMark";
import { CHAINS, chainMeta } from "@/lib/risk";
import type { ChainName } from "@/types";

/**
 * Chain picker.
 *
 * Unhealthy chains stay selectable rather than being disabled: the contract
 * will still answer for them, and hiding the option would leave someone
 * wondering why the chain they hold tokens on is missing. What they get instead
 * is the reason, before they spend a transaction on it.
 */
export function ChainSelector({
  value,
  onChange,
  id = "chain",
}: {
  value: ChainName;
  onChange: (chain: ChainName) => void;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const selected = chainMeta(value);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-hairline bg-surface px-4 py-3 text-left shadow-card transition hover:border-ink-300"
      >
        <span className="flex items-center gap-2.5">
          <ChainMark chain={selected.id} size={20} />
          <span className="text-sm font-medium text-ink-900">{selected.label}</span>
          {!selected.healthy ? (
            <TriangleAlert className="size-4 text-warn-600" aria-hidden />
          ) : null}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-ink-400 transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <ul
          role="listbox"
          className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-hairline bg-surface p-1 shadow-lift"
        >
          {CHAINS.map((chain) => (
            <li key={chain.id}>
              <button
                type="button"
                role="option"
                aria-selected={chain.id === value}
                onClick={() => {
                  onChange(chain.id);
                  setOpen(false);
                }}
                className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition hover:bg-ink-50"
              >
                <ChainMark chain={chain.id} size={20} className="mt-0.5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-900">
                      {chain.label}
                    </span>
                    {!chain.healthy ? (
                      <span className="rounded bg-warn-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warn-700">
                        Degraded
                      </span>
                    ) : null}
                  </span>
                  {chain.note ? (
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-500">
                      {chain.note}
                    </span>
                  ) : null}
                </span>
                {chain.id === value ? (
                  <Check className="mt-0.5 size-4 shrink-0 text-ink-600" aria-hidden />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
