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
// app/pools/PoolsTable.tsx
'use client';

import { useState, useEffect, JSX } from 'react';
import { useDrtProgram } from "@/lib/useDrtProgram";
import { useWallet } from "@solana/wallet-adapter-react";
import { redeemDrt } from "@/lib/drtHelpers";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import FilePicker from '@/components/FilePicker';
import { SchemaPreview, validateJsonSchema } from '@/components/schemaUtils';
import { ExternalLink, Shield, Upload, Code2, Eye, RefreshCcw, Check, AlertTriangle } from 'lucide-react';
import { ChevronDown, ChevronUp, ChevronsUpDown, Loader2 } from "lucide-react";

interface EnclaveMeasurement {
  mrenclave: string;
  mrsigner: string;
  isvProdId: string;
  isvSvn: string;
  publicIp?: string;
  actualName?: string;
}

interface DRT {
  id: string;
  name: string;
  description: string;
}

interface Pool {
  id: string;  
  name: string;
  description: string;
  chainAddress: string;
  vaultAddress: string;
  feeVaultAddress: string;
  ownershipMintAddress: string;
  schemaDefinition: JSON; 
  enclaveMeasurement?: EnclaveMeasurement;
  allowedDRTs: {
    drt: DRT;
  }[];
  isOwned: boolean;
  ownerId: string;
}

interface DRTInstance {
  id: string;
  mintAddress: string;
  drt: {
    id: string;
    name: string;
  };
  poolId: string;
  ownerId: string;
  state: string;
}

interface AttestationResult {
  success: boolean;
  error?: string;
  stdout?: string;
  measurements?: EnclaveMeasurement;
}

interface Progress {
  step: number;
  total: number;
  message: string;
  icon: JSX.Element;
  status: 'loading' | 'success' | 'error';
  details?: string;
}

const EnclaveDialog = ({ pool, onAttest }: { pool: Pool; onAttest: () => Promise<AttestationResult> }) => {
  const [isAttesting, setIsAttesting] = useState(false);
  const [attestationResult, setAttestationResult] = useState<AttestationResult | null>(null);
  const [showOutput, setShowOutput] = useState(false);
  
  const handleAttest = async () => {
    setIsAttesting(true);
    setAttestationResult(null);
    try {
      const result = await onAttest();
      setAttestationResult(result);
    } catch (error) {
      setAttestationResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during attestation',
      });
    } finally {
      setIsAttesting(false);
    }
  };

  if (!pool.enclaveMeasurement) {
    return (
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enclave Verification - {pool.name}</DialogTitle>
          <DialogDescription>
            No enclave measurements available for this pool
          </DialogDescription>
        </DialogHeader>
        <Alert>
          <AlertDescription>
            This pool does not have any enclave measurements configured.
          </AlertDescription>
        </Alert>
      </DialogContent>
    );
  }

  const command = `[APPLICATION_PORT=443 APPLICATION_HOST=${pool.enclaveMeasurement.publicIp || 'unknown'}] ./attest dcap ${pool.enclaveMeasurement.mrenclave} ${pool.enclaveMeasurement.mrsigner} ${pool.enclaveMeasurement.isvProdId} ${pool.enclaveMeasurement.isvSvn}`;

  const getButtonProps = () => {
    if (isAttesting) {
      return {
        text: 'Running Attestation...',
        className: 'bg-gray-200 text-gray-700 cursor-not-allowed',
        disabled: true,
        icon: <Loader2 className="w-4 h-4 mr-2 animate-spin" />,
      };
    }
    if (attestationResult?.success) {
      return {
        text: 'Verified',
        className: 'bg-green-100 text-green-700 cursor-not-allowed',
        disabled: true,
        icon: <Shield className="w-4 h-4 mr-2" />,
      };
    }
    if (attestationResult && !attestationResult.success) {
      return {
        text: 'Retry Attestation',
        className: 'border-red-500 text-red-500 hover:bg-red-50',
        disabled: false,
        icon: <Shield className="w-4 h-4 mr-2" />,
      };
    }
    return {
      text: 'Attest Enclave',
      className: '',
      disabled: !pool.enclaveMeasurement || !pool.enclaveMeasurement.publicIp || !pool.enclaveMeasurement.actualName,
      icon: <Shield className="w-4 h-4 mr-2" />,
    };
  };

  const buttonProps = getButtonProps();

  return (
    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Enclave Verification - {pool.name}</DialogTitle>
        <DialogDescription>
          Verify the integrity and authenticity of the trusted computing environment
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Enclave Measurements</h3>
          
          <div className="grid gap-4">
            <div>
              <Label className="text-sm">MRENCLAVE (Unique identity of code and data)</Label>
              <div className="font-mono text-sm bg-gray-100 p-2 rounded break-all">
                {pool.enclaveMeasurement.mrenclave}
              </div>
            </div>
            
            <div>
              <Label className="text-sm">MRSIGNER (Identity of enclave signer)</Label>
              <div className="font-mono text-sm bg-gray-100 p-2 rounded break-all">
                {pool.enclaveMeasurement.mrsigner}
              </div>
            </div>
            
            <div className="flex gap-8">
              <div>
                <Label className="text-sm">ISV_PROD_ID (Product ID)</Label>
                <div className="font-mono text-sm bg-gray-100 p-2 rounded">
                  {pool.enclaveMeasurement.isvProdId}
                </div>
              </div>
              
              <div>
                <Label className="text-sm">ISV_SVN (Security Version Number)</Label>
                <div className="font-mono text-sm bg-gray-100 p-2 rounded">
                  {pool.enclaveMeasurement.isvSvn}
                </div>
              </div>
            </div>

            <div>
              <Label className="text-sm">Public IP</Label>
              <div className="font-mono text-sm bg-gray-100 p-2 rounded">
                {pool.enclaveMeasurement.publicIp || 'Not available'}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <a
              href="https://github.com/ntls-io/trusted-compute-MVP/blob/main/sgx-mvp/attest.c"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-blue-500 hover:text-blue-700"
            >
              <Code2 className="w-4 h-4" />
              View Attestation Source Code
            </a>
            
            <Button 
              onClick={handleAttest} 
              disabled={buttonProps.disabled}
              className={buttonProps.className}
            >
              {buttonProps.icon}
              {buttonProps.text}
            </Button>
          </div>

          <div className="text-sm text-gray-500">
            Command that will be executed:<br />
            <code className="font-mono bg-gray-100 p-1 text-xs break-all">
              {command}
            </code>
          </div>

          {attestationResult && (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Attestation Result</h3>
              {attestationResult.success ? (
                <Alert className="bg-green-50 border-green-200">
                  <AlertDescription>Attestation successful!</AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <AlertDescription>
                    Attestation failed: {attestationResult.error}
                  </AlertDescription>
                </Alert>
              )}
              {attestationResult.stdout && (
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowOutput(!showOutput)}
                    className="w-full"
                  >
                    {showOutput ? 'Hide Output' : 'Show Output'}
                  </Button>
                  {showOutput && (
                    <div>
                      <Label className="text-sm">Attestation Output</Label>
                      <pre className="font-mono text-sm bg-gray-100 p-2 rounded max-h-40 overflow-y-auto whitespace-pre-wrap">
                        {attestationResult.stdout}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </DialogContent>
  );
};

const JoinPoolDialog = ({ pool, drtInstances, fetchUserData }: { pool: Pool; drtInstances: DRTInstance[]; fetchUserData: () => Promise<void> }) => {
  const program = useDrtProgram();
  const wallet = useWallet();
  const [dataFile, setDataFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<{
    success: boolean | null;
    error: string | null;
  }>({
    success: null,
    error: null,
  });
  const [isValidating, setIsValidating] = useState(false);
  const [selectedDrt, setSelectedDrt] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [progress, setProgress] = useState<Progress>({
    step: 0,
    total: 3,
    message: "Awaiting join pool action",
    icon: <RefreshCcw size={18} className="animate-spin text-blue-500" />,
    status: "loading",
  });

  const appendDrts = drtInstances.filter(drt => 
    drt.poolId === pool.id && 
    drt.drt.name.toLowerCase().includes('append') && 
    drt.state === 'active'
  );

  const updateProgress = (
    step: number,
    message: string,
    status: 'loading' | 'success' | 'error' = 'loading',
    details?: string
  ) => {
    const totalSteps = 3; // Validate, Redeem, Append
    const icon = status === 'loading'
      ? <RefreshCcw size={18} className="animate-spin text-blue-500" />
      : status === 'success'
        ? <Check size={18} className="text-green-500" />
        : <AlertTriangle size={18} className="text-red-500" />;
    setProgress({ step, total: totalSteps, message, icon, status, details });
  };

  const handleValidateData = async () => {
    if (!dataFile) {
      setValidation({ success: false, error: 'Please select a data file' });
      return;
    }

    setIsValidating(true);
    updateProgress(0, "Validating data against schema", "loading");

    try {
      const schemaBlob = new Blob([JSON.stringify(pool.schemaDefinition)], { type: 'application/json' });
      const schemaFile = new File([schemaBlob], "schema.json", { type: 'application/json' });
      const result = await validateJsonSchema(schemaFile, dataFile);
      setValidation(result);

      if (result.success) {
        updateProgress(1, "Data validated successfully", "success");
      } else {
        updateProgress(0, "Data validation failed", "error", result.error || "Unknown validation error");
      }
    } catch (error) {
      setValidation({
        success: false,
        error: 'An error occurred during validation: ' + (error instanceof Error ? error.message : String(error)),
      });
      updateProgress(0, "Error during validation", "error", error instanceof Error ? error.message : String(error));
    } finally {
      setIsValidating(false);
    }
  };

  const handleJoinPool = async () => {
    if (!program || !wallet.connected || !wallet.publicKey) {
      updateProgress(0, "Wallet not connected or program not loaded", "error");
      return;
    }
    if (!selectedDrt) {
      updateProgress(0, "Please select an Append DRT", "error");
      return;
    }
    if (!validation.success) {
      updateProgress(0, "Please validate your data first", "error");
      return;
    }

    setIsJoining(true);
    try {
      const drtInstance = appendDrts.find(drt => drt.id === selectedDrt);
      if (!drtInstance) throw new Error("Selected DRT not found");

      const poolPubkey = new PublicKey(pool.chainAddress);
      const drtMint = new PublicKey(drtInstance.mintAddress);
      const ownershipMint = new PublicKey(pool.ownershipMintAddress);
      const userDrtTokenAccount = await getAssociatedTokenAddress(drtMint, wallet.publicKey);
      const userOwnershipTokenAccount = await getAssociatedTokenAddress(ownershipMint, wallet.publicKey);

      updateProgress(1, "Redeeming Append DRT", "loading", "Please sign with your wallet");
      const { tx, ownershipTokenReceived } = await redeemDrt(
        program,
        poolPubkey,
        drtMint,
        ownershipMint,
        userDrtTokenAccount,
        userOwnershipTokenAccount,
        "append",
        wallet,
        (status) => updateProgress(1, status, "loading")
      );

      if (!ownershipTokenReceived) throw new Error("Ownership token not received");
      updateProgress(2, "Append DRT redeemed, ownership token received", "success", `Tx: ${tx}`);

      const dataReader = new FileReader();
      const dataPromise = new Promise((resolve, reject) => {
        dataReader.onload = (e) => {
          try {
            const data = JSON.parse(e.target?.result as string);
            resolve(data);
          } catch (err) {
            reject(new Error("Invalid JSON in data file"));
          }
        };
        dataReader.onerror = () => reject(new Error("Failed to read data file"));
        dataReader.readAsText(dataFile!);
      });

      const dataJson = await dataPromise;
      const publicIp = pool.enclaveMeasurement?.publicIp;
      if (!publicIp) throw new Error("Enclave public IP not available");

      updateProgress(2, "Appending data to enclave", "loading");
      const response = await fetch("/api/append-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicIp, data: dataJson }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Enclave error (Status ${response.status})`);
      }

      const result = await response.json();
      if (result.result === "Data appended, sealed, and saved successfully") {
        updateProgress(3, "Data appended successfully", "success", result.result);

        await fetch('/api/update-drt-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            drtInstanceId: drtInstance.id,
            state: 'completed',
          }),
        });

        await fetchUserData();
      } else {
        throw new Error(`Unexpected enclave response: ${result.result}`);
      }
    } catch (error) {
      console.error("Join pool error:", error);
      updateProgress(progress.step, `Error: ${error instanceof Error ? error.message : String(error)}`, "error");
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Join Pool - {pool.name}</DialogTitle>
        <DialogDescription>
          Redeem an Append DRT to add data to this pool and receive an ownership token.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6">
        <div className="space-y-4">
          <h5 className="text-lg font-semibold">Step 1: Select Append DRT</h5>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Mint Address</TableHead>
                <TableHead>Select</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appendDrts.map((drt) => (
                <TableRow key={drt.id}>
                  <TableCell>{drt.drt.name}</TableCell>
                  <TableCell>{drt.mintAddress}</TableCell>
                  <TableCell>
                    <Input
                      type="radio"
                      name="drt"
                      value={drt.id}
                      checked={selectedDrt === drt.id}
                      onChange={() => setSelectedDrt(drt.id)}
                      disabled={isJoining}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {appendDrts.length === 0 && (
            <Alert variant="destructive">
              <AlertDescription>No active Append DRTs available for this pool.</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="space-y-4">
          <h5 className="text-lg font-semibold">Step 2: Upload and Validate Data</h5>
            <div className="space-y-2 text-center">
            <SchemaPreview schema={pool.schemaDefinition} />
            <FilePicker
              label="Upload Data File"
              accept=".json"
              onChange={(file) => {
              setDataFile(file);
              setValidation({ success: null, error: null });
              }}
            />
            <Button
              onClick={handleValidateData}
              disabled={!dataFile || isValidating || isJoining}
              className="w-full bg-gray-900 text-white hover:bg-gray-800"
            >
              {isValidating ? 'Validating...' : 'Validate Data'}
            </Button>
            {validation.error && (
              <Alert variant="destructive">
              <AlertDescription>{validation.error}</AlertDescription>
              </Alert>
            )}
            {validation.success && (
              <Alert>
              <AlertDescription>Data matches the pool schema.</AlertDescription>
              </Alert>
            )}
            </div>
        </div>

        <div className="space-y-4">
          <h5 className="text-lg font-semibold">Step 3: Join Pool</h5>
          <Button
            onClick={handleJoinPool}
            disabled={!selectedDrt || !validation.success || isJoining || !wallet.connected}
            className="w-full bg-gray-900 text-white hover:bg-gray-800"
          >
            {isJoining ? 'Joining...' : 'Join Pool'}
          </Button>

          <div className="pt-2">
            <div className="mb-2 flex justify-between items-center">
              <h6 className="font-medium text-gray-700">Progress</h6>
              <span className="text-sm font-medium text-gray-500">Step {progress.step}/{progress.total}</span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  progress.status === 'error' ? 'bg-red-500' : 'bg-gradient-to-r from-blue-400 to-blue-600'
                }`}
                style={{ width: `${Math.max((progress.step / progress.total) * 100, 5)}%` }}
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
          </div>
        </div>
      </div>
    </DialogContent>
  );
};

const PoolsTableSkeleton = () => (
  <Card className="w-full overflow-hidden">
    <div className="bg-gray-800 p-4 flex justify-between items-center gap-4">
      <div className="h-10 bg-gray-200 w-full max-w-md rounded animate-pulse"></div>
      <div className="flex items-center space-x-2">
        <div className="h-6 w-12 bg-gray-200 rounded animate-pulse"></div>
        <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>
      </div>
    </div>

    <Table>
      <TableHeader className="bg-gray-800 [&_tr]:border-0">
        <TableRow className="hover:bg-gray-800">
          {['Pool Name', 'Description', 'Digital Rights Tokens', 'Sources', 'Actions'].map((header, index) => (
            <TableHead key={index} className="text-white">
              {header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          {[...Array(5)].map((_, cellIndex) => (
            <TableCell key={cellIndex}>
              <div className="flex items-center space-x-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </div>
            </TableCell>
          ))}
        </TableRow>
      </TableBody>
    </Table>
  </Card>
);

// Color schema for different DRT types
const DrtTypeColors: Record<string, string> = {
  APPEND_DATA_POOL: "bg-blue-100 text-blue-800",
  EXECUTE_MEDIAN_PYTHON: "bg-yellow-100 text-yellow-800",
  EXECUTE_MEDIAN_WASM: "bg-green-100 text-green-800",
};

const getDrtTypeColor = (name: string): string => {
  if (DrtTypeColors[name]) return DrtTypeColors[name];
  if (name.includes('Append')) 
    return "bg-blue-100 text-blue-800";
  if (name.includes('Python')) 
    return "bg-yellow-100 text-yellow-800";
  if (name.includes('WASM')) 
    return "bg-green-100 text-green-800";
  return "bg-gray-100 text-gray-800";
};

export function PoolsTable({ poolCreated }: { poolCreated?: boolean }) {
  const program = useDrtProgram();
  const wallet = useWallet();
  const [search, setSearch] = useState('');
  const [showMyPools, setShowMyPools] = useState(false);
  const [pools, setPools] = useState<Pool[]>([]);
  const [drtInstances, setDrtInstances] = useState<DRTInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [attestationResults, setAttestationResults] = useState<Record<string, AttestationResult>>({});
  const [sortField, setSortField] = useState<"name" | "description" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc" | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const fetchUserData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/user-data');
      if (!response.ok) {
        if (response.status === 401) {
          setApiError("Unauthorized access. Please log in.");
          setPools([]);
          setDrtInstances([]);
          return;
        }
        const errorData = await response.text();
        throw new Error(`Failed to fetch user data: ${errorData}`);
      }
      const data = await response.json();
      console.log('Fetched User Data:', data);

      const poolsWithOwnership = data.pools.map((pool: Pool) => ({
        ...pool,
        isOwned: wallet.publicKey ? pool.ownerId === wallet.publicKey.toBase58() : false,
      }));

      setPools(poolsWithOwnership);
      setDrtInstances(data.drtInstances || []);
      setApiError(null);
    } catch (error) {
      console.error('Error fetching user data:', error);
      setApiError("Failed to load pools. Please check your connection or log in.");
      setPools([]);
      setDrtInstances([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserData();
  }, [poolCreated]); // Removed wallet.publicKey from dependencies

  const handleAttestation = async (pool: Pool): Promise<AttestationResult> => {
    if (!pool.enclaveMeasurement || !pool.enclaveMeasurement.publicIp || !pool.enclaveMeasurement.actualName) {
      return {
        success: false,
        error: 'Missing enclave measurements, public IP, or VM name',
      };
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/attestation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vm_name: pool.enclaveMeasurement.actualName,
          mrenclave: pool.enclaveMeasurement.mrenclave,
          mrsigner: pool.enclaveMeasurement.mrsigner,
          isvprodid: pool.enclaveMeasurement.isvProdId,
          isvsvn: pool.enclaveMeasurement.isvSvn,
          port: 443,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Attestation failed with status ${response.status}`);
      }

      const data = await response.json();
      setAttestationResults((prev) => ({
        ...prev,
        [pool.id]: {
          success: data.success,
          stdout: data.details.stdout,
          measurements: pool.enclaveMeasurement,
        },
      }));
      return {
        success: data.success,
        stdout: data.details.stdout,
        measurements: pool.enclaveMeasurement,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setAttestationResults((prev) => ({
        ...prev,
        [pool.id]: {
          success: false,
          error: errorMessage,
        },
      }));
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  const filteredPools = [...pools]
    .filter((pool) => !showMyPools || pool.isOwned)
    .filter((pool) =>
      pool.name.toLowerCase().includes(search.toLowerCase()) ||
      pool.description.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (!sortField) return 0;
      const valueA = a[sortField].toLowerCase();
      const valueB = b[sortField].toLowerCase();
      return sortDirection === "asc" ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);
    });

  const handleSort = (field: "name" | "description") => {
    if (sortField === field) {
      if (sortDirection === "asc") setSortDirection("desc");
      else if (sortDirection === "desc") {
        setSortField(null);
        setSortDirection(null);
      } else setSortDirection("asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };    

  const getSortIcon = (field: "name" | "description") => 
    sortField === field 
      ? sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
      : <ChevronsUpDown className="h-4 w-4" />;    

  if (loading) {
    return <PoolsTableSkeleton />;
  }

  return (
    <Card className="w-full overflow-hidden">
      {apiError && (
        <Alert variant="destructive" className="m-4">
          <AlertDescription>{apiError}</AlertDescription>
        </Alert>
      )}
      <div className="bg-gray-800 p-4 flex justify-between items-center gap-4">
        <Input
          placeholder="Search pools..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md bg-white"
        />
        <div className="flex items-center space-x-2">
          <Switch
            id="show-my-pools"
            checked={showMyPools}
            onCheckedChange={setShowMyPools}
            className="data-[state=checked]:bg-green-600"
          />
          <Label htmlFor="show-my-pools" className="cursor-pointer text-white">
            Show my pools only
          </Label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-gray-800 [&_tr]:border-0">
            <TableRow className="hover:bg-gray-800">
              <TableHead className="w-[15%] text-white cursor-pointer" onClick={() => handleSort("name")}>
                <div className="flex items-center gap-2">
                  Pool Name {getSortIcon("name")}
                </div>
              </TableHead>
              <TableHead className="w-[20%] text-white cursor-pointer" onClick={() => handleSort("description")}>
                <div className="flex items-center gap-2">
                  Description {getSortIcon("description")}
                </div>
              </TableHead>
              <TableHead className="w-[20%] text-white">Digital Rights Tokens</TableHead>
              <TableHead className="w-[35%] text-white">Sources</TableHead>
              <TableHead className="w-[10%] text-white">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPools.map((pool) => (
              <TableRow key={pool.id}>
                <TableCell className="font-medium">{pool.name}</TableCell>
                <TableCell>{pool.description}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {pool.allowedDRTs.map(({ drt }) => (
                      <TooltipProvider key={drt.id}>
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge 
                              className={`cursor-help ${getDrtTypeColor(drt.name)}`}
                            >
                              {drt.name}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="p-3 max-w-xs bg-gray-900 text-white">
                            <h3 className="font-semibold mb-1">{drt.name}</h3>
                            <p className="text-sm text-gray-200">{drt.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium whitespace-nowrap">Pool PDA:</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={`https://explorer.solana.com/address/${pool.chainAddress}?cluster=devnet`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-blue-500 hover:text-blue-700"
                            >
                              <span>Link</span>
                              <ExternalLink size={16} />
                            </a>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-mono text-xs">{pool.chainAddress}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium whitespace-nowrap">Vault PDA:</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={`https://explorer.solana.com/address/${pool.vaultAddress}?cluster=devnet`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-blue-500 hover:text-blue-700"
                            >
                              <span>Link</span>
                              <ExternalLink size={16} />
                            </a>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-mono text-xs">{pool.vaultAddress}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium whitespace-nowrap">Fee Vault PDA:</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={`https://explorer.solana.com/address/${pool.feeVaultAddress}?cluster=devnet`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-blue-500 hover:text-blue-700"
                            >
                              <span>Link</span>
                              <ExternalLink size={16} />
                            </a>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-mono text-xs">{pool.feeVaultAddress}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium whitespace-nowrap">Enclave:</span>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className={attestationResults[pool.id]?.success ? 'bg-green-50' : ''}
                            disabled={!pool.enclaveMeasurement}
                          >
                            <Shield className="w-4 h-4 mr-2" />
                            {!pool.enclaveMeasurement 
                              ? 'No Enclave Measurements'
                              : attestationResults[pool.id]?.success 
                                ? 'Verified' 
                                : 'Verify Enclave'}
                          </Button>
                        </DialogTrigger>
                        <EnclaveDialog 
                          pool={pool} 
                          onAttest={() => handleAttestation(pool)} 
                        />
                      </Dialog>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full hover:bg-gray-100"
                        disabled={!pool.allowedDRTs.some(({ drt }) => drt.name === "Append Data Pool") || !wallet.connected}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Join Pool
                      </Button>
                    </DialogTrigger>
                    <JoinPoolDialog pool={pool} drtInstances={drtInstances} fetchUserData={fetchUserData} />
                  </Dialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

export default PoolsTable;