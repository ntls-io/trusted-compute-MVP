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
//ntc-web/components/PoolAccount.tsx
"use client";

import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink, Database, RefreshCw, Loader2, Info, CheckCircle2, AlertCircle } from 'lucide-react';
import { useDrtProgram } from "@/lib/useDrtProgram";
import { fetchAvailableDRTs } from "@/lib/drtHelpers";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SimpleTooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
}

const SimpleTooltip: React.FC<SimpleTooltipProps> = ({ children, content }) => (
  <div className="group relative inline-flex">
    {children}
    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-4 py-3 rounded bg-gray-900 text-white text-sm font-normal 
                  opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none w-72 z-50 text-left">
      {content}
    </div>
  </div>
);

interface PoolAccountProps {
  chainAddress: string;
}

interface DrtConfig {
  drtType: string;
  mint: string;
  supply: number;
  cost: number;
  githubUrl?: string;
  codeHash?: string;
  isMinted: boolean;
}

interface PoolAccountData {
  owner: string;
  name: string;
  bump: number;
  ownershipMint: string;
  drts: DrtConfig[];
}

interface AvailableDRT {
  name: string;
  mint: string;
  initialSupply: number;
  available: number;
  cost: number;
  isMinted: boolean;
  githubUrl?: string;
  codeHash?: string;
}

interface OwnershipToken {
  mint: string;
  supply: number;
  available: number;
}

const PoolAccountDialog = ({ 
  poolData, 
  drtTokens, 
  ownershipToken, 
  isLoading, 
  onRefresh 
}: { 
  poolData: PoolAccountData | null; 
  drtTokens: AvailableDRT[];
  ownershipToken: OwnershipToken | null;
  isLoading: boolean;
  onRefresh: () => void;
}) => {
  if (isLoading) {
    return (
      <DialogContent className="sm:max-w-4xl max-h-[90vh]">
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
      <DialogContent className="sm:max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Pool Account</DialogTitle>
          <DialogDescription>
            Unable to fetch pool account data. The account may not exist or there may be a connection error.
          </DialogDescription>
        </DialogHeader>
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4 mr-2" />
          <AlertDescription>
            Failed to load pool account data. Please check your connection and try again.
          </AlertDescription>
        </Alert>
      </DialogContent>
    );
  }

  const formatSupply = (supply?: number) => {
    return supply !== undefined ? supply.toLocaleString() : 'Not set';
  };

  // Helper function to get token display information based on name/type
  const getDrtDisplayInfo = (drtType: string) => {
    let displayName = drtType;
    let badgeClass = "bg-gray-100 text-gray-800 border-gray-200";
    let description = "Custom DRT type";
    let icon = <Info className="h-3.5 w-3.5 mr-1" />;
    let githubUrl = "";
    let githubName = displayName;
    
    if (drtType === "ownership") {
      displayName = "Ownership Token";
      badgeClass = "bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200";
      description = "Ownership rights to this pool and fee collection";
      icon = <CheckCircle2 className="h-3.5 w-3.5 mr-1" />;
    } else if (drtType === "append") {
      displayName = "Append Data Pool";
      badgeClass = "bg-indigo-100 text-indigo-800 border-indigo-200 hover:bg-indigo-200";
      description = "Add data to this pool";
      icon = <CheckCircle2 className="h-3.5 w-3.5 mr-1" />;
      githubUrl = "append";
      githubName = "append";
    } else if (drtType === "w_compute_median") {
      displayName = "Execute Median WASM";
      badgeClass = "bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200";
      description = "Execute WASM code to compute the median of data in this pool";
      icon = <CheckCircle2 className="h-3.5 w-3.5 mr-1" />;
      githubUrl = "w_compute_median";
      githubName = "compute_median";
    } else if (drtType === "py_compute_median") {
      displayName = "Execute Median Python";
      badgeClass = "bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200";
      description = "Execute Python code to compute the median of data in this pool";
      icon = <CheckCircle2 className="h-3.5 w-3.5 mr-1" />;
      githubUrl = "py_compute_median";
      githubName = "compute_median";
    } else if (drtType.startsWith("w_compute_")) {
      const operationName = drtType.replace("w_compute_", "");
      displayName = `Execute WASM: ${operationName}`;
      badgeClass = "bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200";
      description = `Execute WASM code for ${operationName}`;
      icon = <CheckCircle2 className="h-3.5 w-3.5 mr-1" />;
      githubUrl = drtType;
      githubName = operationName;
    } else if (drtType.startsWith("py_compute_")) {
      const operationName = drtType.replace("py_compute_", "");
      displayName = `Execute Python: ${operationName}`;
      badgeClass = "bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200";
      description = `Execute Python code for ${operationName}`;
      icon = <CheckCircle2 className="h-3.5 w-3.5 mr-1" />;
      githubUrl = drtType;
      githubName = operationName;
    }
    
    return { displayName, badgeClass, description, icon, githubUrl, githubName };
  };

  return (
    <DialogContent className="sm:max-w-4xl max-h-[90vh]">
      <DialogHeader>
        <div className="flex justify-between items-center">
          <DialogTitle className="text-xl">On-chain data for {poolData.name}</DialogTitle>
          <Button variant="outline" size="sm" onClick={onRefresh} className="flex items-center gap-1">
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </Button>
        </div>
        {/* Owner and address on one line with fixed alignment */}
        <DialogDescription className="flex items-center space-x-2">
          <span>Owner:</span>
          <a 
            href={`https://explorer.solana.com/address/${poolData.owner}?cluster=devnet`}
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-500 hover:text-blue-700 flex items-center"
          >
            {poolData.owner.substring(0, 6)}...{poolData.owner.substring(poolData.owner.length - 4)}
            <ExternalLink className="h-3 w-3 ml-1" />
          </a>
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-3">Supported Digital Rights Tokens (DRTs)</h3>
          <div className="flex flex-wrap gap-2 justify-center">
            {/* Ownership Token badge with tooltip */}
            <SimpleTooltip content={
              <div className="p-1">
                <div className="font-semibold text-base mb-2">Ownership Token</div>
                <div>Ownership rights to this pool and fee collection</div>
              </div>
            }>
              <Badge className="cursor-help bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200 py-1">
                Ownership Token
              </Badge>
            </SimpleTooltip>
            
            {/* Map through all DRTs with tooltips */}
            {poolData.drts.map((drt, index) => {
              const { displayName, badgeClass, description } = getDrtDisplayInfo(drt.drtType);
              
              return (
                <SimpleTooltip key={index} content={
                  <div className="p-1">
                    <div className="font-semibold text-base mb-2">{displayName}</div>
                    <div>{description}</div>
                    {drt.codeHash && (
                      <div className="mt-2">
                        Code Hash: {drt.codeHash.substring(0, 8)}...
                      </div>
                    )}
                  </div>
                }>
                  <Badge className={`cursor-help ${badgeClass} py-1`}>
                    {displayName}
                  </Badge>
                </SimpleTooltip>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-3">Token Supplies</h3>
          {/* Wrap the Card with overflow-y-auto and a fixed maxHeight so that the header remains sticky */}
          <Card className="overflow-y-auto" style={{ maxHeight: '400px' }}>
            <Table className="w-full">
              <TableHeader className="sticky top-0 bg-gray-800 z-10">
                <TableRow className="hover:bg-gray-800">
                  <TableHead className="text-white">Token Type</TableHead>
                  <TableHead className="text-white">Mint Address</TableHead>
                  <TableHead className="text-white text-right">Total Supply</TableHead>
                  <TableHead className="text-white text-right">Cost (SOL)</TableHead>
                  <TableHead className="text-white text-right">Available</TableHead>
                  <TableHead className="text-white text-left">GitHub</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Ownership token row */}
                <TableRow>
                  <TableCell>
                    Ownership Token
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <SimpleTooltip content={
                      <div className="p-1 font-mono text-xs break-all">{poolData.ownershipMint}</div>
                    }>
                      <a 
                        href={`https://explorer.solana.com/address/${poolData.ownershipMint}?cluster=devnet`}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-700 flex items-center gap-1"
                      >
                        {poolData.ownershipMint.substring(0, 6)}...{poolData.ownershipMint.substring(poolData.ownershipMint.length - 4)}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </SimpleTooltip>
                  </TableCell>
                  <TableCell className="text-right">
                    {ownershipToken ? ownershipToken.supply.toLocaleString() : 
                      <div className="flex justify-end">
                        <div className="bg-gray-200 animate-pulse h-6 w-16 rounded"></div>
                      </div>
                    }
                  </TableCell>
                  <TableCell className="text-right">
                    <SimpleTooltip content={
                      <div className="p-1">Ownership tokens are earned by using append DRTs or through pool creation</div>
                    }>
                      <span className="cursor-help">N/A</span>
                    </SimpleTooltip>
                  </TableCell>
                  <TableCell className="text-right">
                    {ownershipToken ? ownershipToken.available.toLocaleString() : 
                      <div className="flex justify-end">
                        <div className="bg-gray-200 animate-pulse h-6 w-16 rounded"></div>
                      </div>
                    }
                  </TableCell>
                  <TableCell className="text-left">N/A</TableCell>
                </TableRow>
                
                {/* DRT tokens from the pool.drts array */}
                {poolData.drts.map((drt, index) => {
                  const drtType = drt.drtType;
                  const { displayName, badgeClass, githubUrl, githubName } = getDrtDisplayInfo(drtType);
                  
                  // Find matching DRT in the tokens array by type or mint
                  const matchingDrt = drtTokens.find(t => 
                    t.name === drtType || t.mint === drt.mint
                  );
                  
                  // Get appropriate GitHub display name
                  const displayGithubName = drt.githubUrl ? 
                    drt.githubUrl.split('/').pop() || drt.githubUrl : 
                    githubName;
                  
                  return (
                    <TableRow key={index}>
                      <TableCell>
                        {displayName}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <SimpleTooltip content={
                          <div className="p-1 font-mono text-xs break-all">{drt.mint}</div>
                        }>
                          <a 
                            href={`https://explorer.solana.com/address/${drt.mint}?cluster=devnet`}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:text-blue-700 flex items-center gap-1"
                          >
                            {drt.mint.substring(0, 6)}...{drt.mint.substring(drt.mint.length - 4)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </SimpleTooltip>
                      </TableCell>
                      <TableCell className="text-right">{formatSupply(drt.supply)}</TableCell>
                      <TableCell className="text-right">
                        {(drt.cost / 1_000_000_000).toFixed(4)}
                      </TableCell>
                      <TableCell className="text-right">
                        {drt.isMinted ? 
                          (matchingDrt?.available !== undefined ? 
                            matchingDrt.available.toLocaleString() : 
                            <div className="flex justify-end">
                              <div className="bg-gray-200 animate-pulse h-6 w-16 rounded"></div>
                            </div>
                          ) : 
                          <span className="text-gray-600">not minted</span>
                        }
                      </TableCell>
                      <TableCell className="text-left">
                        {(drt.githubUrl || githubUrl) ? (
                          <a 
                            href={drt.githubUrl || `https://github.com/example/${githubUrl}`}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:text-blue-700 inline-flex items-center gap-1"
                          >
                            <span>{displayGithubName}</span>
                          </a>
                        ) : (
                          "N/A"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
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
  const [ownershipToken, setOwnershipToken] = useState<OwnershipToken | null>(null);
  const program = useDrtProgram();

  const fetchPoolData = async () => {
    if (!program || !chainAddress) return;
    
    setIsLoading(true);
    try {
      const pubkey = new PublicKey(chainAddress);
      const account = await (program.account as any).pool.fetch(pubkey);
      
      console.log('Raw pool account data:', account);
      
      // Format the account data
      const drts = account.drts.map((drt: any) => {
        // Normalize DRT field names - handle both camelCase and snake_case
        const drtType = drt.drtType || drt.drt_type;
        
        return {
          drtType,
          mint: drt.mint.toString(),
          supply: typeof drt.supply === 'object' ? drt.supply.toNumber() : drt.supply,
          cost: typeof drt.cost === 'object' ? drt.cost.toNumber() : drt.cost,
          githubUrl: drt.githubUrl || drt.github_url,
          codeHash: drt.codeHash || drt.code_hash,
          isMinted: drt.isMinted || drt.is_minted,
        };
      });
      
      setPoolData({
        owner: account.owner.toString(),
        name: account.name,
        bump: account.bump,
        ownershipMint: account.ownershipMint.toString(),
        drts,
      });

      // Fetch DRT token data
      try {
        const availableDRTs = await fetchAvailableDRTs(program, chainAddress);
        console.log('Available DRTs:', availableDRTs);
        setDrtTokens(availableDRTs.map(t => ({ ...t, initialSupply: t.supply })));

        // Fetch ownership token information
        try {
          const ownershipMint = account.ownershipMint;
          // Get token supply from token mint info
          const mintInfo = await program.provider.connection.getTokenSupply(ownershipMint);
          const totalSupply = Number(mintInfo.value.amount);
          
          // For ownership tokens, "available" isn't the same as with DRTs.
          // For display purposes, we're considering the total supply as "available"
          setOwnershipToken({
            mint: ownershipMint.toString(),
            supply: totalSupply,
            available: totalSupply
          });
          
          console.log('Ownership token info:', {
            mint: ownershipMint.toString(),
            supply: totalSupply
          });
        } catch (error) {
          console.error('Error fetching ownership token info:', error);
          setOwnershipToken(null);
        }
      } catch (error) {
        console.error('Error fetching available DRTs:', error);
        setDrtTokens([]);
      }
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
          ownershipToken={ownershipToken}
          isLoading={isLoading}
          onRefresh={fetchPoolData}
        />
      </Dialog>
    </>
  );
};

export default PoolAccount;