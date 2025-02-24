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
import { useSolanaConnection } from "@/lib/solanaConnection";

const WalletConnector = () => {
  const { publicKey, connected, disconnect } = useWallet();
  const { user } = useUser();
  const connection = useSolanaConnection();
  const [isLinked, setIsLinked] = useState<boolean>(false);
  const [loadingLinkStatus, setLoadingLinkStatus] = useState<boolean>(true);

  useEffect(() => {
    async function fetchWalletStatus() {
      try {
        const res = await fetch("/api/wallet");
        if (res.ok) {
          const data = await res.json();
          setIsLinked(!!data.walletAddress);
        }
      } catch (error) {
        console.error("Error fetching wallet status:", error);
      } finally {
        setLoadingLinkStatus(false);
      }
    }

    if (user) {
      fetchWalletStatus();
    }
  }, [user]);

  const handleLinkWallet = async () => {
    if (!publicKey) return;
    try {
      const res = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: publicKey.toBase58() }),
      });
      if (res.ok) {
        setIsLinked(true);
      }
    } catch (error) {
      console.error("Error linking wallet:", error);
    }
  };

  const handleUnlinkWallet = async () => {
    try {
      const res = await fetch("/api/wallet", { method: "DELETE" });
      if (res.ok) {
        setIsLinked(false);
        disconnect();
      }
    } catch (error) {
      console.error("Error unlinking wallet:", error);
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
          <WalletBalance />
          
          <div className="flex items-center space-x-2">
            <span className="text-sm font-mono">
              {publicKey.toBase58().slice(0, 8)}...{publicKey.toBase58().slice(-8)}
            </span>
            <button 
              onClick={handleCopyAddress}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              title="Copy full address"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>

          {!loadingLinkStatus && (
            isLinked ? (
              <button 
                onClick={handleUnlinkWallet} 
                className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              >
                Unlink Wallet
              </button>
            ) : (
              <button 
                onClick={handleLinkWallet} 
                className="px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
              >
                Link Wallet
              </button>
            )
          )}
        </>
      ) : (
        <WalletMultiButton />
      )}
    </div>
  );
};

export default WalletConnector;
