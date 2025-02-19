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

"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";

const WalletBalance = () => {
  const { publicKey, connected } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);
  const connection = new Connection(clusterApiUrl("devnet"));

  // Function to fetch wallet balance
  const fetchBalance = async () => {
    if (!publicKey) return;
    try {
      const lamports = await connection.getBalance(publicKey);
      setBalance(lamports / LAMPORTS_PER_SOL);
    } catch (error) {
      console.error("Error fetching balance:", error);
    }
  };

  // Fetch balance when the component mounts or wallet connects
  useEffect(() => {
    if (connected && publicKey) {
      fetchBalance();
    }
  }, [connected, publicKey]);

  // Listen for wallet transactions and refresh balance
  useEffect(() => {
    const handleWalletTransaction = () => {
      console.log("Wallet transaction detected, refreshing balance...");
      fetchBalance();
    };

    window.addEventListener("walletTransaction", handleWalletTransaction);
    return () => {
      window.removeEventListener("walletTransaction", handleWalletTransaction);
    };
  }, []);

  return (
    <span className="text-sm font-bold">
      {balance !== null ? `${balance.toFixed(2)} SOL` : "Loading..."}
    </span>
  );
};

export default WalletBalance;
