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

// components/RedeemDrtForm.tsx
"use client";

import React, { useState } from "react";
import { useDrtProgram } from "@/lib/useDrtProgram";
import { redeemDrt } from "@/lib/drtHelpers";
import { PublicKey } from "@solana/web3.js";

const RedeemDrtForm = () => {
  const program = useDrtProgram();
  const [poolAddress, setPoolAddress] = useState("");
  const [drtMintAddress, setDrtMintAddress] = useState("");
  const [ownershipMintAddress, setOwnershipMintAddress] = useState("");
  const [userDrtTokenAccount, setUserDrtTokenAccount] = useState("");
  const [userOwnershipTokenAccount, setUserOwnershipTokenAccount] = useState("");
  const [status, setStatus] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!program) {
      setStatus("Program not loaded.");
      return;
    }
    try {
      setStatus("Redeeming DRT...");
      await redeemDrt(
        program,
        new PublicKey(poolAddress),
        new PublicKey(drtMintAddress),
        new PublicKey(ownershipMintAddress),
        new PublicKey(userDrtTokenAccount),
        new PublicKey(userOwnershipTokenAccount)
      );
      setStatus("Redeem DRT succeeded.");
    } catch (error: any) {
      console.error(error);
      setStatus(`Error: ${error.message}`);
    }
  };

  return (
    <div className="p-4 border rounded shadow mb-4">
      <h2 className="text-xl font-bold mb-2">Redeem DRT</h2>
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
          placeholder="Ownership Mint Address"
          value={ownershipMintAddress}
          onChange={(e) => setOwnershipMintAddress(e.target.value)}
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
          type="text"
          placeholder="User Ownership Token Account"
          value={userOwnershipTokenAccount}
          onChange={(e) => setUserOwnershipTokenAccount(e.target.value)}
          className="border p-1 rounded w-full"
          required
        />
        <button type="submit" className="px-4 py-2 bg-purple-600 text-white rounded">
          Redeem DRT
        </button>
      </form>
      {status && <p className="mt-2 text-sm">{status}</p>}
    </div>
  );
};

export default RedeemDrtForm;