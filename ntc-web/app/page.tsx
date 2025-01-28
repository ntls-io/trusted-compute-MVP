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

"use client";

import React, { useState } from 'react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { ExternalLink, ChevronDown, ChevronUp, ChevronsUpDown, Shield, Code2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface StatsItem {
  label: string;
  value: string;
}

interface DigitalRight {
  id: string;
  name: string;
  description: string;
}

interface Pool {
  id: number;
  name: string;
  description: string;
  rights: string[];
  contractAddress: string;
  enclaveMeasurements: {
    mrenclave: string;
    mrsigner: string;
    isvProdId: string;
    isvSvn: string;
  };
}

interface DRTItem {
  poolName: string;
  description: string;
  drt: string;
  state: string;
  listedOnMarketplace: string;
}

interface AttestationResult {
  success: boolean;
  error?: string;
  measurements?: {
    mrenclave: string;
    mrsigner: string;
    isvProdId: string;
    isvSvn: string;
  };
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
          Verify the integrity and authenticity of the trusted computing environment.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Enclave Measurements</h3>

          <div className="grid gap-4">
            <div>
              <label className="text-sm font-medium">MRENCLAVE (Unique identity of code and data)</label>
              <div className="font-mono text-sm bg-gray-100 p-2 rounded break-all">
                {pool.enclaveMeasurements.mrenclave}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">MRSIGNER (Identity of enclave signer)</label>
              <div className="font-mono text-sm bg-gray-100 p-2 rounded break-all">
                {pool.enclaveMeasurements.mrsigner}
              </div>
            </div>

            <div className="flex gap-8">
              <div>
                <label className="text-sm font-medium">ISV_PROD_ID (Product ID)</label>
                <div className="font-mono text-sm bg-gray-100 p-2 rounded">
                  {pool.enclaveMeasurements.isvProdId}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">ISV_SVN (Security Version Number)</label>
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

export default function Home() {
  // Pool states
  const [poolSearch, setPoolSearch] = useState('');
  const [sortField, setSortField] = useState<'name' | 'description' | 'rights' | 'contractAddress' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);
  const [attestationResults, setAttestationResults] = useState<{[key: number]: AttestationResult}>({});
  
  // DRT states
  const [drtSearch, setDrtSearch] = useState('');
  const [stateFilters, setStateFilters] = useState<string[]>([]);
  const [marketplaceFilter, setMarketplaceFilter] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof DRTItem | null;
    direction: 'asc' | 'desc' | null;
  }>({ key: null, direction: null });

  const statsItems: StatsItem[] = [
    {
      label: "My Data Pool(s)",
      value: "1"
    },
    {
      label: "Digital Rights Tokens Purchased",
      value: "1"
    },
    {
      label: "Amount Paid Out",
      value: "$20"
    }
  ];

  const availableRights: DigitalRight[] = [
    { 
      id: '1', 
      name: 'Append Data Pool', 
      description: 'Permits adding new data entries to existing pools while maintaining schema requirements'
    },
    { 
      id: '2', 
      name: 'Execute Median WASM', 
      description: 'Enables running Rust WebAssembly-based median calculations on data pools'
    },
    { 
      id: '3', 
      name: 'Execute Median Python', 
      description: 'Allows execution of Python-based median computations on data pools'
    }
  ];

  const ownedPool: Pool = {
    id: 3,
    name: "Financial Metrics",
    description: "Quarterly financial performance data",
    rights: ['1', '3'],
    contractAddress: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    enclaveMeasurements: {
      mrenclave: "c5e34826d42766363286055750373441545bc601df37fab07231bca4324db319",
      mrsigner: "eb33db710373cbf7c6bfa26e6e9d40e261cfd1f5adc38db6599bfe764e9180cc",
      isvProdId: "0",
      isvSvn: "0"
    }
  };

  const drtItems: DRTItem[] = [
    {
      poolName: "Healthcare Metrics",
      description: "Patient outcome analysis dataset",
      drt: "1", 
      state: "active",
      listedOnMarketplace: "yes"
    },
    {
      poolName: "Retail Analytics",
      description: "Shopping pattern data collection",
      drt: "2", 
      state: "pending",
      listedOnMarketplace: "no"
    },
    {
      poolName: "Climate Data",
      description: "Temperature and weather patterns",
      drt: "3", 
      state: "active",
      listedOnMarketplace: "yes"
    },
    {
      poolName: "Supply Chain Metrics",
      description: "Logistics performance tracking",
      drt: "1", 
      state: "active",
      listedOnMarketplace: "no"
    },
    {
      poolName: "Market Research",
      description: "Consumer preference analysis",
      drt: "2",
      state: "active",
      listedOnMarketplace: "yes"
    }
  ];

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

  const getRightById = (rightId: string): DigitalRight | undefined => {
    return availableRights.find((right) => right.id === rightId);
  };

  const getSolanaExplorerUrl = (address: string): string => {
    return `https://explorer.solana.com/address/${address}`;
  };

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

  // DRT handlers
  const handleDrtSort = (key: keyof DRTItem) => {
    let direction: 'asc' | 'desc' | null = 'asc';
    
    if (sortConfig.key === key) {
      if (sortConfig.direction === 'asc') direction = 'desc';
      else if (sortConfig.direction === 'desc') direction = null;
    }
    
    setSortConfig({ key, direction });
  };

  const getDrtSortIcon = (key: keyof DRTItem) => {
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

  const isPoolVisible = 
    ownedPool.name.toLowerCase().includes(poolSearch.toLowerCase()) ||
    ownedPool.description.toLowerCase().includes(poolSearch.toLowerCase()) ||
    !poolSearch;

  const filteredAndSortedItems = drtItems
    .filter(item => {
      const searchTerm = drtSearch.toLowerCase();
      const matchesSearch = 
        item.poolName.toLowerCase().includes(searchTerm) ||
        item.description.toLowerCase().includes(searchTerm) ||
        item.drt.toLowerCase().includes(searchTerm) ||
        item.state.toLowerCase().includes(searchTerm) ||
        item.listedOnMarketplace.toLowerCase().includes(searchTerm);

      const matchesState = stateFilters.length === 0 || stateFilters.includes(item.state);
      const matchesMarketplace = marketplaceFilter.length === 0 || marketplaceFilter.includes(item.listedOnMarketplace);

      return matchesSearch && matchesState && matchesMarketplace;
    })
    .sort((a, b) => {
      if (!sortConfig.key || !sortConfig.direction) return 0;
      
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

  return (
    <div className="container mx-auto p-4">
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
                  className="w-[20%] text-white cursor-pointer"
                  onClick={() => handlePoolSort('description')}
                >
                  <div className="flex items-center gap-2">
                    Description
                    {getPoolSortIcon('description')}
                  </div>
                </TableHead>
                <TableHead 
                  className="w-[20%] text-white cursor-pointer"
                  onClick={() => handlePoolSort('rights')}
                >
                  <div className="flex items-center gap-2">
                    Digital Rights Tokens (DRT)
                    {getPoolSortIcon('rights')}
                  </div>
                </TableHead>
                <TableHead className="w-[35%] text-white">Sources</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPoolVisible ? (
                <TableRow>
                  <TableCell className="font-medium">{ownedPool.name}</TableCell>
                  <TableCell>{ownedPool.description}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {ownedPool.rights.map((rightId) => {
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
                                href={getSolanaExplorerUrl(ownedPool.contractAddress)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-blue-500 hover:text-blue-700"
                              >
                                <span>Link</span>
                                <ExternalLink size={16} />
                              </a>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="font-mono text-xs">{ownedPool.contractAddress}</p>
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
                              className={attestationResults[ownedPool.id]?.success ? 'bg-green-50' : ''}
                            >
                              <Shield className="w-4 h-4 mr-2" />
                              {attestationResults[ownedPool.id]?.success ? 'Verified' : 'Verify Enclave'}
                            </Button>
                          </DialogTrigger>
                          <EnclaveDialog 
                            pool={ownedPool}
                            onAttest={() => handleAttestation(ownedPool)}
                          />
                        </Dialog>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-gray-500">
                    No results found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
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
                    onClick={() => handleDrtSort('poolName')}
                  >
                    <div className="flex items-center gap-2">
                      Pool Name
                      {getDrtSortIcon('poolName')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-white cursor-pointer"
                    onClick={() => handleDrtSort('description')}
                  >
                    <div className="flex items-center gap-2">
                      Description
                      {getDrtSortIcon('description')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-white cursor-pointer w-[22%]"
                    onClick={() => handleDrtSort('drt')}
                  >
                    <div className="flex items-center gap-2">
                      Digital Rights Tokens (DRTs)
                      {getDrtSortIcon('drt')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-white cursor-pointer"
                    onClick={() => handleDrtSort('state')}
                  >
                    <div className="flex items-center gap-2">
                      State
                      {getDrtSortIcon('state')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-white cursor-pointer"
                    onClick={() => handleDrtSort('listedOnMarketplace')}
                  >
                    <div className="flex items-center gap-2">
                      Listed on Marketplace
                      {getDrtSortIcon('listedOnMarketplace')}
                    </div>
                  </TableHead>
                  <TableHead className="text-white w-[200px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedItems.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{item.poolName}</TableCell>
                    <TableCell>{item.description}</TableCell>
                    <TableCell>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="secondary" className="cursor-help">
                              {getRightById(item.drt)?.name || "Unknown DRT"}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{getRightById(item.drt)?.description || "No description available"}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        item.state === 'active' ? 'bg-green-100 text-green-700' :
                        item.state === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {item.state}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        item.listedOnMarketplace === 'yes' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {item.listedOnMarketplace}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-around gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          disabled={item.listedOnMarketplace === 'yes'}
                        >
                          Sell
                        </Button>
                        <Button variant="outline" size="sm">
                          View results
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredAndSortedItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      No results found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}