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

import { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink, Database, MoreHorizontal, RefreshCw, Loader2 } from 'lucide-react';
import { useDrtProgram } from "@/lib/useDrtProgram";
import { fetchAvailableDRTs } from "@/lib/drtHelpers";

interface PoolAccountProps {
  chainAddress: string;
}

interface PoolAccountData {
  owner: string;
  name: string;
  poolId: number;
  ownershipMint: string;
  appendMint?: string;
  wComputeMedianMint?: string;
  pyComputeMedianMint?: string;
  ownershipSupply: number;
  appendSupply?: number;
  wComputeSupply?: number;
  pyComputeSupply?: number;
  allowedDrts: string[];
}

interface AvailableDRT {
  name: string;
  mint: string;
  initialSupply: number;
  available: number;
}

const PoolAccountDialog = ({ poolData, drtTokens, isLoading, onRefresh }: { 
  poolData: PoolAccountData | null; 
  drtTokens: AvailableDRT[];
  isLoading: boolean;
  onRefresh: () => void;
}) => {
  if (isLoading) {
    return (
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Loading Pool Data</DialogTitle>
          <DialogDescription>
            Fetching on-chain data from Solana...
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-10 w-10 animate-spin text-gray-500" />
        </div>
      </DialogContent>
    );
  }

  if (!poolData) {
    return (
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pool Account</DialogTitle>
          <DialogDescription>
            Unable to fetch pool account data. The account may not exist or there may be a connection error.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    );
  }

  const formatSupply = (supply?: number) => {
    return supply !== undefined ? supply.toLocaleString() : 'Not set';
  };

  return (
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <div className="flex justify-between items-center">
          <DialogTitle>Pool Account Details</DialogTitle>
          <Button variant="outline" size="sm" onClick={onRefresh} className="flex items-center gap-1">
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </Button>
        </div>
        <DialogDescription>
          On-chain data for pool "{poolData.name}"
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-medium">Name</h3>
            <p className="text-sm">{poolData.name}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium">Pool ID</h3>
            <p className="text-sm">{poolData.poolId}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium">Owner</h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a 
                    href={`https://explorer.solana.com/address/${poolData.owner}?cluster=devnet`}
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-blue-500 hover:text-blue-700 flex items-center gap-1 overflow-hidden whitespace-nowrap text-ellipsis"
                  >
                    {poolData.owner.substring(0, 8)}...{poolData.owner.substring(poolData.owner.length - 8)}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-mono text-xs">{poolData.owner}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div>
            <h3 className="text-sm font-medium">Ownership Mint</h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a 
                    href={`https://explorer.solana.com/address/${poolData.ownershipMint}?cluster=devnet`}
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-blue-500 hover:text-blue-700 flex items-center gap-1 overflow-hidden whitespace-nowrap text-ellipsis"
                  >
                    {poolData.ownershipMint.substring(0, 8)}...{poolData.ownershipMint.substring(poolData.ownershipMint.length - 8)}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-mono text-xs">{poolData.ownershipMint}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium mb-2">Allowed DRTs</h3>
          <div className="flex flex-wrap gap-2">
            {poolData.allowedDrts.map((drt, index) => {
              let displayName = drt;
              let badgeClass = "bg-gray-100 text-gray-800";
              
              if (drt === "append") {
                displayName = "Append Data Pool";
                badgeClass = "bg-indigo-100 text-indigo-800 hover:bg-indigo-200";
              } else if (drt === "w_compute_median") {
                displayName = "Execute Median WASM";
                badgeClass = "bg-emerald-100 text-emerald-800 hover:bg-emerald-200";
              } else if (drt === "py_compute_median") {
                displayName = "Execute Median Python";
                badgeClass = "bg-amber-100 text-amber-800 hover:bg-amber-200";
              }
              
              return (
                <TooltipProvider key={index}>
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge className={`cursor-help ${badgeClass}`}>
                        {displayName}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="p-3 max-w-xs bg-gray-900 text-white">
                      <h3 className="font-semibold mb-1">{displayName}</h3>
                      <p className="text-sm text-gray-200">
                        {drt === "append" && "Add data to this pool"}
                        {drt === "w_compute_median" && "Execute WASM code to compute the median of data in this pool"}
                        {drt === "py_compute_median" && "Execute Python code to compute the median of data in this pool"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium mb-2">Token Supplies</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Token Type</TableHead>
                <TableHead>Mint Address</TableHead>
                <TableHead className="text-right">Total Supply</TableHead>
                <TableHead className="text-right">Available</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Ownership Token</TableCell>
                <TableCell className="font-mono text-xs">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a 
                          href={`https://explorer.solana.com/address/${poolData.ownershipMint}?cluster=devnet`}
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-700 flex items-center gap-1"
                        >
                          {poolData.ownershipMint.substring(0, 6)}...{poolData.ownershipMint.substring(poolData.ownershipMint.length - 4)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-mono text-xs">{poolData.ownershipMint}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell className="text-right">{formatSupply(poolData.ownershipSupply)}</TableCell>
                <TableCell className="text-right">
                  {poolData.ownershipSupply > 50000 ? 
                    '—' : 
                    (drtTokens.find(t => t.name === 'ownership')?.available ?? 'Loading...')}
                </TableCell>
              </TableRow>
              {poolData.appendMint && (
                <TableRow>
                  <TableCell>Append Data Pool</TableCell>
                  <TableCell className="font-mono text-xs">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a 
                            href={`https://explorer.solana.com/address/${poolData.appendMint}?cluster=devnet`}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:text-blue-700 flex items-center gap-1"
                          >
                            {poolData.appendMint.substring(0, 6)}...{poolData.appendMint.substring(poolData.appendMint.length - 4)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-mono text-xs">{poolData.appendMint}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell className="text-right">{formatSupply(poolData.appendSupply)}</TableCell>
                  <TableCell className="text-right">
                    {poolData.appendSupply && poolData.appendSupply > 50000 ? 
                      '—' : 
                      (drtTokens.find(t => t.name === 'append')?.available ?? 'Loading...')}
                  </TableCell>
                </TableRow>
              )}
              {poolData.wComputeMedianMint && (
                <TableRow>
                  <TableCell>Execute Median WASM</TableCell>
                  <TableCell className="font-mono text-xs">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a 
                            href={`https://explorer.solana.com/address/${poolData.wComputeMedianMint}?cluster=devnet`}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:text-blue-700 flex items-center gap-1"
                          >
                            {poolData.wComputeMedianMint.substring(0, 6)}...{poolData.wComputeMedianMint.substring(poolData.wComputeMedianMint.length - 4)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-mono text-xs">{poolData.wComputeMedianMint}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell className="text-right">{formatSupply(poolData.wComputeSupply)}</TableCell>
                  <TableCell className="text-right">
                    {poolData.wComputeSupply && poolData.wComputeSupply > 50000 ? 
                      '—' : 
                      (drtTokens.find(t => t.name === 'w_compute_median')?.available ?? 'Loading...')}
                  </TableCell>
                </TableRow>
              )}
              {poolData.pyComputeMedianMint && (
                <TableRow>
                  <TableCell>Execute Median Python</TableCell>
                  <TableCell className="font-mono text-xs">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a 
                            href={`https://explorer.solana.com/address/${poolData.pyComputeMedianMint}?cluster=devnet`}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:text-blue-700 flex items-center gap-1"
                          >
                            {poolData.pyComputeMedianMint.substring(0, 6)}...{poolData.pyComputeMedianMint.substring(poolData.pyComputeMedianMint.length - 4)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-mono text-xs">{poolData.pyComputeMedianMint}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell className="text-right">{formatSupply(poolData.pyComputeSupply)}</TableCell>
                  <TableCell className="text-right">
                    {poolData.pyComputeSupply && poolData.pyComputeSupply > 50000 ? 
                      '—' : 
                      (drtTokens.find(t => t.name === 'py_compute_median')?.available ?? 'Loading...')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </DialogContent>
  );
};

const PoolAccount: React.FC<PoolAccountProps> = ({ chainAddress }) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [poolData, setPoolData] = useState<PoolAccountData | null>(null);
  const [drtTokens, setDrtTokens] = useState<AvailableDRT[]>([]);
  const program = useDrtProgram();

  const fetchPoolData = async () => {
    if (!program || !chainAddress) return;
    
    setIsLoading(true);
    try {
      const pubkey = new PublicKey(chainAddress);
      const account = await program.account.pool.fetch(pubkey);
      
      // Format the account data
      setPoolData({
        owner: account.owner.toString(),
        name: account.name,
        poolId: account.poolId.toNumber(),
        ownershipMint: account.ownershipMint.toString(),
        appendMint: account.appendMint ? account.appendMint.toString() : undefined,
        wComputeMedianMint: account.wComputeMedianMint ? account.wComputeMedianMint.toString() : undefined,
        pyComputeMedianMint: account.pyComputeMedianMint ? account.pyComputeMedianMint.toString() : undefined,
        ownershipSupply: account.ownershipSupply.toNumber(),
        appendSupply: account.appendSupply ? account.appendSupply.toNumber() : undefined,
        wComputeSupply: account.wComputeSupply ? account.wComputeSupply.toNumber() : undefined,
        pyComputeSupply: account.pyComputeSupply ? account.pyComputeSupply.toNumber() : undefined,
        allowedDrts: account.allowedDrts,
      });

      // Fetch DRT balances
      const availableDRTs = await fetchAvailableDRTs(program, chainAddress);
      setDrtTokens(availableDRTs);
    } catch (error) {
      console.error('Error fetching pool account:', error);
      setPoolData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDialog = () => {
    setIsDialogOpen(true);
    fetchPoolData();
  };

  return (
    <>
      <Button 
        variant="outline" 
        size="sm" 
        onClick={handleOpenDialog}
        className="flex items-center gap-1"
      >
        <Database className="h-4 w-4" />
        <span>Pool Account</span>
      </Button>
      
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <PoolAccountDialog 
          poolData={poolData} 
          drtTokens={drtTokens}
          isLoading={isLoading}
          onRefresh={fetchPoolData}
        />
      </Dialog>
    </>
  );
};

export default PoolAccount;