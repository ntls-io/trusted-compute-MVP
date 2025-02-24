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

// components/WalletBalance.tsx
"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useSolanaConnection } from "@/lib/solanaConnection";

const WalletBalance = () => {
  const { publicKey, connected } = useWallet();
  const connection = useSolanaConnection();
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchBalance = async () => {
    if (!publicKey || !connection) return;
    
    setIsLoading(true);
    try {
      const lamports = await connection.getBalance(publicKey);
      setBalance(lamports / LAMPORTS_PER_SOL);
    } catch (error) {
      console.error("Error fetching balance:", error);
      setBalance(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (connected && publicKey) {
      fetchBalance();

      // Subscribe to account changes
      const subscriptionId = connection.onAccountChange(
        publicKey,
        () => {
          console.log("Balance update detected");
          fetchBalance();
        },
        "confirmed"
      );

      return () => {
        connection.removeAccountChangeListener(subscriptionId);
      };
    }
  }, [connected, publicKey, connection]);

  return (
    <span className="text-sm font-bold">
      {isLoading ? (
        "Loading..."
      ) : balance !== null ? (
        `${balance.toFixed(2)} SOL`
      ) : (
        "Error loading balance"
      )}
    </span>
  );
};

export default WalletBalance;
