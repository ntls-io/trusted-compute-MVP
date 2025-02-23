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

import { useState, useEffect } from 'react';
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
import { ExternalLink, Shield, Upload, Code2, Eye } from 'lucide-react';
import { ChevronDown, ChevronUp, ChevronsUpDown, Loader2 } from "lucide-react";


interface EnclaveMeasurement {
  mrenclave: string;
  mrsigner: string;
  isvProdId: string;
  isvSvn: string;
  publicIp?: string;  // Added for attestation
  actualName?: string; // Added for attestation (VM name)
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
  schemaDefinition: JSON; 
  enclaveMeasurement?: EnclaveMeasurement;
  allowedDRTs: {
    drt: DRT;
  }[];
  isOwned: boolean;
}

interface AttestationResult {
  success: boolean;
  error?: string;
  stdout?: string; // Added to display FastAPI logs
  measurements?: EnclaveMeasurement;
}

const EnclaveDialog = ({ pool, onAttest }: { pool: Pool; onAttest: () => Promise<AttestationResult> }) => {
  const [isAttesting, setIsAttesting] = useState(false);
  const [attestationResult, setAttestationResult] = useState<AttestationResult | null>(null);
  const [showOutput, setShowOutput] = useState(false); // New state to toggle output visibility
  
  const handleAttest = async () => {
    setIsAttesting(true);
    setAttestationResult(null); // Reset previous result
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

  // Early return if no enclave measurement
  if (!pool.enclaveMeasurement) {
    return (
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto"> {/* Added scrollable max height */}
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

  // Construct the command as executed by AttestationClient
  const command = `[APPLICATION_PORT=443 APPLICATION_HOST=${pool.enclaveMeasurement.publicIp || 'unknown'}] ./attest dcap ${pool.enclaveMeasurement.mrenclave} ${pool.enclaveMeasurement.mrsigner} ${pool.enclaveMeasurement.isvProdId} ${pool.enclaveMeasurement.isvSvn}`;

  // Determine button properties based on attestation status
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
    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto"> {/* Added scrollable max height */}
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

            {/* <div>
              <Label className="text-sm">VM Name</Label>
              <div className="font-mono text-sm bg-gray-100 p-2 rounded">
                {pool.enclaveMeasurement.actualName || 'Not available'}
              </div>
            </div> */}
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
                      <pre className="font-mono text-sm bg-gray-100 p-2 rounded max-h-40 overflow-y-auto whitespace-pre-wrap"> {/* Changed break-all to whitespace-pre-wrap */}
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

const JoinPoolDialog = ({ pool }: { pool: Pool }) => {
  const [dataFile, setDataFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<{
    success: boolean | null;
    error: string | null;
  }>({
    success: null,
    error: null,
  });
  const [isValidating, setIsValidating] = useState(false);

  const handleJoinPool = async () => {
    if (!dataFile) {
      setValidation({ success: false, error: 'Please select a data file' });
      return;
    }

    setIsValidating(true);
    try {
      // Create a blob from the schema definition
      const schemaBlob = new Blob([JSON.stringify(pool.schemaDefinition)], { type: 'application/json' });
      const schemaFile = new File([schemaBlob], 'schema.json', { type: 'application/json' });
      
      // Use the existing validation utility
      const result = await validateJsonSchema(schemaFile, dataFile);
      setValidation(result);
      
      if (result.success) {
        alert('Successfully joined pool!');
      }
    } catch (error) {
      setValidation({
        success: false,
        error: 'Failed to validate data file against pool schema: ' + (error instanceof Error ? error.message : String(error))
      });
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Join Pool - {pool.name}</DialogTitle>
        <DialogDescription>{pool.description}</DialogDescription>
      </DialogHeader>

      <div className="space-y-6 py-4">
        <div>
          <h5 className="font-medium mb-2">Available Digital Rights</h5>
          <div className="flex flex-wrap gap-2">
            {pool.allowedDRTs.map(({ drt }) => (
              <TooltipProvider key={drt.id} delayDuration={3}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge 
                      className={`${getDrtTypeColor(drt.name)} cursor-help`}
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
        </div>
        <div className="p-4 bg-gray-50 flex justify-center">
          <SchemaPreview schema={pool.schemaDefinition} />
        </div>

        <div className="space-y-4">
          <FilePicker
            label="Select Data File"
            accept=".json"
            onChange={(file) => {
              setDataFile(file);
              setValidation({
                success: null,
                error: null,
              });
            }}
          />
          
          {validation.error && (
            <Alert variant="destructive">
              <AlertDescription>{validation.error}</AlertDescription>
            </Alert>
          )}

          <Button 
            onClick={handleJoinPool}
            disabled={!dataFile || isValidating}
            className="w-full"
          >
            {isValidating ? 'Validating...' : 'Join Pool'}
          </Button>
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
  // Blue schema for append operations
  APPEND_DATA_POOL: "bg-blue-100 text-blue-800",
  
  // Yellow schema for Python computations
  EXECUTE_MEDIAN_PYTHON: "bg-yellow-100 text-yellow-800",
  
  // Green schema for WASM computations
  EXECUTE_MEDIAN_WASM: "bg-green-100 text-green-800",
};

// Helper function to determine DRT color based on name
const getDrtTypeColor = (name: string): string => {
  // Direct match in color mapping
  if (DrtTypeColors[name]) return DrtTypeColors[name];
  
  // Pattern matching for partial names
  if (name.includes('Append')) 
    return "bg-blue-100 text-blue-800";
    
  if (name.includes('Python')) 
    return "bg-yellow-100 text-yellow-800";
    
  if (name.includes('WASM')) 
    return "bg-green-100 text-green-800";
    
  // Default fallback
  return "bg-gray-100 text-gray-800";
};

export function PoolsTable({ poolCreated }: { poolCreated?: boolean })  {
  const [search, setSearch] = useState('');
  const [showMyPools, setShowMyPools] = useState(false);
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [attestationResults, setAttestationResults] = useState<Record<string, AttestationResult>>({});
  const [sortField, setSortField] = useState<"name" | "description" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc" | null>(null);

  useEffect(() => {
    fetchPools();
  }, [poolCreated]);

  const fetchPools = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/pools');
      const data = await response.json();
      setPools(data);
    } catch (error) {
      console.error('Error fetching pools:', error);
    } finally {
      setLoading(false);
    }
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
          port: 443, // Matches the command in EnclaveDialog
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
                      disabled={!pool.allowedDRTs.some(({ drt }) => drt.name === "Append Data Pool")}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Join Pool
                    </Button>
                  </DialogTrigger>
                  <JoinPoolDialog pool={pool} />
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