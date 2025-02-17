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

// components/CreatePoolDashboardForm.tsx
"use client";

import React, { useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { useDrtProgram } from "@/lib/useDrtProgram";
import { createPool } from "@/lib/drtHelpers";
import { useWallet } from "@solana/wallet-adapter-react";

const CreatePoolDashboardForm = () => {
    const program = useDrtProgram();
    const { publicKey } = useWallet();
    const [poolName, setPoolName] = useState("");
    const [description, setDescription] = useState("");
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
          // Reset or set initial status
          setStatus("Starting pool creation process...");
          const allowedDrtArray = allowedDrts.split(",").map((s) => s.trim());
          
          // Pass a callback to updateStatus so that each step in createPool updates the UI
          const result = await createPool(
            program,
            program.provider as any,
            poolName,
            poolId,
            new BN(ownershipSupply),
            new BN(appendSupply),
            allowedDrtArray,
            (msg) => setStatus(msg)  // <-- status updater callback
          );
          
          const chainAddress = result.pool.toBase58();
          const vaultAddress = result.vault.toBase58();
          const feeVaultAddress = result.feeVault.toBase58();
          const ownershipMintAddress = result.ownershipMint.toBase58();
          setStatus(`On-chain pool created! Chain address: ${chainAddress}. Saving to DB...`);
          console.log(
            "Pool PDA:", result.pool.toBase58(),
            "Vault PDA:", result.vault.toBase58(),
            "Fee Vault PDA:", result.feeVault.toBase58(),
            "Ownership Mint:", result.ownershipMint.toBase58()
          );
      
          // Continue with your API call to save pool data off-chain...
          const payload = {
            name: poolName,
            description,
            chainAddress,
            vaultAddress,       
            feeVaultAddress,      
            ownershipMintAddress, 
            schemaDefinition: {
                poolId,
                ownershipSupply,
                appendSupply,
                allowedDrts: allowedDrtArray,
            },
        };
      
          console.log('Sending payload to API:', payload);
          
          const res = await fetch("/api/pools-dashboard", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      
          if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || "Failed to save pool to database");
          }
      
          const responseData = await res.json();
          console.log('API Response:', responseData);
      
          if (responseData.success) {
            setStatus(`Pool successfully created and saved! Chain address: ${chainAddress}`);
          } else {
            throw new Error("Failed to save pool to database");
          }
          
        } catch (error: any) {
          console.error('Form submission error:', error);
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
            <textarea
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
            placeholder="Ownership Supply (number)"
            value={ownershipSupply}
            onChange={(e) => setOwnershipSupply(Number(e.target.value))}
            className="border p-1 rounded w-full"
            required
            />
            <input
            type="number"
            placeholder="Append Supply (number)"
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

export default CreatePoolDashboardForm;
