"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * A code sample with a copy button.
 *
 * No syntax highlighter: every one of them ships a tokenizer plus a grammar per
 * language, which on this page would outweigh the samples themselves several
 * times over. Monospace on a dark ground is enough structure for ten-line
 * snippets, and it stays legible if the JavaScript never loads.
 */
export function CodeBlock({
  code,
  language,
  caption,
}: {
  code: string;
  language?: string;
  caption?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused (insecure origin, denied permission).
      // The code is selectable either way, so there is nothing to recover.
    }
  }

  return (
    <figure className="mt-3">
      <div className="group relative overflow-hidden rounded-xl bg-ink-900">
        {language ? (
          <span className="absolute left-3 top-2.5 font-mono text-[10px] uppercase tracking-wider text-ink-400">
            {language}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={copied ? "Copied" : "Copy to clipboard"}
          className="absolute right-2 top-2 rounded-lg p-1.5 text-ink-300 transition hover:bg-ink-800 hover:text-white"
        >
          {copied ? (
            <Check className="size-3.5 text-safe-500" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
        </button>
        <pre className={`overflow-x-auto p-4 ${language ? "pt-7" : ""} font-mono text-[11.5px] leading-relaxed text-ink-100`}>
          <code>{code}</code>
        </pre>
      </div>
      {caption ? (
        <figcaption className="mt-2 text-xs leading-relaxed text-ink-500">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
