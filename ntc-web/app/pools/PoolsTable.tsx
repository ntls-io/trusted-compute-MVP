import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ExternalLink, ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';

interface Right {
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
  isOwned: boolean;
}

interface PoolsTableProps {
  // Add any props if needed
}

type SortField = 'name' | 'description' | 'rights' | 'contractAddress';
type SortDirection = 'asc' | 'desc' | null;

const PoolsTable: React.FC<PoolsTableProps> = () => {
  const [search, setSearch] = useState('');
  const [showMyPools, setShowMyPools] = useState(false);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const availableRights: Right[] = [
    { 
      id: '1', 
      name: 'Create data pool', 
      description: 'Allows creation of new data pools and setting initial parameters for data structure and digital right tokens'
    },
    { 
      id: '2', 
      name: 'Append data pool', 
      description: 'Permits adding new data entries to existing pools while maintaining schema requirements'
    },
    { 
      id: '3', 
      name: 'Execute Median WASM', 
      description: 'Enables running Rust WebAssembly-based median calculations on data pools'
    },
    { 
      id: '4', 
      name: 'Execute Median Python', 
      description: 'Allows execution of Python-based median computations on data pools'
    },
  ];

  const pools: Pool[] = [
    {
      id: 1,
      name: "Market Analysis Pool",
      description: "Contains market trend data from 2023-2024",
      rights: ['2'],
      contractAddress: "7nYuwdHqwrxbr5CKqRqZY6ZduuB3ZSLJsBz8RPKkqvCp",
      isOwned: false,
    },
    {
      id: 2,
      name: "Customer Insights",
      description: "Aggregated customer behavior metrics",
      rights: ['2', '3', '4'],
      contractAddress: "BPFLoader2111111111111111111111111111111111",
      isOwned: false,
    },
    {
      id: 3,
      name: "Financial Metrics",
      description: "Quarterly financial performance data",
      rights: ['2', '3'],
      contractAddress: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      isOwned: true,
    },
  ];

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Cycle through: asc -> desc -> null
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

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ChevronsUpDown size={16} />;
    if (sortDirection === 'asc') return <ChevronUp size={16} />;
    if (sortDirection === 'desc') return <ChevronDown size={16} />;
    return <ChevronsUpDown size={16} />;
  };

  const getRightById = (rightId: string): Right | undefined => {
    return availableRights.find((right) => right.id === rightId);
  };

  const getSolanaExplorerUrl = (address: string): string => {
    return `https://explorer.solana.com/address/${address}`;
  };

  const sortPools = (pools: Pool[]): Pool[] => {
    if (!sortField || !sortDirection) return pools;

    return [...pools].sort((a, b) => {
      if (sortField === 'rights') {
        // Compare by number of rights
        const aValue = a.rights.length;
        const bValue = b.rights.length;
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }

      // For all other fields (which are strings)
      const aValue = a[sortField];
      const bValue = b[sortField];
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      
      return 0;
    });
  };

  const filteredPools = sortPools(
    pools
      .filter((pool) => !showMyPools || pool.isOwned)
      .filter((pool) =>
        pool.name.toLowerCase().includes(search.toLowerCase()) ||
        pool.description.toLowerCase().includes(search.toLowerCase())
      )
  );

  return (
    <Card className="w-full overflow-hidden">
      <div className="bg-gray-800 p-4 flex justify-between items-center gap-4">
        <Input
          placeholder="Search by pool name or description..."
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
              <TableHead 
                className="w-[15%] text-white cursor-pointer"
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center gap-2">
                  Pool Name
                  {getSortIcon('name')}
                </div>
              </TableHead>
              <TableHead 
                className="w-[20%] text-white cursor-pointer"
                onClick={() => handleSort('description')}
              >
                <div className="flex items-center gap-2">
                  Description
                  {getSortIcon('description')}
                </div>
              </TableHead>
              <TableHead 
                className="w-[25%] text-white cursor-pointer"
                onClick={() => handleSort('rights')}
              >
                <div className="flex items-center gap-2">
                  Digital Rights Tokens (DRT)
                  {getSortIcon('rights')}
                </div>
              </TableHead>
              <TableHead 
                className="w-[40%] text-white cursor-pointer"
                onClick={() => handleSort('contractAddress')}
              >
                <div className="flex items-center gap-2">
                  Smart Contract
                  {getSortIcon('contractAddress')}
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPools.map((pool) => (
              <TableRow key={pool.id}>
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
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <a
                          href={getSolanaExplorerUrl(pool.contractAddress)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-blue-500 hover:text-blue-700"
                        >
                          <span className="truncate max-w-[450px]">{pool.contractAddress}</span>
                          <ExternalLink size={16} />
                        </a>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>View on Solana Explorer</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
              </TableRow>
            ))}
            {filteredPools.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-gray-500">
                  No results found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
};

export default PoolsTable;