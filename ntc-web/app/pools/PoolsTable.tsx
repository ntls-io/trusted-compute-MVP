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

import React, { useState } from 'react';
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
import { ExternalLink, Shield, Code2, Upload, Eye } from 'lucide-react';
import { FilePicker } from './FilePicker';
import { SchemaPreview } from './SchemaPreview';

interface Right {
  id: string;
  name: string;
  description: string;
}

interface EnclaveMeasurements {
  mrenclave: string;
  mrsigner: string;
  isvProdId: string;
  isvSvn: string;
}

interface Pool {
  id: number;
  name: string;
  description: string;
  rights: string[];
  contractAddress: string;
  enclaveMeasurements: EnclaveMeasurements;
  isOwned: boolean;
}

interface AttestationResult {
  success: boolean;
  error?: string;
  measurements?: EnclaveMeasurements;
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
                {pool.enclaveMeasurements.mrenclave}
              </div>
            </div>
            
            <div>
              <Label className="text-sm">MRSIGNER (Identity of enclave signer)</Label>
              <div className="font-mono text-sm bg-gray-100 p-2 rounded break-all">
                {pool.enclaveMeasurements.mrsigner}
              </div>
            </div>
            
            <div className="flex gap-8">
              <div>
                <Label className="text-sm">ISV_PROD_ID (Product ID)</Label>
                <div className="font-mono text-sm bg-gray-100 p-2 rounded">
                  {pool.enclaveMeasurements.isvProdId}
                </div>
              </div>
              
              <div>
                <Label className="text-sm">ISV_SVN (Security Version Number)</Label>
                <div className="font-mono text-sm bg-gray-100 p-2 rounded">
                  {pool.enclaveMeasurements.isvSvn}
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
              ./attest dcap {pool.enclaveMeasurements.mrenclave} {pool.enclaveMeasurements.mrsigner} {pool.enclaveMeasurements.isvProdId} {pool.enclaveMeasurements.isvSvn}
            </code>
          </div>
        </div>
      </div>
    </DialogContent>
  );
};

const JoinPoolDialog = ({ pool, availableRights }: { pool: Pool; availableRights: Right[] }) => {
  const [dataFile, setDataFile] = useState<File | null>(null);
  const [schemaPreviewOpen, setSchemaPreviewOpen] = useState(false);
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
      // Here you would validate against the pool's schema
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
            {pool.rights.map((rightId, index) => {
              const right = availableRights.find(r => r.id === rightId);
              return right && (
                <Badge key={index} variant="secondary">
                  {right.name}
                </Badge>
              );
            })}
          </div>
        </div>

        <Dialog open={schemaPreviewOpen} onOpenChange={setSchemaPreviewOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full border-2 border-gray-900 text-gray-900 hover:bg-gray-100">
              View Schema Definition
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl h-[80vh]">
            <DialogHeader>
              <DialogTitle>Schema Preview - {pool.name}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-auto">
              {/* <SchemaPreview schemaId={pool.id.toString()} /> */}
              <Button 
                variant="outline"
                disabled
                className="transition-colors text-gray-500 cursor-not-allowed"
              >
                <Eye className="mr-2 h-4 w-4" />
                Preview Schema (Disabled)
              </Button>
            </div>
          </DialogContent>
        </Dialog>

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
            className="w-full bg-gray-900 text-white hover:bg-gray-800"
          >
            {isValidating ? 'Validating...' : 'Join Pool'}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
};

const PoolsTable = () => {
  const [search, setSearch] = useState('');
  const [showMyPools, setShowMyPools] = useState(false);
  const [attestationResults, setAttestationResults] = useState<{[key: number]: AttestationResult}>({});

  const availableRights: Right[] = [
    { 
      id: '1', 
      name: 'Append Data Pool', 
      description: 'Permits adding new data entries to existing pools'
    },
    { 
      id: '2', 
      name: 'Execute Median WASM', 
      description: 'Enables running Rust WebAssembly-based median calculations'
    },
    { 
      id: '3', 
      name: 'Execute Median Python', 
      description: 'Allows execution of Python-based median computations'
    },
  ];

  const pools: Pool[] = [
    {
      id: 1,
      name: "Market Analysis Pool",
      description: "Contains market trend data from 2023-2024",
      rights: ['1', '2'],
      contractAddress: "7nYuwdHqwrxbr5CKqRqZY6ZduuB3ZSLJsBz8RPKkqvCp",
      enclaveMeasurements: {
        mrenclave: "c5e34826d42766363286055750373441545bc601df37fab07231bca4324db319",
        mrsigner: "eb33db710373cbf7c6bfa26e6e9d40e261cfd1f5adc38db6599bfe764e9180cc",
        isvProdId: "0",
        isvSvn: "0"
      },
      isOwned: true,
    },
    {
      id: 2,
      name: "Customer Insights",
      description: "Aggregated customer behavior metrics",
      rights: ['2', '3'],
      contractAddress: "BPFLoader2111111111111111111111111111111111",
      enclaveMeasurements: {
        mrenclave: "d4e87626d42766363286055750373441545bc601df37fab07231bca4324db429",
        mrsigner: "fa22db710373cbf7c6bfa26e6e9d40e261cfd1f5adc38db6599bfe764e9180dd",
        isvProdId: "0",
        isvSvn: "0"
      },
      isOwned: false,
    }
  ];

  const handleAttestation = async (pool: Pool) => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    setAttestationResults({
      ...attestationResults,
      [pool.id]: {
        success: true,
        measurements: pool.enclaveMeasurements
      }
    });
  };

  const getRightById = (rightId: string): Right | undefined => {
    return availableRights.find((right) => right.id === rightId);
  };

  const filteredPools = pools
    .filter((pool) => !showMyPools || pool.isOwned)
    .filter((pool) =>
      pool.name.toLowerCase().includes(search.toLowerCase()) ||
      pool.description.toLowerCase().includes(search.toLowerCase())
    );

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
            Show my pools
          </Label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-gray-800 [&_tr]:border-0">
            <TableRow className="hover:bg-gray-800">
              <TableHead className="w-[15%] text-white">Pool Name</TableHead>
              <TableHead className="w-[20%] text-white">Description</TableHead>
              <TableHead className="w-[20%] text-white">Digital Rights Tokens</TableHead>
              <TableHead className="w-[35%] text-white">Sources</TableHead>
              <TableHead className="w-[10%] text-white">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPools.map((pool) => {
              const hasAppendRight = pool.rights.includes('1');
              
              return (
                <React.Fragment key={pool.id}>
                  <TableRow>
                    <TableCell className="font-medium">{pool.name}</TableCell>
                    <TableCell>{pool.description}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {pool.rights.map((rightId) => {
                          const right = getRightById(rightId);
                          if (!right) return null;
                          return (
                            <TooltipProvider key={rightId}>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="secondary" className="cursor-help">
                                    {right.name}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{right.description}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          );
                        })}
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
                            disabled={!hasAppendRight}
                            className={`w-full ${hasAppendRight ? 'hover:bg-gray-100' : 'opacity-50 cursor-not-allowed'}`}
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            Join Pool
                          </Button>
                        </DialogTrigger>
                        <JoinPoolDialog pool={pool} availableRights={availableRights} />
                      </Dialog>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
};

export default PoolsTable;