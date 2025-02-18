"use client";

import React, { useState } from "react";
import { BN } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import { useDrtProgram } from "@/lib/useDrtProgram";
import { createPool, createNewMint, initializeDRT } from "@/lib/drtHelpers";
import { useWallet } from "@solana/wallet-adapter-react";

const CreatePoolDashboardForm = () => {
  const program = useDrtProgram();
  const { publicKey } = useWallet();

  // Pool-level fields
  const [poolName, setPoolName] = useState("");
  const [description, setDescription] = useState("");
  const [poolId, setPoolId] = useState(1);
  const [ownershipSupply, setOwnershipSupply] = useState(1000000);

  // DRT selection using checkboxes
  const [appendSelected, setAppendSelected] = useState(false);
  const [wComputeSelected, setWComputeSelected] = useState(false);
  const [pyComputeSelected, setPyComputeSelected] = useState(false);

  // Supply inputs for each DRT type
  const [appendSupply, setAppendSupply] = useState(5000);
  const [wComputeSupply, setWComputeSupply] = useState(800);
  const [pyComputeSupply, setPyComputeSupply] = useState(800);

  const [status, setStatus] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!program || !publicKey) {
      setStatus("Wallet not connected or program not loaded.");
      return;
    }

    try {
      // Calculate the number of selected DRT types.
      const selectedCount =
        (appendSelected ? 1 : 0) +
        (wComputeSelected ? 1 : 0) +
        (pyComputeSelected ? 1 : 0);
      // Total steps: 2 (pool creation) + 2 * (DRT types) + 2 (final off-chain save)
      const totalSteps = 4 + 2 * selectedCount;
      let step = 1;

      // Step 1: Create the pool on-chain.
      setStatus(`Step ${step}/${totalSteps}: Creating pool on-chain...`);
      // Build allowedDrts array from checkboxes.
      const allowedDrts: string[] = [];
      if (appendSelected) allowedDrts.push("append");
      if (wComputeSelected) allowedDrts.push("w_compute_median");
      if (pyComputeSelected) allowedDrts.push("py_compute_median");

      const result = await createPool(
        program,
        program.provider as any,
        poolName,
        poolId,
        new BN(ownershipSupply),
        new BN(appendSelected ? appendSupply : 0),
        allowedDrts,
        (msg: string) => console.log("createPool:", msg)
      );
      const chainAddress = result.pool.toBase58();
      setStatus(`Step ${++step}/${totalSteps}: Pool created on-chain! Chain address: ${chainAddress}`);

      // Cast the provider to AnchorProvider so that createNewMint works.
      const provider = program.provider as anchor.AnchorProvider;

      // For each selected DRT type, create a new mint and initialize on-chain.
      if (appendSelected) {
        setStatus(`Step ${++step}/${totalSteps}: Creating new mint for Append DRT...`);
        const appendMint = await createNewMint(provider, result.vault);
        setStatus(`Step ${++step}/${totalSteps}: Initializing Append DRT on-chain...`);
        const vaultAppendTokenAccount = await initializeDRT(
          program,
          result.pool,
          result.vault,
          publicKey,
          appendMint,
          new BN(appendSupply),
          "append"
        );
        console.log("Append DRT Mint:", appendMint.toBase58());
        console.log("Vault Append DRT Token Account:", vaultAppendTokenAccount.toBase58());
        setStatus(`Step ${step}/${totalSteps}: Append DRT initialized.`);
      }

      if (wComputeSelected) {
        if (wComputeSupply <= 0) {
          setStatus("Please provide a valid supply for W Compute Median.");
          return;
        }
        setStatus(`Step ${++step}/${totalSteps}: Creating new mint for W Compute Median DRT...`);
        const wComputeMint = await createNewMint(provider, result.vault);
        setStatus(`Step ${++step}/${totalSteps}: Initializing W Compute Median DRT on-chain...`);
        const vaultWComputeTokenAccount = await initializeDRT(
          program,
          result.pool,
          result.vault,
          publicKey,
          wComputeMint,
          new BN(wComputeSupply),
          "w_compute_median"
        );
        console.log("W Compute Median Mint:", wComputeMint.toBase58());
        console.log("Vault W Compute Token Account:", vaultWComputeTokenAccount.toBase58());
        setStatus(`Step ${step}/${totalSteps}: W Compute Median DRT initialized.`);
      }

      if (pyComputeSelected) {
        if (pyComputeSupply <= 0) {
          setStatus("Please provide a valid supply for Py Compute Median.");
          return;
        }
        setStatus(`Step ${++step}/${totalSteps}: Creating new mint for Py Compute Median DRT...`);
        const pyComputeMint = await createNewMint(provider, result.vault);
        setStatus(`Step ${++step}/${totalSteps}: Initializing Py Compute Median DRT on-chain...`);
        const vaultPyComputeTokenAccount = await initializeDRT(
          program,
          result.pool,
          result.vault,
          publicKey,
          pyComputeMint,
          new BN(pyComputeSupply),
          "py_compute_median"
        );
        console.log("Py Compute Median Mint:", pyComputeMint.toBase58());
        console.log("Vault Py Compute Token Account:", vaultPyComputeTokenAccount.toBase58());
        setStatus(`Step ${step}/${totalSteps}: Py Compute Median DRT initialized.`);
      }

      // Final steps: Save pool data off-chain.
      setStatus(`Step ${++step}/${totalSteps}: Saving pool data off-chain...`);
      const payload = {
        name: poolName,
        description,
        chainAddress,
        vaultAddress: result.vault.toBase58(),
        feeVaultAddress: result.feeVault.toBase58(),
        ownershipMintAddress: result.ownershipMint.toBase58(),
        schemaDefinition: {
          poolId,
          ownershipSupply,
          appendSupply: appendSelected ? appendSupply : 0,
          allowedDrts,
          wComputeSupply: wComputeSelected ? wComputeSupply : undefined,
          pyComputeSupply: pyComputeSelected ? pyComputeSupply : undefined,
        },
      };

      console.log("Sending payload to API:", payload);
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
      if (responseData.success) {
        setStatus(`Step ${++step}/${totalSteps}: Pool successfully created and saved! Chain address: ${chainAddress}`);
      } else {
        throw new Error("Failed to save pool to database");
      }
      
    } catch (error: any) {
      console.error("Form submission error:", error);
      setStatus(`Error: ${error.message}`);
    }
  };

  return (
    <div className="p-4 border rounded shadow mb-4">
      <h2 className="text-xl font-bold mb-2">Create New Pool</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
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
        <p className="font-semibold">Pool ID:</p>
        <input
          type="number"
          placeholder="Pool ID (number)"
          value={poolId}
          onChange={(e) => setPoolId(Number(e.target.value))}
          className="border p-1 rounded w-full"
          required
        />
        <p className="font-semibold">Enter Number of Ownership Tokens:</p>
        <input
          type="number"
          placeholder="Ownership Supply (number)"
          value={ownershipSupply}
          onChange={(e) => setOwnershipSupply(Number(e.target.value))}
          className="border p-1 rounded w-full"
          required
        />

        {/* DRT Selection */}
        <div className="border p-2 rounded">
          <p className="font-semibold">Select DRT Types to Initialize:</p>
          <div className="flex items-center space-x-2">
            <label>
              <input
                type="checkbox"
                checked={appendSelected}
                onChange={(e) => setAppendSelected(e.target.checked)}
              />{" "}
              Append DRT
            </label>
            {appendSelected && (
              <input
                type="number"
                placeholder="Append Supply"
                value={appendSupply}
                onChange={(e) => setAppendSupply(Number(e.target.value))}
                className="border p-1 rounded w-32"
              />
            )}
          </div>
          <div className="flex items-center space-x-2">
            <label>
              <input
                type="checkbox"
                checked={wComputeSelected}
                onChange={(e) => setWComputeSelected(e.target.checked)}
              />{" "}
              W Compute Median DRT
            </label>
            {wComputeSelected && (
              <input
                type="number"
                placeholder="W Compute Supply"
                value={wComputeSupply}
                onChange={(e) => setWComputeSupply(Number(e.target.value))}
                className="border p-1 rounded w-32"
              />
            )}
          </div>
          <div className="flex items-center space-x-2">
            <label>
              <input
                type="checkbox"
                checked={pyComputeSelected}
                onChange={(e) => setPyComputeSelected(e.target.checked)}
              />{" "}
              Py Compute Median DRT
            </label>
            {pyComputeSelected && (
              <input
                type="number"
                placeholder="Py Compute Supply"
                value={pyComputeSupply}
                onChange={(e) => setPyComputeSupply(Number(e.target.value))}
                className="border p-1 rounded w-32"
              />
            )}
          </div>
        </div>

        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">
          Create Pool
        </button>
      </form>
      {status && <p className="mt-2 text-sm">{status}</p>}
    </div>
  );
};

export default CreatePoolDashboardForm;
