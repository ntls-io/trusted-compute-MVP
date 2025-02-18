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

import React, { useState, useEffect, JSX } from "react";
import { BN } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import { useDrtProgram } from "@/lib/useDrtProgram";
import { createPool, createNewMint, initializeDRT } from "@/lib/drtHelpers";
import { useWallet } from "@solana/wallet-adapter-react";
import { RefreshCcw, Check, Wallet, AlertTriangle } from "lucide-react";

interface Progress {
  step: number;
  total: number;
  message: string;
  icon: JSX.Element;
  status: 'loading' | 'success' | 'error';
  details?: string;
}

type StepType = {
  name: string;
  description: string;
  walletSignatureRequired: boolean;
};

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

  // Overall progress state
  const [progress, setProgress] = useState<Progress | null>(null);
  const [steps, setSteps] = useState<StepType[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate total steps based on selections
  useEffect(() => {
    const calculateSteps = () => {
      const stepsList: StepType[] = [
        {
          name: "Create Ownership Mint",
          description: "Creating the ownership token mint",
          walletSignatureRequired: true
        },
        {
          name: "Initialize Pool",
          description: "Setting up the pool on-chain",
          walletSignatureRequired: true
        },
        {
          name: "Initialize Fee Vault",
          description: "Setting up the fee vault",
          walletSignatureRequired: true
        }
      ];

      if (appendSelected) {
        stepsList.push(
          {
            name: "Create Append Mint",
            description: "Creating the Append DRT mint",
            walletSignatureRequired: true
          },
          {
            name: "Initialize Append DRT",
            description: "Setting up the Append DRT",
            walletSignatureRequired: true
          }
        );
      }

      if (wComputeSelected) {
        stepsList.push(
          {
            name: "Create W Compute Mint",
            description: "Creating the W Compute DRT mint",
            walletSignatureRequired: true
          },
          {
            name: "Initialize W Compute DRT",
            description: "Setting up the W Compute DRT",
            walletSignatureRequired: true
          }
        );
      }

      if (pyComputeSelected) {
        stepsList.push(
          {
            name: "Create Py Compute Mint",
            description: "Creating the Py Compute DRT mint",
            walletSignatureRequired: true
          },
          {
            name: "Initialize Py Compute DRT",
            description: "Setting up the Py Compute DRT",
            walletSignatureRequired: true
          }
        );
      }

      stepsList.push(
        {
          name: "Save Pool Metadata",
          description: "Saving pool data off-chain",
          walletSignatureRequired: false
        }
      );

      return stepsList;
    };

    setSteps(calculateSteps());
  }, [appendSelected, wComputeSelected, pyComputeSelected]);

  // Helper to update overall progress
  const updateProgress = (
    step: number,
    message: string,
    status: 'loading' | 'success' | 'error' = 'loading',
    details?: string
  ) => {
    const totalSteps = steps.length;
    const icon = status === 'loading' 
      ? <RefreshCcw size={18} className="animate-spin text-blue-500" />
      : status === 'success' 
        ? <Check size={18} className="text-green-500" /> 
        : <AlertTriangle size={18} className="text-red-500" />;

    setProgress({
      step,
      total: totalSteps,
      message,
      icon,
      status,
      details
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!program || !publicKey) {
      updateProgress(0, "Wallet not connected or program not loaded.", 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      // Validate that at least one DRT is selected
      const selectedCount = (appendSelected ? 1 : 0) + (wComputeSelected ? 1 : 0) + (pyComputeSelected ? 1 : 0);
      
      let currentStep = 1;
      const allowedDrts: string[] = [];
      if (appendSelected) allowedDrts.push("append");
      if (wComputeSelected) allowedDrts.push("w_compute_median");
      if (pyComputeSelected) allowedDrts.push("py_compute_median");

      // --- POOL CREATION PHASE ---
      // Notify about wallet signature for creating ownership mint
      updateProgress(currentStep, steps[currentStep-1].description, 'loading', 
        "Please sign with your wallet to create the ownership token mint");
      
      // Create Pool calls multiple transactions internally
      const result = await createPool(
        program,
        program.provider as any,
        poolName,
        poolId,
        new BN(ownershipSupply),
        new BN(appendSelected ? appendSupply : 0),
        allowedDrts,
        (status) => {
          if (status.includes("1/3")) {
            updateProgress(1, "Creating ownership token mint", 'loading', "Please sign with your wallet");
          } else if (status.includes("2/3")) {
            updateProgress(2, "Initializing pool on-chain", 'loading', "Please sign with your wallet");
          } else if (status.includes("3/3")) {
            updateProgress(3, "Initializing fee vault", 'loading', "Please sign with your wallet");
          }
        }
      );
      
      const chainAddress = result.pool.toBase58();
      updateProgress(3, "Pool and fee vault initialized", 'success');
      
      // --- DRT INITIALIZATION PHASE ---
      const provider = program.provider as anchor.AnchorProvider;
      currentStep = 4; // Start at step 4 after pool creation

      if (appendSelected) {
        updateProgress(currentStep, "Creating mint for Append DRT", 'loading', 
          "Please sign with your wallet to create the Append DRT mint");
        const appendMint = await createNewMint(provider, result.vault);
        updateProgress(currentStep, "Mint for Append DRT created", 'success');

        currentStep++;
        updateProgress(currentStep, "Initializing Append DRT on-chain", 'loading',
          "Please sign with your wallet to initialize the Append DRT");
        await initializeDRT(
          program,
          result.pool,
          result.vault,
          publicKey,
          appendMint,
          new BN(appendSupply),
          "append"
        );
        updateProgress(currentStep, "Append DRT initialized", 'success');
        currentStep++;
      }

      if (wComputeSelected) {
        updateProgress(currentStep, "Creating mint for W Compute Median DRT", 'loading',
          "Please sign with your wallet to create the W Compute DRT mint");
        const wComputeMint = await createNewMint(provider, result.vault);
        updateProgress(currentStep, "Mint for W Compute Median created", 'success');

        currentStep++;
        updateProgress(currentStep, "Initializing W Compute Median DRT on-chain", 'loading',
          "Please sign with your wallet to initialize the W Compute DRT");
        await initializeDRT(
          program,
          result.pool,
          result.vault,
          publicKey,
          wComputeMint,
          new BN(wComputeSupply),
          "w_compute_median"
        );
        updateProgress(currentStep, "W Compute Median DRT initialized", 'success');
        currentStep++;
      }

      if (pyComputeSelected) {
        updateProgress(currentStep, "Creating mint for Py Compute Median DRT", 'loading',
          "Please sign with your wallet to create the Py Compute DRT mint");
        const pyComputeMint = await createNewMint(provider, result.vault);
        updateProgress(currentStep, "Mint for Py Compute Median created", 'success');

        currentStep++;
        updateProgress(currentStep, "Initializing Py Compute Median DRT on-chain", 'loading',
          "Please sign with your wallet to initialize the Py Compute DRT");
        await initializeDRT(
          program,
          result.pool,
          result.vault,
          publicKey,
          pyComputeMint,
          new BN(pyComputeSupply),
          "py_compute_median"
        );
        updateProgress(currentStep, "Py Compute Median DRT initialized", 'success');
        currentStep++;
      }

      // --- OFF-CHAIN SAVING PHASE ---
      updateProgress(currentStep, "Saving pool data off-chain", 'loading');
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
        updateProgress(currentStep, "Pool successfully created and saved!", 'success',
          `Chain address: ${chainAddress}`);
      } else {
        throw new Error("Failed to save pool to database");
      }
    } catch (error: any) {
      console.error("Form submission error:", error);
      updateProgress(
        progress?.step || 0, 
        `Error during pool creation: ${error.message}`, 
        'error',
        "Please check console for details"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 border rounded-lg shadow-lg mb-6 bg-white dark:bg-gray-800">
      <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-white">Create New Pool</h2>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="poolName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Pool Name
          </label>
          <input
            id="poolName"
            type="text"
            placeholder="Enter pool name"
            value={poolName}
            onChange={(e) => setPoolName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            required
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Description
          </label>
          <textarea
            id="description"
            placeholder="Describe the purpose of this pool"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            rows={3}
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="poolId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Pool ID
            </label>
            <input
              id="poolId"
              type="number"
              min="1"
              placeholder="Pool ID (number)"
              value={poolId}
              onChange={(e) => setPoolId(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
          
          <div>
            <label htmlFor="ownershipSupply" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Ownership Token Supply
            </label>
            <input
              id="ownershipSupply"
              type="number"
              min="1"
              placeholder="Number of ownership tokens"
              value={ownershipSupply}
              onChange={(e) => setOwnershipSupply(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
        </div>

        {/* DRT Selection */}
        <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <h3 className="text-lg font-medium text-gray-800 dark:text-white mb-3">
            Data Request Token (DRT) Types
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            Select the types of DRTs to initialize for this pool. Each selection will require additional wallet signatures.
          </p>
          
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
              <label className="inline-flex items-center">
                <input
                  type="checkbox"
                  checked={appendSelected}
                  onChange={(e) => setAppendSelected(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-gray-700 dark:text-gray-300">Append DRT</span>
              </label>
              {appendSelected && (
                <div className="flex items-center">
                  <span className="text-sm text-gray-500 dark:text-gray-400 mr-2">Supply:</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="Supply"
                    value={appendSupply}
                    onChange={(e) => setAppendSupply(Number(e.target.value))}
                    className="w-32 px-3 py-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
              <label className="inline-flex items-center">
                <input
                  type="checkbox"
                  checked={wComputeSelected}
                  onChange={(e) => setWComputeSelected(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-gray-700 dark:text-gray-300">W Compute Median DRT</span>
              </label>
              {wComputeSelected && (
                <div className="flex items-center">
                  <span className="text-sm text-gray-500 dark:text-gray-400 mr-2">Supply:</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="Supply"
                    value={wComputeSupply}
                    onChange={(e) => setWComputeSupply(Number(e.target.value))}
                    className="w-32 px-3 py-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
              <label className="inline-flex items-center">
                <input
                  type="checkbox"
                  checked={pyComputeSelected}
                  onChange={(e) => setPyComputeSelected(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-gray-700 dark:text-gray-300">Py Compute Median DRT</span>
              </label>
              {pyComputeSelected && (
                <div className="flex items-center">
                  <span className="text-sm text-gray-500 dark:text-gray-400 mr-2">Supply:</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="Supply"
                    value={pyComputeSupply}
                    onChange={(e) => setPyComputeSupply(Number(e.target.value))}
                    className="w-32 px-3 py-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4">
          <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center">
            <Wallet size={16} className="mr-1" />
            <span>
              {steps.filter(step => step.walletSignatureRequired).length} wallet signatures required
            </span>
          </div>
          <button 
            type="submit" 
            disabled={isSubmitting}
            className={`px-6 py-3 rounded-md font-medium transition-all ${
              isSubmitting 
                ? 'bg-gray-400 cursor-not-allowed text-white' 
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg'
            }`}
          >
            {isSubmitting ? 'Creating Pool...' : 'Create Pool'}
          </button>
        </div>
      </form>

      {/* Enhanced progress display */}
      {progress && (
        <div className="mt-6 bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
          <div className="mb-3 flex justify-between items-center">
            <h3 className="font-medium text-gray-700 dark:text-gray-200">
              Creation Progress
            </h3>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Step {progress.step}/{progress.total}
            </span>
          </div>
          
          {/* Enhanced loading bar with gradient and animation */}
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                progress.status === 'error' 
                  ? 'bg-red-500' 
                  : 'bg-gradient-to-r from-blue-400 to-blue-600'
              }`}
              style={{ 
                width: `${Math.max((progress.step / progress.total) * 100, 5)}%`,
                boxShadow: progress.status !== 'error' ? '0 0 8px rgba(59, 130, 246, 0.5)' : 'none'
              }}
            />
          </div>
          
          {/* Current step message */}
          <div className="mt-4 flex items-start space-x-3">
            <div className={`p-2 rounded-full ${
              progress.status === 'loading' ? 'bg-blue-100 dark:bg-blue-900/30' :
              progress.status === 'success' ? 'bg-green-100 dark:bg-green-900/30' :
              'bg-red-100 dark:bg-red-900/30'
            }`}>
              {progress.icon}
            </div>
            <div>
              <div className="font-medium text-gray-800 dark:text-white">
                {progress.message}
              </div>
              {progress.details && (
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  {progress.details}
                </p>
              )}
            </div>
          </div>
          
          {/* Step indicator circles */}
          <div className="mt-6 flex items-center justify-center space-x-1">
            {steps.map((_, index) => (
              <div 
                key={index}
                className={`rounded-full transition-all duration-300 ${
                  index < progress.step 
                    ? 'bg-blue-500 w-2 h-2' 
                    : index === progress.step - 1
                      ? 'bg-blue-500 w-3 h-3 animate-pulse' 
                      : 'bg-gray-300 dark:bg-gray-600 w-2 h-2'
                }`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CreatePoolDashboardForm;