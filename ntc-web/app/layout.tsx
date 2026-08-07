/**
 * Nautilus Trusted Compute
 * Copyright (C) 2025 Nautilus
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// ntc-web/app/layout.tsx
"use client";

import { useMemo } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter } from "next/font/google";
import "./globals.css";

// Wallet adapter imports:
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { clusterApiUrl } from "@solana/web3.js";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";

// Default styles
import "@solana/wallet-adapter-react-ui/styles.css";
import { SOLANA_ENDPOINT } from "@/lib/config";

import LayoutClient from "./LayoutClient";
import { Show, RedirectToSignIn } from "@clerk/nextjs";
import { usePathname } from "next/navigation";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Cluster comes from lib/config.ts: this is the RPC the whole app uses via
  // ConnectionProvider, and it must match the cluster named in the
  // wallet-signed chain claim that the enclave verifies.
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => SOLANA_ENDPOINT, []);
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(), 
      new SolflareWalletAdapter({ network })
    ],
    [network]
  );

  const pathname = usePathname() ?? "";
  const isAuthPage = pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");

  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className={inter.className} suppressHydrationWarning>
          <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
              <WalletModalProvider>
                <div id="app-root">
                  {isAuthPage ? (
                    children
                  ) : (
                    <>
                      <Show when="signed-in">
                        <LayoutClient>{children}</LayoutClient>
                      </Show>
                      <Show when="signed-out">
                        <RedirectToSignIn />
                      </Show>
                    </>
                  )}
                </div>
              </WalletModalProvider>
            </WalletProvider>
          </ConnectionProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
