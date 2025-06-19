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

// ntc-web/app/page.tsx
"use client";

import React, { useEffect, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { ExternalLink, ChevronDown, ChevronUp, ChevronsUpDown, Shield, Code2, Loader2, CheckCircle2, Check, LoaderCircle } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useDrtProgram } from "@/lib/useDrtProgram";
import { useWallet } from "@solana/wallet-adapter-react";
import { redeemDrt } from "@/lib/drtHelpers";
import PoolAccount from "@/components/PoolAccount";
import { useUser } from "@clerk/nextjs";
import { useUserProfile, ClientRoleName } from '@/hooks/useUserProfile';
import { useRouter, usePathname } from 'next/navigation';

// Interfaces
interface Pool {
  id: string;
  name: string;
  description: string;
  chainAddress: string;
  vaultAddress: string;
  feeVaultAddress: string;
  ownershipMintAddress: string;
  schemaDefinition: JSON;
  enclaveMeasurement?: {
    mrenclave: string;
    mrsigner: string;
    isvProdId: string;
    isvSvn: string;
    publicIp?: string;
    actualName?: string;
  };
  allowedDRTs: {
    drt: {
      id: string;
      name: string;
      description: string;
      githubUrl?: string;
      hash?: string;
    };
  }[];
}

interface DRTInstance {
  id: string;
  mintAddress: string;
  drt: {
    id: string;
    name: string;
    description: string;
    githubUrl?: string;
    hash?: string;
  };
  pool: {
    name: string;
    description: string;
    chainAddress: string;
    ownershipMintAddress: string;
    schemaDefinition: JSON;
    enclaveMeasurement?: {
      publicIp?: string;
    };
  };
  state: string;
  isListed: boolean;
  price: number;
}

interface AttestationResult {
  success: boolean;
  error?: string;
  stdout?: string;
  measurements?: {
    mrenclave: string;
    mrsigner: string;
    isvProdId: string;
    isvSvn: string;
    publicIp?: string;
    actualName?: string;
  };
}

interface ExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
}

const mapDrtTypeForChain = (name: string): string => {
  switch (name) {
    case 'Execute Median Python':
      return 'py_compute_median';
    case 'Execute Median WASM':
      return 'w_compute_median';
    case 'Append Data Pool':
      return 'append';
    default:
      return name.toLowerCase(); // fallback
  }
};

// Enclave Dialog Component (unchanged)
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

// Python Execution Dialog Component
const PythonExecutionDialog = ({ 
  drtInstance, 
  onRedeem, 
  onStateUpdate,
  program,
  wallet
}: { 
  drtInstance: DRTInstance; 
  onRedeem: () => Promise<ExecutionResult>; 
  onStateUpdate: (newState: string) => void; 
  program: any;
  wallet: any;
}) => {
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);

  const handleRedeem = async () => {
    setIsRedeeming(true);
    setExecutionResult(null);

    try {
      if (!program || !wallet.connected)
        throw new Error("Wallet not connected or program not initialised");

      const chainDrtType = mapDrtTypeForChain(drtInstance.drt.name);
      const { tx } = await redeemDrt(
        program,
        wallet,
        drtInstance.pool.chainAddress,
        chainDrtType,
        (msg) => console.log(msg)
      );
      console.log("Solana DRT redemption successful, tx:", tx);

      const pythonResult = await onRedeem();
      setExecutionResult(pythonResult);

      if (pythonResult.success) {
        await fetch('/api/update-drt-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ drtInstanceId: drtInstance.id, state: 'completed' }),
        });
        onStateUpdate('completed');
      }
    } catch (err) {
      setExecutionResult({ success: false, error: (err as Error).message });
    } finally {
      setIsRedeeming(false);
    }
  };

  const buttonProps = {
    text: isRedeeming ? 'Redeeming...' : executionResult?.success ? 'Redeemed' : 'Redeem DRT',
    disabled: isRedeeming || executionResult?.success || !drtInstance.pool.enclaveMeasurement?.publicIp || drtInstance.state !== 'active' || !wallet.connected,
    className: isRedeeming 
      ? 'bg-gray-200 text-gray-700 cursor-not-allowed' 
      : executionResult?.success 
        ? 'bg-green-600 text-white cursor-not-allowed'
        : 'bg-blue-600 text-white hover:bg-blue-700',
    icon: isRedeeming ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />,
  };

  return (
    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Redeem Python DRT - {drtInstance.drt.name}</DialogTitle>
        <DialogDescription>
          Redeem your DRT on Solana and execute the associated Python script on the pool's data
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Execution Details</h3>
          
          <div className="grid gap-4">
            <div>
              <Label className="text-sm">Pool</Label>
              <div className="font-mono text-sm bg-gray-100 p-2 rounded">
                {drtInstance.pool.name}
              </div>
            </div>
            <div>
              <Label className="text-sm">GitHub URL</Label>
              <div className="font-mono text-sm bg-gray-100 p-2 rounded break-all">
                {drtInstance.drt.githubUrl || 'Not specified'}
              </div>
            </div>
            <div>
              <Label className="text-sm">Expected SHA256 Hash</Label>
              <div className="font-mono text-sm bg-gray-100 p-2 rounded break-all">
                {drtInstance.drt.hash || 'Not specified'}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            {drtInstance.drt.githubUrl && (
              <a
                href={drtInstance.drt.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-blue-500 hover:text-blue-700"
              >
                <Code2 className="w-4 h-4" />
                View Python Script
              </a>
            )}
            <Button 
              onClick={handleRedeem} 
              disabled={buttonProps.disabled}
              className={buttonProps.className}
            >
              {buttonProps.icon}
              {buttonProps.text}
            </Button>
          </div>

          {executionResult && (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Execution Result</h3>
              {executionResult.success ? (
                <Alert className="bg-green-50 border-green-200">
                  <AlertDescription>
                    Script executed successfully!
                    <pre className="mt-2 font-mono text-sm bg-gray-100 p-2 rounded max-h-40 overflow-y-auto">
                      {JSON.stringify(executionResult.result, null, 2)}
                    </pre>
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <AlertDescription>
                    Execution failed: {executionResult.error}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>
      </div>
    </DialogContent>
  );
};

// WASM Execution Dialog Component
const WasmExecutionDialog = ({ 
  drtInstance, 
  onRedeem, 
  onStateUpdate,
  program,
  wallet
}: { 
  drtInstance: DRTInstance; 
  onRedeem: () => Promise<ExecutionResult>; 
  onStateUpdate: (newState: string) => void; 
  program: any;
  wallet: any;
}) => {
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);

  const handleRedeem = async () => {
    setIsRedeeming(true);
    setExecutionResult(null);

    try {
      if (!program || !wallet.connected)
        throw new Error("Wallet not connected or program not initialised");

      const chainDrtType = mapDrtTypeForChain(drtInstance.drt.name);
      const { tx } = await redeemDrt(
        program,
        wallet,
        drtInstance.pool.chainAddress,
        chainDrtType,
        (msg) => console.log(msg)
      );
      console.log("Solana DRT redemption successful, tx:", tx);

      const wasmResult = await onRedeem();
      setExecutionResult(wasmResult);

      if (wasmResult.success) {
        await fetch('/api/update-drt-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ drtInstanceId: drtInstance.id, state: 'completed' }),
        });
        onStateUpdate('completed');
      }
    } catch (err) {
      setExecutionResult({ success: false, error: (err as Error).message });
    } finally {
      setIsRedeeming(false);
    }
  };

  const buttonProps = {
    text: isRedeeming ? 'Redeeming...' : executionResult?.success ? 'Redeemed' : 'Redeem DRT',
    disabled: isRedeeming || executionResult?.success || !drtInstance.pool.enclaveMeasurement?.publicIp || drtInstance.state !== 'active' || !wallet.connected,
    className: isRedeeming 
      ? 'bg-gray-200 text-gray-700 cursor-not-allowed' 
      : executionResult?.success 
        ? 'bg-green-600 text-white cursor-not-allowed'
        : 'bg-emerald-600 text-white hover:bg-emerald-700',
    icon: isRedeeming ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />,
  };

  return (
    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Redeem WASM DRT - {drtInstance.drt.name}</DialogTitle>
        <DialogDescription>
          Redeem your DRT on Solana and execute the associated WASM binary on the pool's data
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Execution Details</h3>
          
          <div className="grid gap-4">
            <div>
              <Label className="text-sm">Pool</Label>
              <div className="font-mono text-sm bg-gray-100 p-2 rounded">
                {drtInstance.pool.name}
              </div>
            </div>
            <div>
              <Label className="text-sm">GitHub URL</Label>
              <div className="font-mono text-sm bg-gray-100 p-2 rounded break-all">
                {drtInstance.drt.githubUrl || 'Not specified'}
              </div>
            </div>
            <div>
              <Label className="text-sm">Expected SHA256 Hash</Label>
              <div className="font-mono text-sm bg-gray-100 p-2 rounded break-all">
                {drtInstance.drt.hash || 'Not specified'}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            {drtInstance.drt.githubUrl && (
              <a
                href={drtInstance.drt.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-blue-500 hover:text-blue-700"
              >
                <Code2 className="w-4 h-4" />
                View WASM Binary
              </a>
            )}
            <Button 
              onClick={handleRedeem} 
              disabled={buttonProps.disabled}
              className={buttonProps.className}
            >
              {buttonProps.icon}
              {buttonProps.text}
            </Button>
          </div>

          {executionResult && (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Execution Result</h3>
              {executionResult.success ? (
                <Alert className="bg-green-50 border-green-200">
                  <AlertDescription>
                    WASM executed successfully!
                    <pre className="mt-2 font-mono text-sm bg-gray-100 p-2 rounded max-h-40 overflow-y-auto">
                      {JSON.stringify(executionResult.result, null, 2)}
                    </pre>
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <AlertDescription>
                    Execution failed: {executionResult.error}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>
      </div>
    </DialogContent>
  );
};

const PoolTableSkeleton = () => (
  <TableBody>
    <TableRow>
      <TableCell colSpan={4} className="h-16">
        <div className="flex items-center space-x-4 animate-pulse">
          <Loader2 className="mr-2 h-8 w-8 animate-spin text-gray-500" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      </TableCell>
    </TableRow>
  </TableBody>
);

const DRTTableSkeleton = () => (
  <TableBody>
    <TableRow>
      <TableCell colSpan={8} className="h-16">
        <div className="flex items-center space-x-4 animate-pulse">
          <Loader2 className="mr-2 h-8 w-8 animate-spin text-gray-500" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      </TableCell>
    </TableRow>
  </TableBody>
);

// Color schema for different DRT types
const DrtTypeColors: Record<string, string> = {
  APPEND_DATA_POOL: "bg-indigo-100 text-indigo-800 hover:bg-indigo-200",
  EXECUTE_MEDIAN_PYTHON: "bg-amber-100 text-amber-800 hover:bg-amber-200",
  EXECUTE_MEDIAN_WASM: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200",
};

// Color schema for DRT status
const DrtStatusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  pending: "bg-amber-100 text-amber-800",
  completed: "bg-blue-100 text-blue-800",
};

// Updated DRT Status Badge
const DrtStatusBadge = ({ state }: { state: string }) => {
  return (
    <Badge
      className={`${DrtStatusColors[state] || 'bg-gray-100 text-gray-800'} font-medium py-1 px-2 inline-flex items-center`}
      style={{ pointerEvents: "none" }}
    >
      {state === 'active' && <Check className="w-3.5 h-3.5 mr-1" />}
      {state === 'pending' && <LoaderCircle className="w-3.5 h-3.5 mr-1" />}
      {state === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
      {state}
    </Badge>
  );
};

const getDrtTypeColor = (name: string): string => {
  if (DrtTypeColors[name]) return DrtTypeColors[name];
  if (name.toLowerCase().includes('append')) return "bg-indigo-100 text-indigo-800 hover:bg-indigo-200";
  if (name.toLowerCase().includes('python')) return "bg-amber-100 text-amber-800 hover:bg-amber-200";
  if (name.toLowerCase().includes('wasm')) return "bg-emerald-100 text-emerald-800 hover:bg-emerald-200";
  return "bg-gray-100 text-gray-800";
};

export default function Home() {
  const program = useDrtProgram();
  const wallet = useWallet();
  const router = useRouter();
  const pathname = usePathname();
  const { isSignedIn, isLoaded: isAuthLoaded } = useUser();
  const { userProfile, roles, isLoadingProfile, isErrorProfile } = useUserProfile();
  const [isLoadingPools, setIsLoadingPools] = useState(true);
  const [isLoadingDRTs, setIsLoadingDRTs] = useState(true);
  const [pools, setPools] = useState<Pool[]>([]);
  const [drtInstances, setDrtInstances] = useState<DRTInstance[]>([]);
  const [poolSearch, setPoolSearch] = useState('');
  const [sortField, setSortField] = useState<'name' | 'description' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);
  const [attestationResults, setAttestationResults] = useState<{[key: string]: AttestationResult}>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [redeemedStates, setRedeemedStates] = useState<{ [key: string]: boolean }>({}); // Track redemption state per DRT

  useEffect(() => {
    async function fetchData() {

      if (isAuthLoaded && isSignedIn && !isLoadingProfile) { // Check profile loading state too
        if ((userProfile && roles.length === 0) || (!userProfile && isErrorProfile && (isErrorProfile as any).status === 404)) {
          // User will be redirected, so skip main data fetch.
          setIsLoadingPools(false); 
          setIsLoadingDRTs(false);
          return;
        }
      }

      if (!(isAuthLoaded && isSignedIn)) {
          setIsLoadingPools(false);
          setIsLoadingDRTs(false);
          setPools([]);
          setDrtInstances([]);
          return;
      }

      setIsLoadingPools(true);
      setIsLoadingDRTs(true);
      setApiError(null);
      
      try {
        const response = await fetch('/api/user-data');
  
        if (!response.ok) {
          if (response.status === 404) {
            console.warn("🚨 API endpoint not found (404).");
            setApiError("API endpoint not found. Please check if the backend is running.");
          } else if (response.status === 401) {
            console.warn("🚨 Unauthorized access (401).");
            setApiError("Unauthorized access. Please log in.");
          } else {
            console.error(`❌ API Error ${response.status}: ${response.statusText}`);
            setApiError(`API Error ${response.status}: ${response.statusText}`);
          }
          setPools([]);
          setDrtInstances([]);
          return;
        }
  
        const data = await response.json();
  
        setPools(Array.isArray(data.pools) ? data.pools : []);
        setDrtInstances(Array.isArray(data.drtInstances) ? data.drtInstances : []);
        const initialRedeemedStates = data.drtInstances.reduce((acc: { [key: string]: boolean }, item: DRTInstance) => {
          acc[item.id] = item.state === 'completed';
          return acc;
        }, {});
        setRedeemedStates(initialRedeemedStates);
        setApiError(null);
  
      } catch (error) {
        console.error("❌ Network error or API unavailable:", error);
        setApiError("Network error. Please check your connection or backend.");
        setPools([]);
        setDrtInstances([]);
      } finally {
        setIsLoadingPools(false);
        setIsLoadingDRTs(false);
      }
    }
  
    if (isAuthLoaded) {
      fetchData();
    }
  }, [isAuthLoaded, isSignedIn, userProfile, roles, isLoadingProfile]);

  const handlePoolSort = (field: typeof sortField) => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortField(null);
        setSortDirection(null);
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getPoolSortIcon = (field: typeof sortField) => {
    if (sortField !== field) return <ChevronsUpDown size={16} />;
    if (sortDirection === 'asc') return <ChevronUp size={16} />;
    if (sortDirection === 'desc') return <ChevronDown size={16} />;
    return <ChevronsUpDown size={16} />;
  };

  const getSolanaExplorerUrl = (address: string): string => {
    return `https://explorer.solana.com/address/${address}`;
  };

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

  const handlePythonRedeem = async (drtInstance: DRTInstance): Promise<ExecutionResult> => {
    if (!drtInstance.pool.enclaveMeasurement?.publicIp || !drtInstance.drt.githubUrl || !drtInstance.drt.hash) {
      return {
        success: false,
        error: 'Missing public IP, GitHub URL, or expected hash',
      };
    }

    try {
      const response = await fetch('/api/execute-python', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          publicIp: drtInstance.pool.enclaveMeasurement.publicIp,
          github_url: drtInstance.drt.githubUrl,
          expected_hash: drtInstance.drt.hash,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Execution failed with status ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        result: data.result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  };

  const handleWasmRedeem = async (drtInstance: DRTInstance): Promise<ExecutionResult> => {
    if (!drtInstance.pool.enclaveMeasurement?.publicIp || !drtInstance.drt.githubUrl || !drtInstance.drt.hash || !drtInstance.pool.schemaDefinition) {
      return {
        success: false,
        error: 'Missing public IP, GitHub URL, expected hash, or JSON schema',
      };
    }

    try {
      const response = await fetch('/api/execute-wasm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          publicIp: drtInstance.pool.enclaveMeasurement.publicIp,
          github_url: drtInstance.drt.githubUrl,
          expected_hash: drtInstance.drt.hash,
          json_schema: drtInstance.pool.schemaDefinition,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Execution failed with status ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        result: data.result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  };

  const handleStateUpdate = (drtInstanceId: string, newState: string) => {
    setDrtInstances(prev =>
      prev.map(item =>
        item.id === drtInstanceId ? { ...item, state: newState } : item
      )
    );
    if (newState === 'completed') {
      setRedeemedStates(prev => ({
        ...prev,
        [drtInstanceId]: true,
      }));
    }
  };

  const statsItems = [
    {
      label: "My Data Pool(s)",
      value: Array.isArray(pools) ? pools.length.toString() : "0"
    },
    {
      label: "Digital Rights Tokens Purchased",
      value: Array.isArray(drtInstances) ? drtInstances.length.toString() : "0"
    },
    {
      label: "Amount Paid Out",
      value: Array.isArray(drtInstances) && drtInstances.length > 0 
        ? `${drtInstances.reduce((sum, drt) => sum + (drt.isListed ? drt.price : 0), 0).toFixed(2)} SOL`
        : "0.00 SOL"
    }
  ];

  const [drtSearch, setDrtSearch] = useState('');
  const [stateFilters, setStateFilters] = useState<string[]>([]);
  const [marketplaceFilter, setMarketplaceFilter] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof DRTInstance | null;
    direction: 'asc' | 'desc' | null;
  }>({ key: null, direction: null });

  // --- useEffect for Role Check and Redirection ---
  useEffect(() => {
    if (!isAuthLoaded || isLoadingProfile) {
      // Wait for Clerk's auth status AND your user profile (which includes roles) to load.
      return;
    }

    if (isSignedIn && userProfile && roles.length === 0) {
      // Case 1: User is signed in, their profile from DB is loaded, but they have NO roles.
      console.log("HomePage: User signed in, no roles. Redirecting to /select-roles.");
      router.push(`/select-roles?next=${encodeURIComponent(pathname)}`);
    } else if (isSignedIn && !userProfile && isErrorProfile && (isErrorProfile as any).status === 404) {
      // Case 2: User exists in Clerk, but /api/user/me returned 404 (user not in your DB yet).
      // This implies they are new and also need to select roles.
      // This relies on your /api/auth/check-user to eventually create them.
      console.log("HomePage: User profile not found in DB (404 from /api/user/me), likely new. Redirecting to /select-roles.");
      router.push(`/select-roles?next=${encodeURIComponent(pathname)}`);
    }
    // If userProfile exists and roles.length > 0, they are fine.
    // If isErrorProfile is true but not a 404, it's a different issue; no auto-redirect here.
  }, [isAuthLoaded, isSignedIn, userProfile, roles, isLoadingProfile, isErrorProfile, router, pathname]);

  const handleDrtSort = (key: keyof DRTInstance) => {
    let direction: 'asc' | 'desc' | null = 'asc';
    
    if (sortConfig.key === key) {
      if (sortConfig.direction === 'asc') direction = 'desc';
      else if (sortConfig.direction === 'desc') direction = null;
    }
    
    setSortConfig({ key, direction });
  };

  const getDrtSortIcon = (key: keyof DRTInstance) => {
    if (sortConfig.key !== key) return <ChevronsUpDown className="h-4 w-4" />;
    if (sortConfig.direction === 'asc') return <ChevronUp className="h-4 w-4" />;
    if (sortConfig.direction === 'desc') return <ChevronDown className="h-4 w-4" />;
    return <ChevronsUpDown className="h-4 w-4" />;
  };

  const toggleStateFilter = (state: string) => {
    setStateFilters(prev => 
      prev.includes(state) 
        ? prev.filter(s => s !== state)
        : [...prev, state]
    );
  };

  const toggleMarketplaceFilter = (value: string) => {
    setMarketplaceFilter(prev =>
      prev.includes(value)
        ? prev.filter(v => v !== value)
        : [...prev, value]
    );
  };

  const sortedPools = [...pools].sort((a, b) => {
    if (!sortField || !sortDirection) return 0;
    const aValue = a[sortField] || '';
    const bValue = b[sortField] || '';
    return sortDirection === 'asc'
      ? aValue.localeCompare(bValue)
      : bValue.localeCompare(aValue);
  });

  const sortedDrtInstances = [...drtInstances].sort((a, b) => {
    if (!sortConfig.key || !sortConfig.direction) return 0;
    let aValue: any = a[sortConfig.key];
    let bValue: any = b[sortConfig.key];
    
    if (sortConfig.key === 'pool') {
      aValue = a.pool.name || '';
      bValue = b.pool.name || '';
    } else if (sortConfig.key === 'drt') {
      aValue = a.drt.name || '';
      bValue = b.drt.name || '';
    }
    
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortConfig.direction === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }
    
    return sortConfig.direction === 'asc'
      ? (aValue || 0) - (bValue || 0)
      : (bValue || 0) - (aValue || 0);
  });

  if (!isAuthLoaded || (isSignedIn && isLoadingProfile)) {
    // Covers: Auth not loaded OR (User is signed in AND their profile/roles are still loading)
    return (
      <div className="container mx-auto p-4 text-center flex flex-col items-center justify-center min-h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-gray-500" />
        <p className="mt-4 text-lg text-gray-700">Loading your experience...</p>
      </div>
    );
  }

  // If a redirect to /select-roles is imminent (user signed in, profile loaded, but no roles)
  if (isSignedIn && userProfile && roles.length === 0 && !isLoadingProfile) {
      // This state means the redirect in the useEffect for role check should have fired or will fire immediately.
      return (
          <div className="container mx-auto p-4 text-center flex flex-col items-center justify-center min-h-screen">
              <Loader2 className="h-12 w-12 animate-spin text-gray-500" />
              <p className="mt-4 text-lg text-gray-700">Finalizing your account setup...</p>
          </div>
      );
  }

  return (
    <div className="container mx-auto p-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        {statsItems.map((item, index) => (
          <Card key={index} className="p-4 w-full">
            <div className="flex justify-between items-center">
              <span className="text-gray-700">{item.label}</span>
              <span className="bg-gray-800 text-white px-3 py-1 rounded-full text-sm">
                {item.value}
              </span>
            </div>
          </Card>
        ))}
      </div>

      {apiError && (
        <div className="text-center text-red-600 text-lg font-semibold mt-4">
          {apiError}
        </div>
      )}

      {/* My Pools Table */}
      <div className="mt-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">My Pools</h2>
        <Card className="w-full overflow-hidden">
          <div className="bg-gray-800 p-4">
            <Input
              placeholder="Search by pool name or description..."
              value={poolSearch}
              onChange={(e) => setPoolSearch(e.target.value)}
              className="max-w-md bg-white"
            />
          </div>
          <Table>
            <TableHeader className="bg-gray-800 [&_tr]:border-0">
              <TableRow className="hover:bg-gray-800">
                <TableHead 
                  className="w-[15%] text-white cursor-pointer"
                  onClick={() => handlePoolSort('name')}
                >
                  <div className="flex items-center gap-2">
                    Pool Name
                    {getPoolSortIcon('name')}
                  </div>
                </TableHead>
                <TableHead 
                  className="w-[25%] text-white cursor-pointer"
                  onClick={() => handlePoolSort('description')}
                >
                  <div className="flex items-center gap-2">
                    Description
                    {getPoolSortIcon('description')}
                  </div>
                </TableHead>
                <TableHead className="w-[25%] text-white text-center">Digital Rights Tokens (DRT)</TableHead>
                <TableHead className="w-[30%] text-white text-center">Sources</TableHead>
              </TableRow>
            </TableHeader>
            {isLoadingPools ? (
              <PoolTableSkeleton />
            ) : (
              <TableBody>
                {sortedPools
                  .filter(pool =>
                    pool.name.toLowerCase().includes(poolSearch.toLowerCase()) ||
                    pool.description.toLowerCase().includes(poolSearch.toLowerCase()) ||
                    !poolSearch
                  )
                  .map((pool) => (
                    <TableRow key={pool.id}>
                      <TableCell className="font-medium">{pool.name}</TableCell>
                      <TableCell>{pool.description}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2">
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
                          <div className="flex items-center justify-between gap-2">
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
                            
                            {/* Add Pool Account component here */}
                            <PoolAccount chainAddress={pool.chainAddress} />
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
                            <Dialog>
                              <DialogTrigger asChild>
                                <div className="ml-auto">
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
                                </div>
                              </DialogTrigger>
                              <EnclaveDialog 
                                pool={pool} 
                                onAttest={() => handleAttestation(pool)} 
                              />
                            </Dialog>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                {pools.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-xl font-semibold">
                      No pools found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            )}
          </Table>
        </Card>
      </div>

      {/* DRT Table */}
      <div className="mt-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">My Digital Right Tokens (DRTs)</h2>
        <Card>
          <div className="bg-gray-800 p-4">
            <div className="flex items-center gap-4">
              <Input
                type="text"
                placeholder="Search DRTs..."
                value={drtSearch}
                onChange={(e) => setDrtSearch(e.target.value)}
                className="max-w-xs bg-white"
              />

              <div className="flex-1 flex justify-center">
                <div className="flex gap-2 mr-16">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleStateFilter('active')}
                    className={`bg-white hover:bg-gray-100 min-w-[100px] ${
                      stateFilters.includes('active') ? 'bg-green-600 text-white hover:bg-green-700' : ''
                    }`}
                  >
                    Active
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleStateFilter('pending')}
                    className={`bg-white hover:bg-gray-100 min-w-[100px] ${
                      stateFilters.includes('pending') ? 'bg-green-600 text-white hover:bg-green-700' : ''
                    }`}
                  >
                    Pending
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleStateFilter('completed')}
                    className={`bg-white hover:bg-gray-100 min-w-[100px] ${
                      stateFilters.includes('completed') ? 'bg-green-600 text-white hover:bg-green-700' : ''
                    }`}
                  >
                    Completed
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleMarketplaceFilter('yes')}
                    className={`bg-white hover:bg-gray-100 min-w-[100px] ${
                      marketplaceFilter.includes('yes') ? 'bg-green-600 text-white hover:bg-green-700' : ''
                    }`}
                  >
                    Listed
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleMarketplaceFilter('no')}
                    className={`bg-white hover:bg-gray-100 min-w-[100px] ${
                      marketplaceFilter.includes('no') ? 'bg-green-600 text-white hover:bg-green-700' : ''
                    }`}
                  >
                    Not Listed
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full">
            <Table>
              <TableHeader className="bg-gray-800 [&_tr]:border-0">
                <TableRow className="hover:bg-gray-800">
                  <TableHead 
                    className="text-white cursor-pointer"
                    onClick={() => handleDrtSort('pool' as keyof DRTInstance)}
                  >
                    <div className="flex items-center gap-2">
                      Pool Name
                      {getDrtSortIcon('pool' as keyof DRTInstance)}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-white cursor-pointer"
                    onClick={() => handleDrtSort('drt' as keyof DRTInstance)}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Digital Rights Token
                      {getDrtSortIcon('drt' as keyof DRTInstance)}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-white cursor-pointer"
                    onClick={() => handleDrtSort('state')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      State
                      {getDrtSortIcon('state')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-white cursor-pointer"
                    onClick={() => handleDrtSort('isListed')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Listed on Marketplace
                      {getDrtSortIcon('isListed')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-white cursor-pointer"
                    onClick={() => handleDrtSort('price')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Price
                      {getDrtSortIcon('price')}
                    </div>
                  </TableHead>
                    <TableHead className="text-white w-[200px] text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              {isLoadingDRTs ? (
                <DRTTableSkeleton />
              ) : (
                <TableBody>
                  {sortedDrtInstances
                    .filter(item => {
                      const searchTerm = drtSearch.toLowerCase();
                      const matchesSearch = 
                        item.pool.name.toLowerCase().includes(searchTerm) ||
                        item.pool.description.toLowerCase().includes(searchTerm) ||
                        item.drt.name.toLowerCase().includes(searchTerm) ||
                        item.state.toLowerCase().includes(searchTerm);

                      const matchesState = stateFilters.length === 0 || stateFilters.includes(item.state);
                      const matchesMarketplace = marketplaceFilter.length === 0 || 
                        marketplaceFilter.includes(item.isListed ? 'yes' : 'no');

                      return matchesSearch && matchesState && matchesMarketplace;
                    })
                    .map((item) => {
                      const isRedeemed = redeemedStates[item.id] || item.state === 'completed';
                      const isAppendDataPoolCompleted = item.drt.name.toLowerCase().includes('append') && item.state === 'completed';
                      const buttonText = isRedeemed || isAppendDataPoolCompleted ? 'Redeemed' : 'Redeem DRT';
                      const buttonClass = isRedeemed || isAppendDataPoolCompleted 
                        ? 'bg-green-600 text-white cursor-not-allowed' 
                        : 'bg-blue-600 text-white hover:bg-blue-700';

                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium text-center">{item.pool.name}</TableCell>
                          <TableCell className="text-center">
                          <TooltipProvider>
                            <Tooltip>
                            <TooltipTrigger>
                              <Badge 
                              className={`cursor-help ${getDrtTypeColor(item.drt.name)}`}
                              >
                              {item.drt.name}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="p-3 max-w-xs bg-gray-900 text-white">
                              <h3 className="font-semibold mb-1">{item.drt.name}</h3>
                              <p className="text-sm text-gray-200">{item.drt.description}</p>
                            </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          </TableCell>
                          <TableCell className="text-center">
                          <DrtStatusBadge state={item.state} />
                          </TableCell>
                          <TableCell className="text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            item.isListed ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                          }`}>
                            {item.isListed ? 'Yes' : 'No'}
                          </span>
                          </TableCell>
                          <TableCell className="text-center">{item.price ? `${item.price.toFixed(2)} SOL` : '-'}</TableCell>
                          <TableCell className="text-center">
                            {item.drt.name.toLowerCase() !== "ownership token" && (
                              <div className="flex justify-around gap-2">
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  disabled={item.isListed || item.state === 'pending' || item.state === 'completed'}
                                >
                                  Sell
                                </Button>
                                {item.drt.name.toLowerCase().includes('python') ? (
                                  <Dialog>
                                    <DialogTrigger asChild>
                                      <Button 
                                        size="sm" 
                                        className={`${buttonClass} w-32 flex items-center justify-center gap-1`}
                                        disabled={isRedeemed || !item.pool.enclaveMeasurement?.publicIp || item.state !== 'active' || !wallet.connected}
                                      >
                                        <Shield className="w-4 h-4 flex-shrink-0" />
                                        <span className="flex-grow text-center">{buttonText}</span>
                                      </Button>
                                    </DialogTrigger>
                                    <PythonExecutionDialog 
                                      drtInstance={item}
                                      onRedeem={() => handlePythonRedeem(item)}
                                      onStateUpdate={(newState) => handleStateUpdate(item.id, newState)}
                                      program={program}
                                      wallet={wallet}
                                    />
                                  </Dialog>
                                ) : item.drt.name.toLowerCase().includes('wasm') ? (
                                  <Dialog>
                                    <DialogTrigger asChild>
                                      <Button 
                                        size="sm" 
                                        className={`${buttonClass} w-32 flex items-center justify-center gap-1`}
                                        disabled={isRedeemed || !item.pool.enclaveMeasurement?.publicIp || item.state !== 'active' || !wallet.connected}
                                      >
                                        <Shield className="w-4 h-4 flex-shrink-0" />
                                        <span className="flex-grow text-center">{buttonText}</span>
                                      </Button>
                                    </DialogTrigger>
                                    <WasmExecutionDialog 
                                      drtInstance={item}
                                      onRedeem={() => handleWasmRedeem(item)}
                                      onStateUpdate={(newState) => handleStateUpdate(item.id, newState)}
                                      program={program}
                                      wallet={wallet}
                                    />
                                  </Dialog>
                                ) : (
                                  <Button 
                                    size="sm"
                                    className={`${isAppendDataPoolCompleted ? 'bg-green-600 text-white cursor-not-allowed' : 'bg-gray-200 text-black cursor-not-allowed'} w-32 flex items-center justify-center gap-1`}
                                    disabled 
                                  >
                                    <Shield className="w-4 h-4 flex-shrink-0" />
                                    <span className="flex-grow text-center">{isAppendDataPoolCompleted ? 'Redeemed' : 'Pools Page'}</span>
                                  </Button>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  {drtInstances.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-xl font-semibold">
                        No DRTs found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              )}
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}