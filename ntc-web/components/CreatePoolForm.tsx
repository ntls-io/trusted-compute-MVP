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

// components/CreatePoolForm.tsx
"use client";

import React, { useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { useDrtProgram } from "@/lib/useDrtProgram";
import { createPool } from "@/lib/drtHelpers";
import { useWallet } from "@solana/wallet-adapter-react";

const CreatePoolForm = () => {
  const program = useDrtProgram();
  const { publicKey } = useWallet();
  const [poolName, setPoolName] = useState("");
  const [poolId, setPoolId] = useState(1);
  const [ownershipSupply, setOwnershipSupply] = useState(1000000);
  const [appendSupply, setAppendSupply] = useState(5000);
  const [allowedDrts, setAllowedDrts] = useState("append,w_compute_median,py_compute_median");
  const [status, setStatus] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!program || !publicKey) {
      setStatus("Wallet not connected or program not loaded.");
      return;
    }
    try {
      setStatus("Creating pool...");
      const allowedArr = allowedDrts.split(",").map((s) => s.trim());
      const result = await createPool(
        program,
        program.provider as any, // our helper requires AnchorProvider
        poolName,
        poolId,
        new BN(ownershipSupply),
        new BN(appendSupply),
        allowedArr
      );
      setStatus(`Pool created! Pool PDA: ${result.pool.toBase58()}`);
    } catch (error: any) {
      console.error(error);
      setStatus(`Error: ${error.message}`);
    }
  };

  return (
    <div className="p-4 border rounded shadow mb-4">
      <h2 className="text-xl font-bold mb-2">Create New Pool</h2>
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="text"
          placeholder="Pool Name"
          value={poolName}
          onChange={(e) => setPoolName(e.target.value)}
          className="border p-1 rounded w-full"
          required
        />
        <input
          type="number"
          placeholder="Pool ID (number)"
          value={poolId}
          onChange={(e) => setPoolId(Number(e.target.value))}
          className="border p-1 rounded w-full"
          required
        />
        <input
          type="number"
          placeholder="Ownership Supply"
          value={ownershipSupply}
          onChange={(e) => setOwnershipSupply(Number(e.target.value))}
          className="border p-1 rounded w-full"
          required
        />
        <input
          type="number"
          placeholder="Append Supply"
          value={appendSupply}
          onChange={(e) => setAppendSupply(Number(e.target.value))}
          className="border p-1 rounded w-full"
          required
        />
        <input
          type="text"
          placeholder="Allowed DRTs (comma separated)"
          value={allowedDrts}
          onChange={(e) => setAllowedDrts(e.target.value)}
          className="border p-1 rounded w-full"
          required
        />
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">
          Create Pool
        </button>
      </form>
      {status && <p className="mt-2 text-sm">{status}</p>}
    </div>
  );
};

export default CreatePoolForm;