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
// app/pools/page.tsx
"use client"

import React, { useState, useEffect, useCallback, JSX } from 'react'
import { BN, AnchorProvider } from "@coral-xyz/anchor"
import { useDrtProgram } from "@/lib/useDrtProgram"
import {
  buildPoolCreationTx,
  formatDrtConfigs,
  signSendBatchWithMemo,
  PartialBatchError,
} from "@/lib/drtHelpers"
import { readJsonFile } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  canAdd,
  maxPoolNameLength,
  poolBudget,
  type DrtConfigShape,
} from "@/lib/poolBudget"
import { chainTypeFor, isSelectable, runtimeFor } from "@/lib/drtCatalogue"
import {
  buildEnclaveRequest,
  generateEphemeralKey,
  memoFor,
  memoInstruction,
  MAX_GITHUB_URL_LENGTH,
} from "@/lib/redemption"
import { postToEnclave } from "@/lib/enclaveApi"
import { useWallet } from "@solana/wallet-adapter-react"
import { RefreshCcw, Check, AlertTriangle, Wallet, Copy } from "lucide-react"

// UI components
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import FilePicker from '@/components/FilePicker';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { SchemaPreview, validateJsonSchema, JsonSchemaLike } from '@/components/schemaUtils';
import PoolsTable from './PoolsTable'

/* ------------------------------------------------------------------
   Common Button Style Helpers
------------------------------------------------------------------ */
const buttonBaseClass = "bg-gray-900 text-white hover:bg-gray-800"
const buttonOutlineClass = "border-2 border-gray-900 text-gray-900 hover:bg-gray-100"

/* ------------------------------------------------------------------
   Types
------------------------------------------------------------------ */
interface DigitalRight {
  id: string;
  name: string;
  description: string;
  githubUrl: string | null;
  hash: string | null;
}

interface StepProps {
  isActive: boolean;
  onNext: () => void;
  onPrev?: () => void;
}

interface DigitalRightsTableProps {
  digitalRights: DigitalRight[];
  selected: Set<string>;
  onToggleRight: (right: DigitalRight, checked: boolean) => void;
  /** Ids that cannot be added because the transaction has no room left. */
  blocked: Set<string>;
}

interface Progress {
  step: number;
  total: number;
  message: string;
  icon: JSX.Element;
  status: 'loading' | 'success' | 'error';
  details?: string;
}

/** 0.1 SOL, in lamports. */
const DEFAULT_DRT_COST = 100_000_000;

/** Product cap on a pool name; the transaction budget may lower it further. */
const POOL_NAME_MAX_LENGTH = 50;

/** Append is cheap to redeem and expected to be used often; compute is not. */
function defaultSupplyFor(id: string): number {
  return runtimeFor(id) === "append" ? 5000 : 800;
}

/**
 * The on-chain footprint of a catalogue entry. Append is native to the enclave
 * and carries no code reference, so it costs a fraction of a compute DRT.
 */
function drtConfigShape(right: DigitalRight): DrtConfigShape {
  const isAppend = runtimeFor(right.id) === "append";
  return {
    drtType: chainTypeFor(right.id),
    githubUrl: isAppend ? null : right.githubUrl,
    codeHash: isAppend ? null : right.hash,
  };
}

/* ------------------------------------------------------------------
   HashDisplay - small helper for showing/copying a hash
------------------------------------------------------------------ */
function HashDisplay({ hash }: { hash: string | null }) {
  const [copied, setCopied] = useState(false);
  
  if (!hash) return <span>-</span>;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const truncatedHash = `${hash.slice(0, 4)}....${hash.slice(-4)}`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="font-mono text-sm bg-gray-100 p-2 rounded-md overflow-x-auto whitespace-nowrap flex items-center justify-between group cursor-pointer">
            <span>{truncatedHash}</span>
            <Button
              variant="ghost"
              size="sm"
              className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 h-6 w-6 p-0"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-md p-2">
          <p className="font-mono text-sm break-all">{hash}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ------------------------------------------------------------------
   DigitalRightsTable - Step 2 table
------------------------------------------------------------------ */
function DigitalRightsTable({
  digitalRights,
  selected,
  onToggleRight,
  blocked,
}: DigitalRightsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-1/5">Name</TableHead>
          <TableHead className="w-2/5">Description</TableHead>
          <TableHead className="w-20">Runtime</TableHead>
          <TableHead className="w-24">Source</TableHead>
          <TableHead className="w-28">SHA-256</TableHead>
          <TableHead className="w-16 text-right">Select</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {digitalRights.map((right) => {
          const isSelected = selected.has(right.id);
          const isBlocked = blocked.has(right.id) && !isSelected;
          return (
            <TableRow key={right.id} className={isBlocked ? "opacity-50" : undefined}>
              <TableCell className="font-medium align-top">{right.name}</TableCell>
              <TableCell className="align-top text-sm text-gray-600">
                {right.description}
                {isBlocked && (
                  <div className="mt-1 text-xs text-amber-700">
                    No room left in the pool creation transaction
                  </div>
                )}
              </TableCell>
              <TableCell className="align-top">
                <Badge variant="outline" className="font-normal">
                  {runtimeFor(right.id) ?? "-"}
                </Badge>
              </TableCell>
              <TableCell className="align-top">
                {right.githubUrl ? (
                  <a
                    href={right.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    View
                  </a>
                ) : (
                  "-"
                )}
              </TableCell>
              <TableCell className="align-top">
                <HashDisplay hash={right.hash} />
              </TableCell>
              <TableCell className="align-top text-right">
                <Checkbox
                  checked={isSelected}
                  disabled={isBlocked}
                  onCheckedChange={(c) => onToggleRight(right, !!c)}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/* ------------------------------------------------------------------
   TransactionBudget - how much of the pool creation transaction is used
------------------------------------------------------------------ */
function TransactionBudget({ configs }: { configs: DrtConfigShape[] }) {
  const budget = poolBudget(configs);
  const nameRoom = maxPoolNameLength(configs);
  const percent = Math.min(100, Math.round((budget.used / budget.limit) * 100));
  const tight = nameRoom < 40;

  return (
    <div className="rounded-md border bg-gray-50 p-3 space-y-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">Pool creation transaction</span>
        <span className="font-mono text-xs text-gray-600">
          {budget.used} / {budget.limit} bytes
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full transition-all ${
            !budget.fits ? "bg-red-500" : tight ? "bg-amber-500" : "bg-green-600"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-gray-600">
        Every DRT&apos;s source URL and hash travel in one Solana instruction, capped
        at {budget.limit} bytes.{" "}
        {budget.fits ? (
          <>
            This selection leaves room for a pool name of up to{" "}
            <span className="font-medium">{nameRoom} characters</span>.
          </>
        ) : (
          <span className="text-red-700">
            This selection does not fit. Deselect a compute DRT to continue.
          </span>
        )}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------
   Step 1: File Selection
------------------------------------------------------------------ */
interface FileSelectionStepProps extends StepProps {
  setSchemaDefinition: (schema: JsonSchemaLike) => void;
  setDataFile: (file: File | null) => void;
}

function FileSelectionStep({ 
  isActive, 
  onNext, 
  setSchemaDefinition,
  setDataFile 
}: FileSelectionStepProps) {
  const [schemaFile, setSchemaFile] = useState<File | null>(null)
  const [dataFileInternal, setDataFileInternal] = useState<File | null>(null)
  const [validation, setValidation] = useState<{ success: boolean; error: string | null }>({
    success: false,
    error: null
  })
  const [isValidating, setIsValidating] = useState(false)

  useEffect(() => {
    if (!isActive) {
      setSchemaFile(null)
      setDataFileInternal(null)
      setValidation({ success: false, error: null })
      setIsValidating(false)
    }
  }, [isActive])

  const validateFiles = async () => {
    if (!schemaFile || !dataFileInternal) {
      setValidation({ success: false, error: 'Please select both schema and data files' })
      return
    }

    setIsValidating(true)
    try {
      const result = await validateJsonSchema(schemaFile, dataFileInternal)
      setValidation(result)
      
      if (result.success) {
        const schemaReader = new FileReader();
        const schemaPromise = new Promise<JsonSchemaLike>((resolve, reject) => {
          schemaReader.onload = (e) => {
            try {
              const parsed = JSON.parse(e.target?.result as string);
              console.log("Schema parsed:", parsed);
              resolve(parsed);
            } catch {
              reject(new Error('Invalid JSON in schema file'));
            }
          };
          schemaReader.onerror = () => reject(new Error('Failed to read schema file'));
          schemaReader.readAsText(schemaFile);
        });

        const schemaJson = await schemaPromise;
        
        console.log("Setting data file:", dataFileInternal);
        setDataFile(dataFileInternal);
        
        setSchemaDefinition(schemaJson);
        onNext();
      }
    } catch (error) {
      setValidation({ 
        success: false, 
        error: 'An error occurred during validation: ' + (error instanceof Error ? error.message : String(error))
      })
    } finally {
      setIsValidating(false)
    }
  }

  if (!isActive) return null

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Select Files</h2>
        
        <div className="space-y-4">
          <div>
            <FilePicker
              label="Select Schema File"
              accept=".json"
              onChange={(file) => {
                setSchemaFile(file)
                setValidation({ success: false, error: null })
                console.log("Schema file selected:", file);
              }}
            />
            {isActive && schemaFile && (
              <div className="mt-2 flex justify-center">
                <SchemaPreview schemaFile={schemaFile} />
              </div>
            )}
          </div>
          
          <FilePicker
            label="Select Data File"
            accept=".json"
            onChange={(file) => {
              setDataFileInternal(file)
              setValidation({ success: false, error: null })
              console.log("Data file selected:", file);
            }}
          />
        </div>

        {validation.error && (
          <Alert variant="destructive">
            <AlertDescription>{validation.error}</AlertDescription>
          </Alert>
        )}

        <Button 
          onClick={validateFiles}
          disabled={!schemaFile || !dataFileInternal || isValidating}
          className={`w-full ${buttonBaseClass}`}
        >
          {isValidating ? 'Validating...' : 'Next'}
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------
   Step 2: Select which DRTs to use
------------------------------------------------------------------ */
function DigitalRightsStep({
  isActive,
  onNext,
  onPrev,
  selectedRights,
  setSelectedRights,
}: StepProps & {
  selectedRights: DigitalRight[];
  setSelectedRights: (rights: DigitalRight[]) => void;
}) {
  const [digitalRights, setDigitalRights] = useState<DigitalRight[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDigitalRights = async () => {
      try {
        const response = await fetch('/api/digital-rights')
        if (!response.ok) {
          throw new Error('Failed to fetch digital rights')
        }
        const data: DigitalRight[] = await response.json()
        // Only entries with a known on-chain type can be created; anything
        // else would mint a DRT that can never be redeemed.
        setDigitalRights(data.filter((right) => isSelectable(right.id)))
      } catch (err) {
        setError('Failed to load digital rights. Please try again.')
        console.error('Error fetching digital rights:', err)
      } finally {
        setIsLoading(false)
      }
    }

    if (isActive) {
      fetchDigitalRights()
    }
  }, [isActive])

  const selectedIds = new Set(selectedRights.map((right) => right.id))
  const selectedConfigs = selectedRights.map(drtConfigShape)

  // Anything that would not fit alongside the current selection.
  const blocked = new Set(
    digitalRights
      .filter((right) => !selectedIds.has(right.id))
      .filter((right) => !canAdd(selectedConfigs, drtConfigShape(right)))
      .map((right) => right.id)
  )

  const handleToggleRight = (right: DigitalRight, checked: boolean) => {
    // Rebuild from the table order rather than appending, so step 3 lists the
    // selection the same way it was presented here.
    const next = checked
      ? digitalRights.filter((r) => r.id === right.id || selectedIds.has(r.id))
      : selectedRights.filter((r) => r.id !== right.id)
    setSelectedRights(next)
  }

  if (!isActive) return null

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  const fits = poolBudget(selectedConfigs).fits

  return (
    // Fixed height with the table scrolling inside it, so selecting a DRT or
    // revealing the budget warning does not resize the page under the cursor.
    <div className="flex h-[32rem] flex-col space-y-4">
      <div className="shrink-0 space-y-1">
        <h2 className="text-xl font-semibold">Assign Digital Rights</h2>
        <p className="text-sm text-gray-600">
          Choose which computations this pool will permit. Each one is fixed at
          creation and bound to the exact code hash shown.
        </p>
      </div>

      <Card className="min-h-0 flex-1 overflow-y-auto">
        <DigitalRightsTable
          digitalRights={digitalRights}
          selected={selectedIds}
          onToggleRight={handleToggleRight}
          blocked={blocked}
        />
      </Card>

      <div className="shrink-0 space-y-4">
        <TransactionBudget configs={selectedConfigs} />

        <div className="flex justify-between">
          <Button variant="outline" onClick={onPrev} className={buttonOutlineClass}>
            Previous
          </Button>
          <Button
            onClick={onNext}
            className={buttonBaseClass}
            disabled={selectedRights.length === 0 || !fits}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------
   Step 3: Final pool creation (Name, Description, Supplies, On-Chain)
------------------------------------------------------------------ */
interface PoolCreationStepProps extends StepProps {
  selectedRights: DigitalRight[];
  setPoolCreated: (value: React.SetStateAction<boolean>) => void;
  schemaDefinition: JsonSchemaLike | null;
  dataFile: File | null;
}

function PoolCreationStep({
  isActive,
  onPrev,
  selectedRights,
  setPoolCreated,
  schemaDefinition,
  dataFile
}: PoolCreationStepProps) {
  const program = useDrtProgram();
  const wallet = useWallet();
  const { publicKey } = wallet;

  const [poolName, setPoolName] = useState("");
  const [description, setDescription] = useState("");
  const [poolId, setPoolId] = useState(1);
  const [poolNameLocked, setPoolNameLocked] = useState(false);
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [skipVmCreation] = useState(false);
  const [teeDeploymentId, setTeeDeploymentId] = useState<string | null>(null);
  const [teeStatus, setTeeStatus] = useState<string | null>(null);
  const [ownershipSupply, setOwnershipSupply] = useState(1000000);
  // Keyed by DRT id; an absent entry means "still on the default", so the
  // selection can change on step 2 without stranding stale numbers here.
  const [supplies, setSupplies] = useState<Record<string, number>>({});
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [steps, setSteps] = useState<{ name: string; walletSignatureRequired: boolean; }[]>([]);
  const [progress, setProgress] = useState<Progress>({
    step: 0,
    total: 1,
    message: "Awaiting pool creation",
    icon: <RefreshCcw size={18} className="animate-spin text-blue-500" />,
    status: "loading",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allInputsLocked, setAllInputsLocked] = useState(false);

  const supplyFor = (right: DigitalRight) =>
    supplies[right.id] ?? defaultSupplyFor(right.id);
  const costFor = (right: DigitalRight) => costs[right.id] ?? DEFAULT_DRT_COST;

  // The DRT configs and the pool name share one 1232-byte transaction, so how
  // long a name is allowed depends on what was selected on step 2. A light
  // selection leaves room for hundreds of characters, which is not a useful
  // name, so the product cap still applies above the transaction one.
  const nameLimit = Math.min(
    POOL_NAME_MAX_LENGTH,
    maxPoolNameLength(selectedRights.map(drtConfigShape))
  );

  const handleLockPoolName = async () => {
    if (!poolName.trim() || !publicKey) {
      if (!publicKey) {
        alert("Please connect your wallet first");
      }
      return;
    }
    
    setIsCheckingName(true);
    try {
      const url = `/api/user-pool-next-id?name=${encodeURIComponent(poolName)}&_debug=${Date.now()}`;
      console.log(`🔍 Fetching from: ${url}`);
      const res = await fetch(url, { method: 'GET', headers: { 'Cache-Control': 'no-cache' } });
      console.log(`🔍 Response status: ${res.status}`);
      if (!res.ok) {
        const errorText = await res.text();
        console.error('API error response:', errorText);
        throw new Error(`Failed to fetch next pool ID (Status ${res.status})`);
      }
      const data = await res.json();
      console.log('API response data:', data);
      if (data.nextId !== undefined) {
        setPoolId(data.nextId);
        setPoolNameLocked(true);
        if (data.warning) console.warn(`API Warning: ${data.warning}`);
      } else {
        throw new Error("API response missing nextId field");
      }
    } catch (error) {
      console.error("Error fetching next ID:", error);
      setPoolId(1);
      setPoolNameLocked(true);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Warning: Using fallback ID 1. Error details: ${errorMessage}`);
    } finally {
      setIsCheckingName(false);
    }
  };

  const deployTEE = async (vmName: string) => {
    if (skipVmCreation) {
      console.log("Skipping VM creation as requested");
      return "mock-deployment-id";
    }
    
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/deployments?name_prefix=${vmName}`, { method: 'POST' });
      if (!response.ok) throw new Error(`Failed to deploy TEE (Status ${response.status})`);
      const data = await response.json();
      return data.request_id;
    } catch (error) {
      console.error('TEE deployment error:', error);
      throw error;
    }
  };

  const checkTEEStatus = useCallback(async (requestId: string) => {
    if (skipVmCreation) {
      console.log("Skipping TEE status check as VM creation is disabled");
      return { status: 'completed', public_ip: '127.0.0.1', vm_name: 'mock-vm' };
    }
    
    try {
      const response = await fetch(`/api/deployments/${requestId}`, {
        cache: 'no-cache',
        headers: { 'Cache-Control': 'no-cache' },
      });

      if (!response.ok) {
        if (response.status === 404) return { status: 'pending' };
        throw new Error(`Failed to check TEE status (Status ${response.status})`);
      }
      return await response.json();
    } catch (error) {
      console.error('TEE status check error:', error);
      throw error;
    }
  }, [skipVmCreation]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (teeDeploymentId && teeStatus !== 'completed' && teeStatus !== 'failed' && !skipVmCreation) {
      interval = setInterval(async () => {
        try {
          const status = await checkTEEStatus(teeDeploymentId);
          setTeeStatus(status.status);
        } catch (error) {
          console.error('Error checking TEE status:', error);
        }
      }, 10000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [teeDeploymentId, teeStatus, skipVmCreation, checkTEEStatus]);

  const saveEnclaveMeasurement = async (
    poolId: string,
    measurements: { mrenclave: string; mrsigner: string; isvProdId: string; isvSvn: string; } | null,
    publicIp: string | null,
    actualName: string | null
  ) => {
    if (skipVmCreation) {
      console.log("Skipping enclave measurement saving as VM creation is disabled");
      return;
    }
    
    if (!measurements) {
      console.warn("No enclave measurement to save");
      return;
    }
    console.log("Attempting to save enclave measurement:", { poolId, ...measurements, publicIp, actualName });
    try {
      const response = await fetch('/api/enclave-measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poolId, ...measurements, publicIp, actualName }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `Failed to save enclave measurement (Status ${response.status})`);
      }
      const result = await response.json();
      console.log("Successfully saved enclave measurement:", result);
    } catch (error) {
      console.error('Error saving enclave measurement:', error);
    }
  };

  useEffect(() => {
    // Define the steps in the pool creation process
    const baseSteps = [
      { name: "Create Pool / Init & Mint", walletSignatureRequired: true },
    ];
    
    // Add VM creation steps if not skipped
    const vmSteps = skipVmCreation ? [] : [
      { name: "Create New VM", walletSignatureRequired: false },
      { name: "Wait for Enclave", walletSignatureRequired: false },
      { name: "Create Data Pool in Enclave", walletSignatureRequired: false },
    ];
    
    // Final step
    const finalSteps = [
      { name: "Save Pool Metadata", walletSignatureRequired: false }
    ];
    
    const allSteps = [...baseSteps, ...vmSteps, ...finalSteps];
    setSteps(allSteps);
    setProgress(prev => ({ ...prev, total: allSteps.length }));
  }, [skipVmCreation]);

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
    setProgress({ step, total: totalSteps, message, icon, status, details });
  };

  const handleCreatePool = async () => {
    if (!program || !publicKey) {
      updateProgress(0, "Wallet not connected or program not loaded.", 'error');
      return;
    }
    if (!dataFile && !skipVmCreation) {
      updateProgress(0, "Data file not selected.", 'error');
      return;
    }
  
    // Anchor’s Program carries a provider but it’s typed as `Provider | undefined`.
    // We cast it once to AnchorProvider and bail if it’s missing.
    const provider = program.provider as AnchorProvider | undefined;
    if (!provider) {
      updateProgress(0, "Anchor provider not available", "error");
      return;
    }

    setIsSubmitting(true);
    setAllInputsLocked(true);
    
    try {
      if (!poolName.trim()) throw new Error("Pool name is required");
      if (!description.trim()) throw new Error("Pool description is required");
      if (!poolNameLocked) throw new Error("Please lock the pool name before creating");
      if (selectedRights.length === 0) {
        throw new Error("Select at least one Digital Right Token on the previous step");
      }
      if (poolName.length > nameLimit) {
        throw new Error(
          `Pool name is too long for this DRT selection: ${poolName.length} characters, limit ${nameLimit}. ` +
            `The name and the DRT code references share one Solana transaction.`
        );
      }

      // Compute DRTs must carry a GitHub URL and SHA-256 on-chain; one that
      // does not is rejected here rather than created, because the enclave
      // would refuse it only after the DRT had been burned.
      const requireComputeMetadata = (right: DigitalRight, drtType: string) => {
        if (!right.githubUrl || !right.hash) {
          throw new Error(
            `Cannot create ${drtType}: the catalogue has no GitHub URL / SHA-256 hash for it. Compute DRTs must carry on-chain code metadata.`
          );
        }
        if (
          !right.githubUrl.startsWith("https://github.com/") ||
          right.githubUrl.length > MAX_GITHUB_URL_LENGTH
        ) {
          throw new Error(`Cannot create ${drtType}: catalogue GitHub URL is malformed or too long`);
        }
        if (!/^[0-9a-f]{64}$/.test(right.hash)) {
          throw new Error(`Cannot create ${drtType}: catalogue code hash is not a 64-char SHA-256`);
        }
        return { githubUrl: right.githubUrl, codeHash: right.hash };
      };

      // Prepare DRT configurations for the pool creation. chainTypeFor throws
      // on an unrecognised catalogue entry: the on-chain drt_type determines
      // which runtime the enclave will accept, so guessing it is not safe.
      const drtConfigs = selectedRights.map((right) => {
        const drtType = chainTypeFor(right.id);
        // Append is native to the platform; it carries no code reference.
        const metadata =
          runtimeFor(right.id) === "append"
            ? undefined
            : requireComputeMetadata(right, drtType);
        return {
          drtType,
          supply: new BN(supplyFor(right)),
          cost: new BN(costFor(right)),
          githubUrl: metadata?.githubUrl,
          codeHash: metadata?.codeHash,
        };
      });

      // Start the VM deployment in parallel if not skipped
      let vmDeploymentPromise;
      let measurements = null;
      let publicIp: string | null = null;
      let vmName: string | null = null;
      
      if (!skipVmCreation) {
        updateProgress(0, "Creating New VM", "loading", "Deploying VM, please wait...");
        await new Promise(resolve => setTimeout(resolve, 5000));
        vmDeploymentPromise = deployTEE(poolName)
          .then(deploymentId => {
            setTeeDeploymentId(deploymentId);
            return deploymentId;
          })
          .catch(err => {
            console.error("VM deployment error:", err);
            throw err;
          });
      }
  
      /* ----------------------------------------------------------------
         Single-signature path
      ---------------------------------------------------------------- */
      updateProgress(1, "Building transaction", "loading");

      // The creation transaction carries a memo committing to the seed
      // payload and the ephemeral key, so its signature also authorizes the
      // enclave initialization. That means the payload has to be read now,
      // before signing -- not after the VM finishes deploying.
      const ephemeral = generateEphemeralKey();
      let seedPayload = "";
      if (!skipVmCreation) {
        const dataJson = await readJsonFile(dataFile!);
        console.log("Data file parsed for enclave:", dataJson);
        seedPayload = JSON.stringify({ schema: schemaDefinition, data: dataJson });
      }
      const memoIx = memoInstruction(
        memoFor(ephemeral.publicKey, seedPayload, null)
      );

      // 1) anchor-side structs must be ‘null’-clean; helper does that
      const formatted = formatDrtConfigs(drtConfigs);

      // 2) build the transactions locally. Pool creation with three DRTs
      //    exceeds Solana's 1232-byte packet limit, so it is split; the memo
      //    rides in the first, which is the one emitting PoolCreated.
      const { transactions, pdas } = await buildPoolCreationTx(
        program,
        provider,
        poolName,
        formatted,
        new BN(ownershipSupply)
      );

      // 3) one wallet approval for the whole batch
      let sent;
      try {
        [sent] = await signSendBatchWithMemo(
          provider.connection,
          wallet,
          transactions,
          memoIx,
          (msg) => updateProgress(1, msg, "loading")
        );
      } catch (error) {
        if (error instanceof PartialBatchError) {
          // The pool is on-chain but its mints are not fully set up. Say which
          // pool, so it can be diagnosed rather than silently retried.
          throw new Error(
            `${error.message} Pool address: ${pdas.poolPda.toBase58()}. ` +
              `This pool is unusable and should not be reused.`
          );
        }
        throw error;
      }

      console.log("Pool TX:", sent.tx);
      updateProgress(1, "Pool created (mints initialised & funded)", "success");

      const chainAddress   = pdas.poolPda.toBase58();
  
      // If VM creation is enabled, wait for the TEE deployment to complete
      if (!skipVmCreation) {
        updateProgress(2, "Waiting for Enclave", "loading", "Deploying enclave, please wait...");
        const deploymentId = await vmDeploymentPromise;
        let teeDeploymentComplete = false;
        while (!teeDeploymentComplete) {
          const status = await checkTEEStatus(deploymentId);
          console.log("Full TEE status response:", JSON.stringify(status, null, 2));
          setTeeStatus(status.status);
          if (status.status === 'completed') {
            teeDeploymentComplete = true;
            if (status.details?.sigstruct) {
              measurements = {
                mrenclave: status.details.sigstruct.mr_enclave,
                mrsigner: status.details.sigstruct.mr_signer,
                isvProdId: status.details.sigstruct.isv_prod_id,
                isvSvn: status.details.sigstruct.isv_svn,
              };
              publicIp = status.public_ip;
              vmName = status.vm_name;
              console.log('TEE deployment successful, measurements:', measurements, 'publicIp:', publicIp, 'vmName:', vmName);
            } else {
              publicIp = status.public_ip;
              vmName = status.vm_name;
              console.log('No sigstruct, but extracted publicIp:', publicIp, 'vmName:', vmName);
              console.warn('TEE deployment completed but missing sigstruct details');
            }
          } else if (status.status === 'failed') {
            throw new Error('TEE deployment failed');
          }
          if (!teeDeploymentComplete) {
            console.log('Waiting for TEE deployment to complete...');
            await new Promise(resolve => setTimeout(resolve, 30000));
          }
        }
        updateProgress(2, "Enclave deployed successfully", 'success');

        if (!publicIp) throw new Error("Public IP not available from TEE deployment");

        // Attestation preflight: verify the expected measurement before
        // provisioning any data to the enclave.
        updateProgress(3, "Verifying enclave attestation", "loading");
        if (!measurements || !vmName) {
          throw new Error("Enclave measurements or VM name unavailable; cannot attest before provisioning data");
        }
        const attestationResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/attestation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vm_name: vmName,
            mrenclave: measurements.mrenclave,
            mrsigner: measurements.mrsigner,
            isvprodid: measurements.isvProdId,
            isvsvn: measurements.isvSvn,
            port: 443,
          }),
        });
        const attestationData = attestationResponse.ok ? await attestationResponse.json() : null;
        if (!attestationData?.success) {
          throw new Error("Enclave attestation preflight failed; refusing to provision data");
        }
        updateProgress(3, "Enclave attestation verified", "success");

        // Create the data pool in the enclave. No further signature: the
        // creation transaction already committed to this exact payload.
        updateProgress(3, "Creating data pool in the enclave", "loading", "Verifying the pool creation with the oracle and sealing the seed data");
        const result = await postToEnclave<string>("/api/create-data-pool", {
          publicIp,
          ...buildEnclaveRequest({
            signedTransaction: sent.signedTransaction,
            txSignature: sent.signature,
            ephemeral,
            payload: seedPayload,
          }),
        });

        if (result === "Data pool created, sealed, and saved successfully") {
          updateProgress(3, "Data pool created in enclave", "success");
        } else {
          throw new Error(`Unexpected response from enclave via proxy: ${result}`);
        }
      }
  
      // Save the pool metadata
      const currentStep = skipVmCreation ? 2 : steps.length;
      updateProgress(currentStep - 1, "Saving pool data off-chain", 'loading');
      
      // Prepare DRT types for database
      const drtTypes = drtConfigs.map(config => config.drtType);
      
      // Create a mapping of DRT types to their mint addresses
      const drtMintAddresses: Record<string, string> = {}; // Properly typed now
      for (const [drtType, mintAddress] of Object.entries(pdas.drtMintPdas)) {
        drtMintAddresses[drtType] = mintAddress.toBase58();
      }
      
      const payload = {
        name: poolName,
        description,
        poolSequenceId: poolId,
        chainAddress,
        feeVaultAddress: pdas.feeVaultPda.toBase58(),
        ownershipMintAddress: pdas.ownershipMintPda.toBase58(),
        schemaDefinition: schemaDefinition,
        allowedDrts: drtTypes,
        drtMintAddresses: drtMintAddresses, 
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
      console.log("The response data is:", responseData);
      if (responseData.success && responseData.pool.id) {
        if (!skipVmCreation && measurements) {
          try {
            await saveEnclaveMeasurement(responseData.pool.id, measurements, publicIp, vmName);
            console.log("Successfully saved enclave measurement for pool:", responseData.pool.id);
          } catch (error) {
            console.error("Failed to save enclave measurement:", error);
          }
        }
        updateProgress(currentStep, "Pool successfully created and saved!", 'success', `Chain address: ${chainAddress}`);
        setPoolCreated(prev => !prev);
      } else {
        throw new Error("Failed to save pool to database or missing pool ID");
      }
  
    } catch (error: unknown) {
      console.error("Pool creation error:", error);
      updateProgress(progress?.step || 0, `Error during pool creation: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error', "Please check console for details");
      setAllInputsLocked(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isActive) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Pool Information</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium block mb-1">Pool Name</label>
          <div className="flex space-x-2">
            <Input
              placeholder="Enter name"
              maxLength={nameLimit}
              value={poolName}
              onChange={(e) => setPoolName(e.target.value)}
              disabled={allInputsLocked || (poolNameLocked && !isSubmitting)}
              className={`${(poolNameLocked || allInputsLocked) ? "bg-gray-100" : ""} w-full`}
            />
            <Button 
              onClick={poolNameLocked ? () => setPoolNameLocked(false) : handleLockPoolName}
              disabled={(!poolName.trim() && !poolNameLocked) || isSubmitting || allInputsLocked || isCheckingName}
              className="whitespace-nowrap flex-shrink-0"
              variant={poolNameLocked ? "outline" : "default"}
              size="sm"
            >
              {isCheckingName ? (
                <>
                  <span>Checking</span>
                  <RefreshCcw size={14} className="ml-1 animate-spin" />
                </>
              ) : poolNameLocked ? (
                <> <span>Change Name</span> </>
              ) : (
                <> <span>Set Pool Name</span> </>
              )}
            </Button>
          </div>
          {/* A name typed under a looser limit stays in state if DRTs are
              added on the previous step, so flag it rather than silently
              failing at signing time. */}
          <p
            className={`mt-1 text-xs ${
              poolName.length > nameLimit ? "text-red-700" : "text-gray-500"
            }`}
          >
            {poolNameLocked && <>This pool will be created with ID #{poolId}. </>}
            {poolName.length}/{nameLimit} characters
            {nameLimit < POOL_NAME_MAX_LENGTH && (
              <> — shortened to fit {selectedRights.length} DRTs in one transaction</>
            )}
          </p>
        </div>
        
        <div className="md:col-span-2">
          <label className="text-sm font-medium block mb-1">Pool Description</label>
          <Textarea
            placeholder="Enter description (Max 200 Characters)"
            maxLength={200}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`h-full min-h-[40px] ${allInputsLocked ? "bg-gray-100" : ""}`}
            disabled={allInputsLocked}
          />
        </div>
      </div>
      
      {/* <div className="flex items-center space-x-2 mt-4">
        <Switch
          id="skip-vm"
          checked={skipVmCreation}
          onCheckedChange={setSkipVmCreation}
          disabled={isSubmitting || allInputsLocked}
        />
        <label
          htmlFor="skip-vm"
          className="text-sm font-medium cursor-pointer"
        >
          Skip VM creation (blockchain only)
        </label>
      </div> */}
      
      <div className="h-2" />
      <Card className="p-4 mt-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-800">Token Supply Configuration</h3>
          <div className="flex items-center text-sm text-gray-600 space-x-2">
            <Wallet size={16} />
            <span>
              {steps.filter(s => s.walletSignatureRequired).length} wallet signature required
            </span>
          </div>
        </div>
        <div className="bg-gray-50 rounded-md p-3 space-y-4">
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium">Ownership Token Supply:</label>
            <Input
              type="number"
              min={1}
              value={ownershipSupply}
              onChange={(e) => setOwnershipSupply(Number(e.target.value))}
              className={`w-32 ${allInputsLocked ? "bg-gray-100" : ""}`}
              disabled={allInputsLocked}
            />
          </div>

          {selectedRights.length === 0 ? (
            <p className="text-sm text-amber-700">
              No Digital Right Tokens selected. Go back and choose at least one.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {selectedRights.map((right) => (
                <div key={right.id} className="rounded-md border bg-white p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{right.name}</span>
                    <Badge variant="outline" className="font-normal">
                      {runtimeFor(right.id) ?? "-"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between space-x-2">
                    <label className="text-sm text-gray-600">Supply</label>
                    <Input
                      type="number"
                      min={1}
                      value={supplyFor(right)}
                      onChange={(e) =>
                        setSupplies((prev) => ({ ...prev, [right.id]: Number(e.target.value) }))
                      }
                      className={`w-32 ${allInputsLocked ? "bg-gray-100" : ""}`}
                      disabled={allInputsLocked}
                    />
                  </div>
                  <div className="flex items-center justify-between space-x-2">
                    <label className="text-sm text-gray-600">Cost (lamports)</label>
                    <Input
                      type="number"
                      min={1}
                      value={costFor(right)}
                      onChange={(e) =>
                        setCosts((prev) => ({ ...prev, [right.id]: Number(e.target.value) }))
                      }
                      className={`w-32 ${allInputsLocked ? "bg-gray-100" : ""}`}
                      disabled={allInputsLocked}
                    />
                  </div>
                  <p className="text-right text-xs text-gray-500">
                    {(costFor(right) / 1_000_000_000).toFixed(3)} SOL per redemption
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
      <Card className="p-4">
        <div className="flex flex-col space-y-4">
          <div className="flex justify-between">
            <Button 
              variant="outline" 
              onClick={onPrev} 
              className={buttonOutlineClass}
              disabled={isSubmitting || allInputsLocked}
            >
              Previous
            </Button>
            <Button
              onClick={handleCreatePool}
              disabled={
                !poolNameLocked ||
                !description.trim() ||
                isSubmitting ||
                allInputsLocked ||
                selectedRights.length === 0 ||
                poolName.length > nameLimit
              }
              className={buttonBaseClass}
            >
              {isSubmitting ? 'Creating Pool...' : 'Create Pool'}
            </Button>
          </div>
          <div className="pt-2">
            <div className="mb-2 flex justify-between items-center">
              <h3 className="font-medium text-gray-700">Creation Progress</h3>
              <span className="text-sm font-medium text-gray-500">Step {progress.step}/{progress.total}</span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  progress.status === 'error' ? 'bg-red-500' : 'bg-gradient-to-r from-blue-400 to-blue-600'
                }`}
                style={{ 
                  width: `${Math.max((progress.step / progress.total) * 100, 5)}%`,
                  boxShadow: progress.status !== 'error' ? '0 0 8px rgba(59, 130, 246, 0.5)' : 'none'
                }}
              />
            </div>
            <div className="mt-3 flex items-center space-x-3">
              <div className={`p-1.5 rounded-full flex-shrink-0 ${
                progress.status === 'loading' ? 'bg-blue-100' :
                progress.status === 'success' ? 'bg-green-100' :
                'bg-red-100'
              }`}>
                {progress.icon}
              </div>
              <div className="min-w-0">
                <div className="font-medium text-gray-800 text-sm">
                  {progress.message}
                  {progress.details && (
                    <span className="text-xs text-gray-600 ml-1">({progress.details})</span>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-center space-x-1">
              {steps.map((_, index) => (
                <div 
                  key={index}
                  className={`rounded-full transition-all duration-300 ${
                    index < progress.step ? 'bg-blue-500 w-1.5 h-1.5' : 
                    index === progress.step - 1 ? 'bg-blue-500 w-2 h-2 animate-pulse' : 
                    'bg-gray-300 w-1.5 h-1.5'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------
   Main "CreatePool" multi-step wizard + Pools listing
------------------------------------------------------------------ */
export default function Pools() {
  const [currentStep, setCurrentStep] = useState(1)
  const [schemaDefinition, setSchemaDefinition] = useState<JsonSchemaLike | null>(null);
  const [dataFile, setDataFile] = useState<File | null>(null);
  const [selectedRights, setSelectedRights] = useState<DigitalRight[]>([])
  const [poolCreated, setPoolCreated] = useState(false);

  useEffect(() => {
    console.log("Data file in Pools component:", dataFile);
  }, [dataFile]);

  return (
    <div className="space-y-6 container mx-auto px-4 max-w-7xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Create Pool</h1>
      <Card className="p-6">
        <div className="mb-8">
          <div className="flex justify-between">
            {[1, 2, 3].map((step) => (
              <div key={step} className={`flex items-center ${step < 3 ? 'flex-1' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 
                  ${currentStep >= step ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-400'}`}>
                  {step}
                </div>
                {step < 3 && (
                  <div className={`flex-1 h-1 mx-4 ${currentStep > step ? 'bg-gray-900' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>
        <FileSelectionStep 
          isActive={currentStep === 1}
          onNext={() => setCurrentStep(2)}
          setSchemaDefinition={setSchemaDefinition}
          setDataFile={setDataFile}
        />
        <DigitalRightsStep 
          isActive={currentStep === 2}
          onNext={() => setCurrentStep(3)}
          onPrev={() => setCurrentStep(1)}
          selectedRights={selectedRights}
          setSelectedRights={setSelectedRights}
        />
        <PoolCreationStep
          isActive={currentStep === 3}
          onNext={() => {
            alert('Pool creation flow completed!')
            setCurrentStep(1)
            setDataFile(null)
          }}
          onPrev={() => setCurrentStep(2)}
          selectedRights={selectedRights}
          setPoolCreated={setPoolCreated}
          schemaDefinition={schemaDefinition}
          dataFile={dataFile}
        />
      </Card>
      <div className="mt-8">
        <h2 className="text-2xl font-semibold mb-4">Existing Pools</h2>
        <PoolsTable poolCreated={poolCreated} />
      </div>
    </div>
  )
}