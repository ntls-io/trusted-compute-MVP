import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ExternalLink, Shield, Code2 } from 'lucide-react';

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
              <Label className="text-sm">MRENCLAVE (Identity of code and data)</Label>
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
                <Label className="text-sm">ISV_SVN (Security version)</Label>
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

const PoolsTable = () => {
  const [search, setSearch] = useState('');
  const [showMyPools, setShowMyPools] = useState(false);
  const [attestationResults, setAttestationResults] = useState<{[key: number]: AttestationResult}>({});

  const availableRights: Right[] = [
    { 
      id: '1', 
      name: 'Append data pool', 
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
              <TableHead className="w-[25%] text-white">Digital Rights Tokens</TableHead>
              <TableHead className="w-[40%] text-white">Sources</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPools.map((pool) => (
              <React.Fragment key={pool.id}>
                <TableRow>
                  <TableCell className="font-medium" rowSpan={2}>{pool.name}</TableCell>
                  <TableCell rowSpan={2}>{pool.description}</TableCell>
                  <TableCell rowSpan={2}>
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
                  <TableCell className="border-b-0 py-2">
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
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="py-2">
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
                  </TableCell>
                </TableRow>
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
};

export default PoolsTable;