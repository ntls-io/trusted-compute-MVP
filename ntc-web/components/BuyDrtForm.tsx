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

// components/BuyDrtForm.tsx
"use client";

import React, { useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { useDrtProgram } from "@/lib/useDrtProgram";
import { buyDrt } from "@/lib/drtHelpers";
import { PublicKey } from "@solana/web3.js";

const BuyDrtForm = () => {
  const program = useDrtProgram();
  const [poolAddress, setPoolAddress] = useState("");
  const [drtMintAddress, setDrtMintAddress] = useState("");
  const [vaultDrtTokenAccount, setVaultDrtTokenAccount] = useState("");
  const [userDrtTokenAccount, setUserDrtTokenAccount] = useState("");
  const [fee, setFee] = useState(1000);
  const [status, setStatus] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!program) {
      setStatus("Program not loaded.");
      return;
    }
    try {
      setStatus("Buying DRT...");
      await buyDrt(
        program,
        new PublicKey(poolAddress),
        new PublicKey(drtMintAddress),
        new PublicKey(vaultDrtTokenAccount),
        new PublicKey(userDrtTokenAccount),
        // We assume the vault and feeVault addresses are derived or known.
        // For demo, we use the same as poolAddress (replace with real ones).
        new PublicKey(poolAddress),
        new PublicKey(poolAddress),
        new BN(fee)
      );
      setStatus("Buy DRT succeeded.");
    } catch (error: any) {
      console.error(error);
      setStatus(`Error: ${error.message}`);
    }
  };

  return (
    <div className="p-4 border rounded shadow mb-4">
      <h2 className="text-xl font-bold mb-2">Buy DRT</h2>
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="text"
          placeholder="Pool Address"
          value={poolAddress}
          onChange={(e) => setPoolAddress(e.target.value)}
          className="border p-1 rounded w-full"
          required
        />
        <input
          type="text"
          placeholder="DRT Mint Address"
          value={drtMintAddress}
          onChange={(e) => setDrtMintAddress(e.target.value)}
          className="border p-1 rounded w-full"
          required
        />
        <input
          type="text"
          placeholder="Vault DRT Token Account"
          value={vaultDrtTokenAccount}
          onChange={(e) => setVaultDrtTokenAccount(e.target.value)}
          className="border p-1 rounded w-full"
          required
        />
        <input
          type="text"
          placeholder="User DRT Token Account"
          value={userDrtTokenAccount}
          onChange={(e) => setUserDrtTokenAccount(e.target.value)}
          className="border p-1 rounded w-full"
          required
        />
        <input
          type="number"
          placeholder="Fee (in BN units)"
          value={fee}
          onChange={(e) => setFee(Number(e.target.value))}
          className="border p-1 rounded w-full"
          required
        />
        <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded">
          Buy DRT
        </button>
      </form>
      {status && <p className="mt-2 text-sm">{status}</p>}
    </div>
  );
};

export default BuyDrtForm;