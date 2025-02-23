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

// app/drt-listings/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { fetchAvailableDRTs, buyDRT } from "@/lib/drtHelpers";
import { useWallet } from "@solana/wallet-adapter-react";
import { useDrtProgram } from "@/lib/useDrtProgram";
import { useUser } from '@clerk/nextjs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  LoaderCircle, 
  ShoppingCart, 
  Wallet, 
  Info, 
  AlertTriangle,
  Shield, 
  Check,
  Coins,
  RefreshCcw,
  CheckCircle2,
  XCircle,
  ExternalLink
} from "lucide-react";

interface Pool {
  id: string;
  name: string;
  chainAddress: string;
  schemaDefinition: {
    costs?: { [key: string]: number };
  };
}

interface DRTInfo {
  name: string;
  mint: string;
  initialSupply: number;
  available: number;
  cost?: number;
  quantity?: number;
}

interface DRTInstance {
  id: string;
  mintAddress: string;
  drtId: string;
  poolId: string;
  ownerId: string;
  state: string;
  price: number | null;
}

const DrtTypeColors: Record<string, string> = {
  append: "bg-indigo-100 text-indigo-800 hover:bg-indigo-200",
  w_compute_median: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200",
  py_compute_median: "bg-amber-100 text-amber-800 hover:bg-amber-200"
};

const DrtStatusColors: Record<string, string> = {
  available: "bg-green-100 text-green-800",
  limited: "bg-amber-100 text-amber-800",
  sold_out: "bg-red-100 text-red-800"
};

const DrtStatusBadge = ({ available }: { available: number }) => {
  let status: keyof typeof DrtStatusColors = "available";
  if (available === 0) status = "sold_out";
  else if (available < 15) status = "limited";

  return (
      <Badge
        className={`${DrtStatusColors[status]} font-medium py-1 px-2`}
        style={{ pointerEvents: "none" }}
      >
      {status === "available" && <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
      {status === "limited" && <AlertTriangle className="w-3.5 h-3.5 mr-1" />}
      {status === "sold_out" && <XCircle className="w-3.5 h-3.5 mr-1" />}
      {status === "available" && "Available"}
      {status === "limited" && `Limited (${available})`}
      {status === "sold_out" && "Sold Out"}
    </Badge>
  );
};

export default function DrtListings() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null);
  const [availableDRTs, setAvailableDRTs] = useState<DRTInfo[]>([]);
  const [myDRTs, setMyDRTs] = useState<DRTInstance[]>([]);
  const [loading, setLoading] = useState(false); // Changed: No initial loading on page load
  const [purchaseLoading, setPurchaseLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const wallet = useWallet();
  const program = useDrtProgram();
  const { user, isLoaded: isUserLoaded } = useUser();

  // Load pools and user's purchased DRTs
  useEffect(() => {
    async function loadInitialData() {
      // Changed: No setLoading(true) here to avoid showing "Loading available DRTs..." on page load
      try {
        // Fetch pools
        const poolsResponse = await fetch("/api/pools");
        if (!poolsResponse.ok) {
          throw new Error(`Failed to fetch pools: ${poolsResponse.status}`);
        }
        const poolsData = await poolsResponse.json();
        setPools(poolsData);
        
        // Only fetch user DRTs if the user is logged in
        if (user?.id) {
          const drtsResponse = await fetch("/api/drts/user");
          if (drtsResponse.ok) {
            const drtsData = await drtsResponse.json();
            if (Array.isArray(drtsData)) {
              setMyDRTs(drtsData);
              console.log(`Loaded ${drtsData.length} previously purchased DRTs`);
            }
          } else {
            console.warn("Failed to fetch user's DRTs:", drtsResponse.status);
          }
        }
      } catch (error) {
        console.error("Error loading initial data:", error);
        setError("Failed to load data. Please try again later.");
      }
      // Changed: No setLoading(false) here since we didn’t set it to true
    }
    
    if (isUserLoaded) {
      loadInitialData();
    }
  }, [isUserLoaded, user?.id]);

  // Store DRT purchase in database
  async function recordPurchase(
    transactions: string[], 
    drt: DRTInfo, 
    quantity: number,
    pool: Pool
  ) {
    if (!transactions?.length) {
      console.warn("Cannot record purchase: No transaction signatures provided");
      return null;
    }

    try {
      // Main transaction signature (first one if multiple)
      const transactionSignature = transactions[0];
      
      console.log("Recording purchase in database:", {
        transactionSignature,
        poolId: pool.id,
        drtId: drt.name,
        mintAddress: drt.mint,
        quantity,
        price: drt.cost
      });
      
      const response = await fetch('/api/drts/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactionSignature,
          poolId: pool.id,
          drtId: drt.name,
          mintAddress: drt.mint,
          quantity,
          price: drt.cost || 0.01
        }),
      });

      const result = await response.json();
      
      if (!response.ok) {
        console.error('Failed to record purchase in database:', result);
        return null;
      } 
      
      console.log('Purchase successfully recorded in database:', result);
      return result.drtInstances;
      
    } catch (error) {
      console.error('Error recording purchase:', error);
      return null;
    }
  }

  const handleQuantityChange = (drtName: string, value: number) => {
    setAvailableDRTs(current => 
      current.map(drt => 
        drt.name === drtName 
          ? { ...drt, quantity: Math.max(1, Math.min(drt.available, value || 1)) } 
          : drt
      )
    );
  };

  async function handlePoolSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const index = e.target.value;
    setError(null);
    setSuccess(null);
    
    if (index === "") {
      setSelectedPool(null);
      setAvailableDRTs([]);
      return;
    }
    
    const pool = pools[parseInt(index)];
    setSelectedPool(pool);
    setLoading(true); // Changed: Loading only triggers when fetching DRTs after pool selection
    
    try {
      if (!program) throw new Error("DRT Program not available");
      
      const drtsOnChain = await fetchAvailableDRTs(program, pool.chainAddress); // Already fetches latest supply, including burned tokens
      
      // Hardcode cost as 0.01 SOL for all tokens
      const drts: DRTInfo[] = drtsOnChain.map((drt: DRTInfo) => {
        return { 
          ...drt, 
          cost: 0.01,
          quantity: 1 // Default quantity
        };
      });
      
      setAvailableDRTs(drts);
    } catch (error) {
      console.error("Error fetching DRTs:", error);
      setError("Failed to fetch DRTs from the blockchain. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleBuy(drt: DRTInfo) {
    if (!wallet.connected || !selectedPool || !program) {
      setError("Please connect your wallet and select a pool.");
      return;
    }
    
    // Ensure the DRT has a cost and quantity
    if (!drt.cost || drt.cost <= 0) {
      setError(`Cannot purchase ${drt.name}: Invalid price.`);
      return;
    }

    const quantity = drt.quantity || 1;
    if (quantity <= 0 || quantity > drt.available) {
      setError(`Invalid quantity. Please choose between 1 and ${drt.available}.`);
      return;
    }
    
    setPurchaseLoading(drt.name);
    setError(null);
    setSuccess(null);
    
    try {
      console.log(`Buying ${quantity} ${drt.name} tokens for ${drt.cost * quantity} SOL total`);
      
      // Execute blockchain transactions
      const transactions = await buyDRT(
        program,
        wallet,
        selectedPool.chainAddress,
        drt.mint,
        drt.name,
        drt.cost,
        quantity
      );
      
      setSuccess(`Successfully purchased ${quantity} ${formatDrtName(drt.name)} token(s) for ${selectedPool.name}!`);
      
      // Only attempt database recording if user is logged in
      if (user) {
        // Record purchase in database
        const newDrtInstances = await recordPurchase(transactions, drt, quantity, selectedPool);
        if (newDrtInstances) {
            // Add new purchases to the list of owned DRTs without filtering duplicates
            setMyDRTs(prev => {
              // Simply combine previous DRTs with new ones, allowing duplicates
              return [...prev, ...newDrtInstances];
            });
            console.log(`Added ${newDrtInstances.length} new DRT instances to your collection`);
          }
      } else {
        console.log("User not logged in - skipping database recording");
      }
      
      // Refresh the DRT availability after purchase
      const drtsOnChain = await fetchAvailableDRTs(program, selectedPool.chainAddress);
      const updatedDrts: DRTInfo[] = drtsOnChain.map((updatedDrt: DRTInfo) => {
        // Preserve existing quantity settings where possible
        const existingDrt = availableDRTs.find(d => d.name === updatedDrt.name);
        const quantity = existingDrt?.quantity || 1;
        
        return {
          ...updatedDrt,
          cost: 0.01, // Hardcoded to 0.01 SOL
          quantity: Math.min(quantity, updatedDrt.available) // Ensure quantity <= available
        };
      });
      
      setAvailableDRTs(updatedDrts);
    } catch (error) {
      console.error("Error purchasing DRT:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(`Failed to purchase ${drt.name}. ${errorMessage}`);
    } finally {
      setPurchaseLoading(null);
    }
  }

  // Get color based on DRT type
  const getDrtTypeColor = (name: string) => {
    if (name.includes('append') || name.includes('APPEND')) return DrtTypeColors.append;
    if (name.includes('w_compute') || name.includes('EXECUTE_MEDIAN_WASM')) return DrtTypeColors.w_compute_median;
    if (name.includes('py_compute') || name.includes('EXECUTE_MEDIAN_PYTHON')) return DrtTypeColors.py_compute_median;
    return "bg-gray-100 text-gray-800";
  };

  const formatDrtName = (name: string) => {
    const names: Record<string, string> = {
      EXECUTE_MEDIAN_WASM: 'Execute Median WASM',
      EXECUTE_MEDIAN_PYTHON: 'Execute Median Python',
      APPEND_DATA_POOL: 'Append Data Pool',
      w_compute_median: 'Execute Median WASM',
      py_compute_median: 'Execute Median Python',
      append: 'Append Data Pool'
    };
    return names[name] || name;
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Digital Rights Token (DRT) Marketplace</h1>
          </div>
          
          <div className="bg-gray-800 rounded-md p-4 shadow-sm text-white">
            <div className="flex items-start space-x-3">
              <div className="bg-blue-900/60 p-2 rounded-full">
                <Info className="h-5 w-5 text-blue-100" />
              </div>
              <div>
                <h2 className="text-base font-medium text-gray-100">About Digital Rights Tokens</h2>
                <p className="text-gray-300 text-sm mt-1">
                  DRTs represent computational permissions: append data, run WASM computations, or execute Python algorithms - all in secure SGX enclaves.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Connection Alerts - More compact */}
        <div className="space-y-2">
          {!wallet.connected && (
            <Alert variant="default" className="bg-amber-50 border-amber-200 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-700 text-sm">
                Please connect your Solana wallet to purchase DRTs.
              </AlertDescription>
            </Alert>
          )}
          
          {!isUserLoaded ? (
            <Alert className="bg-blue-50 border-blue-200 py-2">
              <RefreshCcw className="h-4 w-4 animate-spin text-blue-600" />
              <AlertDescription className="text-sm">
                Loading user data...
              </AlertDescription>
            </Alert>
          ) : !user ? (
            <Alert className="bg-purple-50 border-purple-200 py-2">
              <Shield className="h-4 w-4 text-purple-600" />
              <AlertDescription className="text-sm">
                Sign in to track your purchases across devices.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        {/* Pool Selection Card - More compact */}
        <Card className="overflow-hidden border-gray-200 shadow-md">
          <CardHeader className="bg-gray-900 text-white py-3">
            <CardTitle className="flex items-center text-lg">
              <Shield className="mr-2 h-4 w-4" />
              Select Data Pool
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <select 
              className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              onChange={handlePoolSelect}
              disabled={loading}
            >
              <option value="">-- Select a Data Pool --</option>
              {pools.map((pool, index) => (
                <option key={pool.id} value={index}>
                  {pool.name} ({pool.chainAddress.slice(0, 8)}...)
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
        
        {/* Success Alert - Positioned here per request */}
        {success && (
          <Alert className="bg-green-50 border-green-200 shadow-sm">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <AlertTitle>Success</AlertTitle>
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}
        
        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="bg-red-50 border-red-300 shadow-sm">
            <XCircle className="h-5 w-5 text-red-600" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* DRT Listings Section - More compact */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-10 bg-white rounded-lg shadow-sm">
            <LoaderCircle className="h-8 w-8 animate-spin text-blue-600 mb-3" />
            <p className="text-base font-medium text-gray-700">Loading available DRTs...</p>
          </div>
        ) : selectedPool && availableDRTs.length > 0 ? (
          <Card className="overflow-hidden shadow-md border-gray-200">
            <CardHeader className="bg-gray-800 text-white py-3">
              <CardTitle className="flex items-center justify-between text-lg">
                <div className="flex items-center">
                  <Coins className="mr-2 h-4 w-4" />
                  Available Digital Rights Tokens
                </div>
                <Badge variant="outline" className="bg-blue-700/30 text-blue-200 border-blue-500 px-2 py-1 text-xs font-bold">
                  {selectedPool.name}
                </Badge>
              </CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-gray-100">
                  <TableRow>
                    <TableHead className="py-2">DRT Type</TableHead>
                    <TableHead className="py-2">Status</TableHead>
                    <TableHead className="text-right py-2">Available/Supply</TableHead>
                    <TableHead className="text-right py-2">Cost (SOL)</TableHead>
                    <TableHead className="text-center py-2">Quantity</TableHead>
                    <TableHead className="text-right py-2">Total (SOL)</TableHead>
                    <TableHead className="text-center py-2">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {availableDRTs.map((drt) => {
                    const quantity = drt.quantity || 1;
                    const totalCost = 0.01 * quantity; // Fixed 0.01 SOL cost
                    const drtDisplayName = formatDrtName(drt.name);
                    
                    return (
                      <TableRow key={drt.name} className="hover:bg-gray-50">
                        <TableCell className="py-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge className={`${getDrtTypeColor(drt.name)} py-1 px-2 font-medium text-xs cursor-help`}>
                                  {drtDisplayName}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="p-3 max-w-xs bg-gray-900 text-white">
                                <h3 className="font-semibold mb-1">{drtDisplayName}</h3>
                                <p className="text-sm text-gray-200">
                                  {drt.name === 'append' && 
                                    "Allows adding new data to the pool while maintaining schema integrity."}
                                  {drt.name === 'w_compute_median' && 
                                    "Executes WASM-based median computation within secure SGX enclaves."}
                                  {drt.name === 'py_compute_median' && 
                                    "Runs Python-based median algorithms on pool data in trusted execution environments."}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="py-2">
                          <DrtStatusBadge available={drt.available} />
                        </TableCell>
                        <TableCell className="text-right font-mono py-2 text-sm">
                          {drt.available}/{drt.initialSupply}
                        </TableCell>
                        <TableCell className="text-right font-mono py-2 text-sm">
                          0.01
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex justify-center">
                            <Input
                              type="number"
                              min={1}
                              max={drt.available}
                              value={quantity}
                              onChange={(e) => handleQuantityChange(drt.name, parseInt(e.target.value))}
                              className="w-16 text-center h-8 text-sm"
                              disabled={purchaseLoading !== null || drt.available <= 0}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="font-medium text-right font-mono py-2 text-sm">
                          {totalCost.toFixed(2)}
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex justify-center">
                            <Button 
                              onClick={() => handleBuy(drt)} 
                              disabled={
                                purchaseLoading !== null || 
                                drt.available <= 0 || 
                                !wallet.connected
                              }
                              className="relative h-8 px-3 bg-gray-800 text-white hover:bg-gray-700 text-sm"
                              size="sm"
                            >
                              {purchaseLoading === drt.name ? (
                                <div className="flex items-center">
                                  <LoaderCircle className="animate-spin h-3 w-3 mr-1" />
                                  <span>Buying...</span>
                                </div>
                              ) : (
                                <div className="flex items-center">
                                  <ShoppingCart className="h-3 w-3 mr-1" />
                                  <span>Buy</span>
                                </div>
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        ) : selectedPool ? (
          <Alert variant="destructive" className="shadow-sm">
            <AlertDescription>
              No Digital Rights Tokens available in this pool. Please select a different pool.
            </AlertDescription>
          </Alert>
        ) : null}
        
        {/* My DRT Purchases Section - More compact */}
        <div className="mt-6">
          <Card className="overflow-hidden border-gray-200 shadow-md">
            <CardHeader className="bg-gray-800 text-white py-3">
              <CardTitle className="flex items-center text-lg">
                <Shield className="mr-2 h-4 w-4" />
                My Digital Rights Token Purchases
              </CardTitle>
            </CardHeader>
            {!isUserLoaded ? (
              <CardContent className="py-8 flex justify-center items-center">
                <div className="flex items-center">
                  <LoaderCircle className="animate-spin h-6 w-6 text-blue-600 mr-2" />
                  <p className="text-gray-700">Loading user data...</p>
                </div>
              </CardContent>
            ) : user ? (
              myDRTs.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-gray-100">
                      <TableRow>
                        <TableHead className="py-2">DRT Type</TableHead>
                        <TableHead className="py-2">Pool</TableHead>
                        <TableHead className="py-2">Mint Address</TableHead>
                        <TableHead className="text-right py-2">Price</TableHead>
                        <TableHead className="py-2">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myDRTs.map((drt) => {
                        const pool = pools.find(p => p.id === drt.poolId);
                        return (
                          <TableRow key={drt.id} className="hover:bg-gray-50">
                            <TableCell className="py-2">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge className={`${getDrtTypeColor(drt.drtId)} py-1 px-2 font-medium text-xs cursor-help`}>
                                      {formatDrtName(drt.drtId)}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="p-3 max-w-xs bg-gray-900 text-white">
                                    <h3 className="font-semibold mb-1">{formatDrtName(drt.drtId)}</h3>
                                    <p className="text-sm text-gray-200">
                                      {drt.drtId === 'APPEND_DATA_POOL' && 
                                        "Allows adding new data to the pool while maintaining schema integrity."}
                                      {drt.drtId === 'EXECUTE_MEDIAN_WASM' && 
                                        "Executes WASM-based median computation within secure SGX enclaves."}
                                      {drt.drtId === 'EXECUTE_MEDIAN_PYTHON' && 
                                        "Runs Python-based median algorithms on pool data in trusted execution environments."}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </TableCell>
                            <TableCell className="py-2 text-sm">
                              {pool?.name || 'Unknown Pool'}
                            </TableCell>
                            <TableCell className="py-2">
                              <a 
                                href={`https://explorer.solana.com/address/${drt.mintAddress}?cluster=devnet`}
                                target="_blank"
                                rel="noopener noreferrer" 
                                className="font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center"
                              >
                                {`${drt.mintAddress.slice(0, 6)}...${drt.mintAddress.slice(-4)}`}
                                <ExternalLink className="h-3 w-3 ml-1" />
                              </a>
                            </TableCell>
                            <TableCell className="text-right font-mono py-2 text-sm">
                              {drt.price?.toFixed(2) || "0.01"} SOL
                            </TableCell>
                            <TableCell className="py-2">
                              <span className={`
                                px-2 py-1 rounded-full text-xs inline-flex items-center
                                ${drt.state === 'active' ? 'bg-green-100 text-green-800' : 
                                  drt.state === 'pending' ? 'bg-amber-100 text-amber-800' : 
                                  'bg-blue-100 text-blue-800'}
                              `}>
                                {drt.state === 'active' && <Check className="h-3 w-3 mr-1" />}
                                {drt.state === 'pending' && <LoaderCircle className="h-3 w-3 mr-1 animate-spin" />}
                                {drt.state === 'completed' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                                {drt.state}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <CardContent className="py-8 flex flex-col items-center justify-center text-center">
                  <div className="bg-gray-100 p-3 rounded-full mb-3">
                    <ShoppingCart className="h-6 w-6 text-gray-500" />
                  </div>
                  <p className="text-gray-600 text-sm">
                    Your purchased Digital Rights Tokens will appear here after you complete a transaction.
                  </p>
                </CardContent>
              )
            ) : (
              <CardContent className="py-8 flex flex-col items-center justify-center text-center">
                <div className="bg-indigo-100 p-3 rounded-full mb-3">
                  <Shield className="h-6 w-6 text-indigo-500" />
                </div>
                <h3 className="text-base font-medium text-gray-800 mb-1">
                  Sign in to view your purchases
                </h3>
                <p className="text-gray-600 text-sm">
                  Authentication allows tracking your DRTs across devices
                </p>
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}