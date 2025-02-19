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

import { useEffect, useState } from 'react';
import { useLoading } from '@/components/LoadingContext';
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
import { ExternalLink, ChevronDown, ChevronUp, ChevronsUpDown, Shield, Code2, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Interfaces remain the same
interface Pool {
  id: string;
  name: string;
  description: string;
  chainAddress: string;
  vaultAddress: string;
  feeVaultAddress: string;
  schemaDefinition: any;
  enclaveMeasurement?: {
    mrenclave: string;
    mrsigner: string;
    isvProdId: string;
    isvSvn: string;
  };
  allowedDRTs: {
    drt: {
      id: string;
      name: string;
      description: string;
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
  };
  pool: {
    name: string;
    description: string;
  };
  state: string;
  isListed: boolean;
  price: number;
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

// Enclave Dialog Component remains the same
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
                {pool.enclaveMeasurement?.mrenclave}
              </div>
            </div>
            
            <div>
              <Label className="text-sm">MRSIGNER (Identity of enclave signer)</Label>
              <div className="font-mono text-sm bg-gray-100 p-2 rounded break-all">
                {pool.enclaveMeasurement?.mrsigner}
              </div>
            </div>
            
            <div className="flex gap-8">
              <div>
                <Label className="text-sm">ISV_PROD_ID (Product ID)</Label>
                <div className="font-mono text-sm bg-gray-100 p-2 rounded">
                  {pool.enclaveMeasurement?.isvProdId}
                </div>
              </div>
              
              <div>
                <Label className="text-sm">ISV_SVN (Security Version Number)</Label>
                <div className="font-mono text-sm bg-gray-100 p-2 rounded">
                  {pool.enclaveMeasurement?.isvSvn}
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
              ./attest dcap {pool.enclaveMeasurement?.mrenclave} {pool.enclaveMeasurement?.mrsigner} {pool.enclaveMeasurement?.isvProdId} {pool.enclaveMeasurement?.isvSvn}
            </code>
          </div>
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

export default function Home() {
  // Connect to loading context
  const { setIsLoading } = useLoading();
  const [isLoadingPools, setIsLoadingPools] = useState(true);
  const [isLoadingDRTs, setIsLoadingDRTs] = useState(true);
  
  // State declarations - remove local loading state
  const [pools, setPools] = useState<Pool[]>([]);
  const [drtInstances, setDrtInstances] = useState<DRTInstance[]>([]);
  const [poolSearch, setPoolSearch] = useState('');
  const [sortField, setSortField] = useState<'name' | 'description' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);
  const [attestationResults, setAttestationResults] = useState<{[key: string]: AttestationResult}>({});
  const [apiError, setApiError] = useState<string | null>(null);

  // Data fetching - updated to use global loading state
  useEffect(() => {
    async function fetchData() {
      // Keep the global loading state active while fetching
      setIsLoading(true);
      setIsLoadingPools(true);
      setIsLoadingDRTs(true);
      
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
          setPools([]); // Ensures no undefined errors
          setDrtInstances([]);
          return;
        }
  
        const data = await response.json();
  
        setPools(Array.isArray(data.pools) ? data.pools : []);
        setDrtInstances(Array.isArray(data.drtInstances) ? data.drtInstances : []);
        setApiError(null); // Reset errors when API works fine
  
      } catch (error) {
        console.error("❌ Network error or API unavailable:", error);
        setApiError("Network error. Please check your connection or backend.");
        setPools([]); 
        setDrtInstances([]);
      } finally {
        // Release the global loading state when data is ready
        setIsLoading(false);
        setIsLoadingPools(false);
        setIsLoadingDRTs(false);
      }
    }
  
    fetchData();
  }, [setIsLoading]);  


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

  // Calculate stats from real data
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

  // DRT states
  const [drtSearch, setDrtSearch] = useState('');
  const [stateFilters, setStateFilters] = useState<string[]>([]);
  const [marketplaceFilter, setMarketplaceFilter] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof DRTInstance | null;
    direction: 'asc' | 'desc' | null;
  }>({ key: null, direction: null });

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
                  className="w-[20%] text-white cursor-pointer"
                  onClick={() => handlePoolSort('description')}
                >
                  <div className="flex items-center gap-2">
                    Description
                    {getPoolSortIcon('description')}
                  </div>
                </TableHead>
                <TableHead className="w-[20%] text-white">Digital Rights Tokens (DRT)</TableHead>
                <TableHead className="w-[35%] text-white">Sources</TableHead>
              </TableRow>
            </TableHeader>
            {isLoadingPools ? (
              <PoolTableSkeleton />
            ) : (
              <TableBody>
                {pools
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
                          {/* Pool PDA */}
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

                          {/* Vault PDA */}
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

                          {/* Fee Vault PDA */}
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

                          {/* Enclave Verification */}
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
                    <div className="flex items-center gap-2">
                      Digital Rights Token
                      {getDrtSortIcon('drt' as keyof DRTInstance)}
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
                    onClick={() => handleDrtSort('isListed')}
                  >
                    <div className="flex items-center gap-2">
                      Listed on Marketplace
                      {getDrtSortIcon('isListed')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-white cursor-pointer"
                    onClick={() => handleDrtSort('price')}
                  >
                    <div className="flex items-center gap-2">
                      Price
                      {getDrtSortIcon('price')}
                    </div>
                  </TableHead>
                  <TableHead className="text-white w-[200px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              {isLoadingDRTs ? (
                <DRTTableSkeleton />
              ) : (
                <TableBody>
                  {drtInstances
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
                    .map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.pool.name}</TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant="secondary" className="cursor-help">
                                  {item.drt.name}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{item.drt.description}</p>
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
                            item.isListed ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                          }`}>
                            {item.isListed ? 'Yes' : 'No'}
                          </span>
                        </TableCell>
                        <TableCell>{item.price ? `${item.price.toFixed(2)} SOL` : '-'}</TableCell>
                        <TableCell>
                          <div className="flex justify-around gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              disabled={item.isListed || item.state === 'pending' || item.state === 'completed'}
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