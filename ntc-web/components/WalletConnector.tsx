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

// components/WalletConnector.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Connection, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useUser } from "@clerk/nextjs";
import { Copy } from "lucide-react";

const WalletConnector = () => {
  const { publicKey, connected, disconnect } = useWallet();
  const { user } = useUser();
  const [balance, setBalance] = useState<number | null>(null);
  const [isLinked, setIsLinked] = useState<boolean>(false);
  const [loadingLinkStatus, setLoadingLinkStatus] = useState<boolean>(true);

  // Fetch the current wallet link status from your API
  useEffect(() => {
    async function fetchWalletStatus() {
      const res = await fetch("/api/wallet");
      if (res.ok) {
        const data = await res.json();
        setIsLinked(!!data.walletAddress);
      }
      setLoadingLinkStatus(false);
    }
    if (user) {
      fetchWalletStatus();
    }
  }, [user]);

  // When a wallet is connected, get its balance from devnet
  useEffect(() => {
    if (publicKey) {
      const connection = new Connection(clusterApiUrl("devnet"));
      connection.getBalance(publicKey).then((lamports) => {
        setBalance(lamports / LAMPORTS_PER_SOL);
      });
    }
  }, [publicKey]);

  // Call your API to link the wallet address to the user
  const handleLinkWallet = async () => {
    if (!publicKey) return;
    const res = await fetch("/api/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: publicKey.toBase58() }),
    });
    if (res.ok) {
      setIsLinked(true);
    }
  };

  // Unlink the wallet (and optionally disconnect the adapter)
  const handleUnlinkWallet = async () => {
    const res = await fetch("/api/wallet", { method: "DELETE" });
    if (res.ok) {
      setIsLinked(false);
      disconnect();
    }
  };

  const handleCopyAddress = () => {
    if (publicKey) {
      navigator.clipboard.writeText(publicKey.toBase58());
    }
  };

  return (
    <div className="flex items-center space-x-4">
      {connected && publicKey ? (
        <>
          {/* Display SOL balance */}
          <span className="text-sm">
            <span className="font-bold">
              {balance !== null ? `${balance.toFixed(2)} SOL` : "Loading balance..."}
            </span>
          </span>

          {/* Display a truncated wallet address with copy button */}
          <div className="flex items-center space-x-2">
            <span className="text-sm font-mono">
              {publicKey.toBase58().slice(0, 8) +
                "..." +
                publicKey.toBase58().slice(-8)}
            </span>
            <button 
              onClick={handleCopyAddress}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              title="Copy full address"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>

          {/* Show a button to link or unlink the wallet */}
          {!loadingLinkStatus && !isLinked && (
            <button
              onClick={handleLinkWallet}
              className="px-2 py-1 bg-green-500 text-white rounded"
            >
              Link Wallet
            </button>
          )}
          {!loadingLinkStatus && isLinked && (
            <button
              onClick={handleUnlinkWallet}
              className="px-2 py-1 bg-red-500 text-white rounded"
            >
              Unlink Wallet
            </button>
          )}
        </>
      ) : (
        // If not connected, show the wallet connection button provided by the adapter UI.
        <WalletMultiButton />
      )}
    </div>
  );
};

export default WalletConnector;