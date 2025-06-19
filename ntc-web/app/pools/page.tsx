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

import React, { useState, useEffect, JSX } from 'react'
import { BN, AnchorProvider } from "@coral-xyz/anchor"
import { useDrtProgram } from "@/lib/useDrtProgram"
import { buildPoolCreationTx, formatDrtConfigs, derivePoolPdas, getFeeVaultPda } from "@/lib/drtHelpers"
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
import { Switch } from "@/components/ui/switch"
import FilePicker from '@/components/FilePicker';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { SchemaPreview, validateJsonSchema } from '@/components/schemaUtils';
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
  onToggleRight: (right: DigitalRight, checked: boolean) => void;
  appendSelected: boolean;
  wComputeSelected: boolean;
  pyComputeSelected: boolean;
}

interface Progress {
  step: number;
  total: number;
  message: string;
  icon: JSX.Element;
  status: 'loading' | 'success' | 'error';
  details?: string;
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
  onToggleRight,
  appendSelected,
  wComputeSelected,
  pyComputeSelected
}: DigitalRightsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-1/6">Name</TableHead>
          <TableHead className="w-2/6">Description</TableHead>
          <TableHead className="w-1/6">GitHub</TableHead>
          <TableHead className="w-1/6">Expected SHA256 Hash</TableHead>
          <TableHead className="w-24">Select</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {digitalRights.map((right) => {
          let checked = false
          if (right.name.toLowerCase().includes('append')) {
            checked = appendSelected
          } else if (right.name.toLowerCase().includes('wasm')) {
            checked = wComputeSelected
          } else if (right.name.toLowerCase().includes('python')) {
            checked = pyComputeSelected
          }

          return (
            <TableRow key={right.id}>
              <TableCell className="font-medium">{right.name}</TableCell>
              <TableCell>{right.description}</TableCell>
              <TableCell>
                {right.githubUrl ? (
                  <a 
                    href={right.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    View Source
                  </a>
                ) : (
                  "-"
                )}
              </TableCell>
              <TableCell>
                <HashDisplay hash={right.hash} />
              </TableCell>
              <TableCell>
                <Checkbox
                  checked={checked}
                  onCheckedChange={(c) => onToggleRight(right, !!c)}
                />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  );
}

/* ------------------------------------------------------------------
   Step 1: File Selection
------------------------------------------------------------------ */
interface FileSelectionStepProps extends StepProps {
  setSchemaDefinition: (schema: any) => void;
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
        const schemaPromise = new Promise((resolve, reject) => {
          schemaReader.onload = (e) => {
            try {
              const parsed = JSON.parse(e.target?.result as string);
              console.log("Schema parsed:", parsed);
              resolve(parsed);
            } catch (err) {
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
  appendSelected,
  setAppendSelected,
  wComputeSelected,
  setWComputeSelected,
  pyComputeSelected,
  setPyComputeSelected
}: StepProps & {
  appendSelected: boolean;
  setAppendSelected: (b: boolean) => void;
  wComputeSelected: boolean;
  setWComputeSelected: (b: boolean) => void;
  pyComputeSelected: boolean;
  setPyComputeSelected: (b: boolean) => void;
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
        const data = await response.json()
        setDigitalRights(data)
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

  const handleToggleRight = (right: DigitalRight, checked: boolean) => {
    const name = right.name.toLowerCase()
    if (name.includes('append')) {
      setAppendSelected(checked)
    } else if (name.includes('wasm')) {
      setWComputeSelected(checked)
    } else if (name.includes('python')) {
      setPyComputeSelected(checked)
    }
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

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Assign Digital Rights</h2>

      <Card>
        <DigitalRightsTable 
          digitalRights={digitalRights}
          onToggleRight={handleToggleRight}
          appendSelected={appendSelected}
          wComputeSelected={wComputeSelected}
          pyComputeSelected={pyComputeSelected}
        />
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onPrev} className={buttonOutlineClass}>
          Previous
        </Button>
        <Button 
          onClick={onNext} 
          className={buttonBaseClass}
        >
          Next
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------
   Step 3: Final pool creation (Name, Description, Supplies, On-Chain)
------------------------------------------------------------------ */
interface PoolCreationStepProps extends StepProps {
  appendSelected: boolean;
  wComputeSelected: boolean;
  pyComputeSelected: boolean;
  setPoolCreated: (value: React.SetStateAction<boolean>) => void;
  schemaDefinition: any;
  dataFile: File | null;
}

function PoolCreationStep({
  isActive,
  onNext,
  onPrev,
  appendSelected,
  wComputeSelected,
  pyComputeSelected,
  setPoolCreated,
  schemaDefinition,
  dataFile
}: PoolCreationStepProps) {
  const program = useDrtProgram();
  const { publicKey } = useWallet();

  const [poolName, setPoolName] = useState("");
  const [description, setDescription] = useState("");
  const [poolId, setPoolId] = useState(1);
  const [poolNameLocked, setPoolNameLocked] = useState(false);
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [skipVmCreation, setSkipVmCreation] = useState(false);
  const [teeDeploymentId, setTeeDeploymentId] = useState<string | null>(null);
  const [teeStatus, setTeeStatus] = useState<string | null>(null);
  const [ownershipSupply, setOwnershipSupply] = useState(1000000);
  const [appendSupply, setAppendSupply] = useState(5000);
  const [wComputeSupply, setWComputeSupply] = useState(800);
  const [pyComputeSupply, setPyComputeSupply] = useState(800);
  const [appendCost, setAppendCost] = useState(100000000); // 0.1 SOL in lamports
  const [wComputeCost, setWComputeCost] = useState(100000000); // 0.1 SOL in lamports
  const [pyComputeCost, setPyComputeCost] = useState(100000000); // 0.1 SOL in lamports
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

  const checkTEEStatus = async (requestId: string) => {
    if (skipVmCreation) {
      console.log("Skipping TEE status check as VM creation is disabled");
      return { status: 'completed', public_ip: '127.0.0.1', vm_name: 'mock-vm' };
    }
    
    try {
      const response = await fetch(`/api/deployments/${requestId}`);
      if (!response.ok) {
        if (response.status === 404) return { status: 'pending' };
        throw new Error(`Failed to check TEE status (Status ${response.status})`);
      }
      return await response.json();
    } catch (error) {
      console.error('TEE status check error:', error);
      throw error;
    }
  };

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
      }, 30000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [teeDeploymentId, teeStatus, skipVmCreation]);

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
  }, [skipVmCreation, appendSelected, wComputeSelected, pyComputeSelected]);

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
  
      // Prepare DRT configurations for the pool creation
      const drtConfigs = [];
      
      if (appendSelected) {
        drtConfigs.push({
          drtType: "append",
          supply: new BN(appendSupply),
          cost: new BN(appendCost),
          githubUrl: "https://github.com/nautilus-project/append",
          codeHash: undefined // Changed from null to undefined to match TypeScript expectations
        });
      }
      
      if (wComputeSelected) {
        drtConfigs.push({
          drtType: "w_compute_median",
          supply: new BN(wComputeSupply),
          cost: new BN(wComputeCost),
          githubUrl: "https://github.com/nautilus-project/w_compute_median",
          codeHash: undefined // Changed from null to undefined
        });
      }
      
      if (pyComputeSelected) {
        drtConfigs.push({
          drtType: "py_compute_median",
          supply: new BN(pyComputeSupply),
          cost: new BN(pyComputeCost),
          githubUrl: "https://github.com/nautilus-project/py_compute_median",
          codeHash: undefined // Changed from null to undefined
        });
      }
  
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

      // 1) anchor-side structs must be ‘null’-clean; helper does that
      const formatted = formatDrtConfigs(drtConfigs);

      // 2) build the TX locally
      const { tx, pdas } = await buildPoolCreationTx(
        program,
        provider,
        poolName,
        formatted,
        new BN(ownershipSupply)
      );

      // 3) sign & send once
      updateProgress(1, "Waiting for wallet signature…", "loading");
      const sig = await provider.sendAndConfirm(tx, [], { commitment: "confirmed" });

      console.log("Pool TX:", sig);
      updateProgress(1, "Pool created (mints initialised & funded)", "success");

      const chainAddress   = pdas.poolPda.toBase58();
      const feeVaultBump   = (await getFeeVaultPda(pdas.poolPda, program.programId))[1];      
  
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
  
        // Create the data pool in the enclave
        updateProgress(3, "Creating new data pool in the enclave", "loading");
        const dataReader = new FileReader();
        const dataPromise = new Promise((resolve, reject) => {
          dataReader.onload = (e) => {
            try {
              const data = JSON.parse(e.target?.result as string);
              console.log("Data file parsed for enclave:", data);
              resolve(data);
            } catch (err) {
              reject(new Error("Invalid JSON in data file"));
            }
          };
          dataReader.onerror = () => reject(new Error("Failed to read data file"));
          dataReader.readAsText(dataFile!);
        });
  
        const dataJson = await dataPromise;
  
        if (!publicIp) throw new Error("Public IP not available from TEE deployment");
  
        const proxyResponse = await fetch("/api/create-data-pool", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicIp, data: dataJson }),
        });
  
        if (!proxyResponse.ok) {
          const errorData = await proxyResponse.json();
          throw new Error(`Failed to create data pool via proxy: ${errorData.error}`);
        }
  
        const proxyResult = await proxyResponse.json();
        console.log("Proxy response:", proxyResult);
  
        if (proxyResult.result === "Data pool created, sealed, and saved successfully") {
          updateProgress(3, "Data pool created in enclave", "success");
        } else {
          throw new Error(`Unexpected response from enclave via proxy: ${proxyResult.result}`);
        }
      }
  
      // Save the pool metadata
      const currentStep = skipVmCreation ? 2 : 4;
      updateProgress(currentStep, "Saving pool data off-chain", 'loading');
      
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
  
    } catch (error: any) {
      console.error("Pool creation error:", error);
      updateProgress(progress?.step || 0, `Error during pool creation: ${error.message}`, 'error', "Please check console for details");
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
              maxLength={50}
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
          {poolNameLocked && (
            <p className="mt-1 text-xs text-gray-500">
              This pool will be created with ID #{poolId}
            </p>
          )}
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
      
      <div className="flex items-center space-x-2 mt-4">
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
      </div>
      
      <div className="h-2" />
      <Card className="p-4 mt-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-800">Token Supply Configuration</h3>
          <div className="flex items-center text-sm text-gray-600 space-x-2">
            <Wallet size={16} />
            <span>
              {steps.filter(s => s.walletSignatureRequired).length} wallet signatures required
            </span>
          </div>
        </div>
        <div className="bg-gray-50 rounded-md p-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
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
              
              {appendSelected && (
                <>
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium">Append DRT Supply:</label>
                  <Input
                    type="number"
                    min={1}
                    value={appendSupply}
                    onChange={(e) => setAppendSupply(Number(e.target.value))}
                    className={`w-32 ${allInputsLocked ? "bg-gray-100" : ""}`}
                    disabled={allInputsLocked}
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium">Append DRT Cost (lamports):</label>
                  <Input
                    type="number"
                    min={1}
                    value={appendCost}
                    onChange={(e) => setAppendCost(Number(e.target.value))}
                    className={`w-32 ${allInputsLocked ? "bg-gray-100" : ""}`}
                    disabled={allInputsLocked}
                  />
                  <span className="text-xs text-gray-500">
                    ({(appendCost / 1_000_000_000).toFixed(3)} SOL)
                  </span>
                </div>
                </>
              )}
            </div>
            
            <div className="space-y-4">
              {wComputeSelected && (
                <>
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium">W Compute DRT Supply:</label>
                  <Input
                    type="number"
                    min={1}
                    value={wComputeSupply}
                    onChange={(e) => setWComputeSupply(Number(e.target.value))}
                    className={`w-32 ${allInputsLocked ? "bg-gray-100" : ""}`}
                    disabled={allInputsLocked}
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium">W Compute Cost (lamports):</label>
                  <Input
                    type="number"
                    min={1}
                    value={wComputeCost}
                    onChange={(e) => setWComputeCost(Number(e.target.value))}
                    className={`w-32 ${allInputsLocked ? "bg-gray-100" : ""}`}
                    disabled={allInputsLocked}
                  />
                  <span className="text-xs text-gray-500">
                    ({(wComputeCost / 1_000_000_000).toFixed(3)} SOL)
                  </span>
                </div>
                </>
              )}
              
              {pyComputeSelected && (
                <>
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium">Py Compute DRT Supply:</label>
                  <Input
                    type="number"
                    min={1}
                    value={pyComputeSupply}
                    onChange={(e) => setPyComputeSupply(Number(e.target.value))}
                    className={`w-32 ${allInputsLocked ? "bg-gray-100" : ""}`}
                    disabled={allInputsLocked}
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium">Py Compute Cost (lamports):</label>
                  <Input
                    type="number"
                    min={1}
                    value={pyComputeCost}
                    onChange={(e) => setPyComputeCost(Number(e.target.value))}
                    className={`w-32 ${allInputsLocked ? "bg-gray-100" : ""}`}
                    disabled={allInputsLocked}
                  />
                  <span className="text-xs text-gray-500">
                    ({(pyComputeCost / 1_000_000_000).toFixed(3)} SOL)
                  </span>
                </div>
                </>
              )}
            </div>
          </div>
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
              disabled={!poolNameLocked || !description.trim() || isSubmitting || allInputsLocked}
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
  const [schemaDefinition, setSchemaDefinition] = useState<any>(null);
  const [dataFile, setDataFile] = useState<File | null>(null);
  const [appendSelected, setAppendSelected] = useState(false)
  const [wComputeSelected, setWComputeSelected] = useState(false)
  const [pyComputeSelected, setPyComputeSelected] = useState(false)
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
          appendSelected={appendSelected}
          setAppendSelected={setAppendSelected}
          wComputeSelected={wComputeSelected}
          setWComputeSelected={setWComputeSelected}
          pyComputeSelected={pyComputeSelected}
          setPyComputeSelected={setPyComputeSelected}
        />
        <PoolCreationStep
          isActive={currentStep === 3}
          onNext={() => {
            alert('Pool creation flow completed!')
            setCurrentStep(1)
            setDataFile(null)
          }}
          onPrev={() => setCurrentStep(2)}
          appendSelected={appendSelected}
          wComputeSelected={wComputeSelected}
          pyComputeSelected={pyComputeSelected}
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