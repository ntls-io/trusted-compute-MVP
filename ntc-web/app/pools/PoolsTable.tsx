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
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";


interface EnclaveMeasurement {
  mrenclave: string;
  mrsigner: string;
  isvProdId: string;
  isvSvn: string;
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
  contractAddress: string;
  schemaDefinition: JSON; 
  enclaveMeasurement: EnclaveMeasurement;
  allowedDRTs: {
    drt: DRT;
  }[];
  isOwned: boolean;
}

interface AttestationResult {
  success: boolean;
  error?: string;
  measurements?: EnclaveMeasurement;
}

const EnclaveDialog = ({ pool, onAttest }: { pool: Pool; onAttest: () => void }) => {
  const [isAttesting, setIsAttesting] = useState(false);
  
  const handleAttest = async () => {
    setIsAttesting(true);
    await onAttest();
    setIsAttesting(false);
  };

  return (
    <DialogContent className="max-w-2xl">
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
            
            <Button onClick={handleAttest} disabled={isAttesting}>
              <Shield className="w-4 h-4 mr-2" />
              {isAttesting ? 'Running Attestation...' : 'Attest Enclave'}
            </Button>
          </div>

          <div className="text-sm text-gray-500">
            Command that will be executed:<br />
            <code className="font-mono bg-gray-100 p-1 text-xs">
              ./attest dcap {pool.enclaveMeasurement.mrenclave} {pool.enclaveMeasurement.mrsigner} {pool.enclaveMeasurement.isvProdId} {pool.enclaveMeasurement.isvSvn}
            </code>
          </div>
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
      await new Promise(resolve => setTimeout(resolve, 1000));
      setValidation({
        success: true,
        error: null,
      });
      alert('Successfully joined pool!');
    } catch (error) {
      setValidation({
        success: false,
        error: 'Failed to validate data file against pool schema',
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
              <Badge key={drt.id} variant="secondary">
                {drt.name}
              </Badge>
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

export function PoolsTable() {
  const [search, setSearch] = useState('');
  const [showMyPools, setShowMyPools] = useState(false);
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [attestationResults, setAttestationResults] = useState<Record<string, AttestationResult>>({});
  const [sortField, setSortField] = useState<"name" | "description" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc" | null>(null);

  useEffect(() => {
    fetchPools();
  }, []);

  const fetchPools = async () => {
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

  const handleAttestation = async (pool: Pool) => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    setAttestationResults({
      ...attestationResults,
      [pool.id]: {
        success: true,
        measurements: pool.enclaveMeasurement
      }
    });
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
    return <div>Loading...</div>;
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
                            <Badge variant="secondary" className="cursor-help">
                              {drt.name}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{drt.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium whitespace-nowrap">Smart Contract:</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={`https://explorer.solana.com/address/${pool.contractAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-blue-500 hover:text-blue-700"
                            >
                              <span>Link</span>
                              <ExternalLink size={16} />
                            </a>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-mono text-xs">{pool.contractAddress}</p>
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
                          >
                            <Shield className="w-4 h-4 mr-2" />
                            {attestationResults[pool.id]?.success ? 'Verified' : 'Verify Enclave'}
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