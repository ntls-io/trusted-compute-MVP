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
import { useUser } from "@clerk/nextjs";
import { Copy } from "lucide-react";
import WalletBalance from "@/components/WalletBalance"; 
import { Connection, clusterApiUrl } from "@solana/web3.js";

const WalletConnector = () => {
  const { publicKey, connected, disconnect } = useWallet();
  const { user } = useUser();
  const [isLinked, setIsLinked] = useState<boolean>(false);
  const [loadingLinkStatus, setLoadingLinkStatus] = useState<boolean>(true);

  const connection = new Connection(clusterApiUrl("devnet"));

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

  // Add listener for transactions affecting the wallet
  useEffect(() => {
    if (!publicKey || !connected) return;

    const listenerId = connection.onAccountChange(publicKey, () => {
      console.log("🔄 Wallet transaction detected! Refreshing balance...");
      window.dispatchEvent(new Event("walletTransaction")); // Dispatch event for balance update
    });

    return () => {
      connection.removeAccountChangeListener(listenerId);
    };
  }, [publicKey, connected]);

  // Call API to link wallet
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

  // Unlink wallet (and optionally disconnect)
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
          {/* Display SOL balance using WalletBalance component */}
          <WalletBalance />

          {/* Display wallet address */}
          <div className="flex items-center space-x-2">
            <span className="text-sm font-mono">
              {publicKey.toBase58().slice(0, 8) + "..." + publicKey.toBase58().slice(-8)}
            </span>
            <button 
              onClick={handleCopyAddress}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              title="Copy full address"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>

          {/* Link/Unlink wallet */}
          {!loadingLinkStatus && !isLinked && (
            <button onClick={handleLinkWallet} className="px-2 py-1 bg-green-500 text-white rounded">
              Link Wallet
            </button>
          )}
          {!loadingLinkStatus && isLinked && (
            <button onClick={handleUnlinkWallet} className="px-2 py-1 bg-red-500 text-white rounded">
              Unlink Wallet
            </button>
          )}
        </>
      ) : (
        <WalletMultiButton />
      )}
    </div>
  );
};

export default WalletConnector;
