"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Logomark } from "./Logomark";
import { ConnectWallet } from "./ConnectWallet";
import { NETWORK_LABEL } from "@/lib/genlayer";

const NAV = [
  { href: "/scan", label: "Scan" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/explore", label: "Explore" },
  { href: "/compare", label: "Compare" },
  { href: "/docs", label: "Docs" },
];

export function AppHeader({ showWallet = true }: { showWallet?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 text-ink-600">
          <Logomark size={26} />
          <span className="text-[17px] font-semibold tracking-tight text-ink-900">
            TokenScope
          </span>
        </Link>

        <nav className="ml-4 hidden items-center gap-0.5 lg:flex">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-2.5 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-ink-50 text-ink-900"
                    : "text-ink-500 hover:bg-ink-50 hover:text-ink-800"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden rounded-full border border-hairline px-2.5 py-1 text-[11px] font-medium text-ink-500 sm:inline">
            {NETWORK_LABEL}
          </span>
          {showWallet ? (
            <div className="hidden sm:block">
              <ConnectWallet compact />
            </div>
          ) : (
            <Link
              href="/scan"
              className="hidden rounded-lg bg-ink-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-ink-700 sm:inline-block"
            >
              Scan a token
            </Link>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg p-2 text-ink-600 transition hover:bg-ink-50 lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-hairline bg-surface px-4 py-3 lg:hidden">
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-700 transition hover:bg-ink-50"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 sm:hidden">
            <ConnectWallet />
          </div>
        </div>
      ) : null}
    </header>
  );
}
