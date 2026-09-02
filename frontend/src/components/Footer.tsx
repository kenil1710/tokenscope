import Link from "next/link";
import { Logomark } from "./Logomark";
import { CONTRACT_ADDRESS, NETWORK_LABEL, explorerUrl } from "@/lib/genlayer";
import { shortAddress } from "@/lib/format";

export function Footer() {
  return (
    <footer className="border-t border-hairline bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          <div className="max-w-sm">
            <Link href="/" className="flex items-center gap-2.5 text-ink-600">
              <Logomark size={24} />
              <span className="text-base font-semibold text-ink-900">TokenScope</span>
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-ink-500">
              On-chain, multi-chain ERC-20 risk assessment. Validators agree on a
              feature vector of 29 bucketed ordinals — never on a score — so every
              number is reproducible arithmetic that anyone can re-check.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                Product
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link href="/scan" className="text-ink-600 hover:text-ink-900">Scan a token</Link></li>
                <li><Link href="/explore" className="text-ink-600 hover:text-ink-900">Explore</Link></li>
                <li><Link href="/compare" className="text-ink-600 hover:text-ink-900">Compare</Link></li>
                <li><Link href="/portfolio" className="text-ink-600 hover:text-ink-900">Portfolio</Link></li>
                <li><Link href="/watchlist" className="text-ink-600 hover:text-ink-900">Watchlist</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                Learn
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link href="/docs" className="text-ink-600 hover:text-ink-900">How it works</Link></li>
                <li><Link href="/docs#dimensions" className="text-ink-600 hover:text-ink-900">The five dimensions</Link></li>
                <li><Link href="/docs/api" className="text-ink-600 hover:text-ink-900">Developer API</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                Contract
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <a
                    href={explorerUrl("address", CONTRACT_ADDRESS)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-ink-600 hover:text-ink-900"
                  >
                    {shortAddress(CONTRACT_ADDRESS)}
                  </a>
                </li>
                <li className="text-ink-500">{NETWORK_LABEL}</li>
                <li>
                  <a
                    href="https://github.com/kenil1710/tokenscope"
                    target="_blank"
                    rel="noreferrer"
                    className="text-ink-600 hover:text-ink-900"
                  >
                    Source on GitHub
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-hairline pt-6">
          <p className="text-xs leading-relaxed text-ink-400">
            TokenScope reports what public on-chain data shows. A high score is not
            investment advice and a clean report is not a guarantee — an oracle can only
            see what the explorer publishes. Always do your own research.
          </p>
        </div>
      </div>
    </footer>
  );
}
