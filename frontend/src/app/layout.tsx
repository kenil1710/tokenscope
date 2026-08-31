import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/components/WalletProvider";

export const metadata: Metadata = {
  title: {
    default: "TokenScope — on-chain ERC-20 risk assessment",
    template: "%s · TokenScope",
  },
  description:
    "Is that token safe? TokenScope scores any ERC-20 across Ethereum, Base, Arbitrum and Polygon — distribution, activity, verification, maturity and liquidity — with rug-pull detection read straight from the verified ABI.",
  openGraph: {
    title: "TokenScope — is that token safe?",
    description:
      "On-chain, multi-chain ERC-20 risk assessment. Validators agree on a feature vector, never on a score.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
