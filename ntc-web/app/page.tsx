"use client"

import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Input } from "@/components/ui/input"
import { ExternalLink, ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'

interface StatsItem {
  label: string
  value: string
}

interface DigitalRight {
  id: string
  name: string
  description: string
}

interface Pool {
  id: number
  name: string
  description: string
  rights: string[]
  contractAddress: string
}

type SortField = 'name' | 'description' | 'rights' | 'contractAddress';
type SortDirection = 'asc' | 'desc' | null;

export default function Home() {
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)

  const statsItems: StatsItem[] = [
    {
      label: "Data Pool",
      value: "1"
    },
    {
      label: "Digital Rights Tokens Sold",
      value: "3"
    },
    {
      label: "Digital Rights Tokens Purchased",
      value: "1"
    },
    {
      label: "Amount Paid Out",
      value: "$20"
    }
  ]

  const availableRights: DigitalRight[] = [
    { 
      id: '2', 
      name: 'Append data pool', 
      description: 'Permits adding new data entries to existing pools while maintaining schema requirements'
    },
    { 
      id: '3', 
      name: 'Execute Median WASM', 
      description: 'Enables running Rust WebAssembly-based median calculations on data pools'
    }
  ]

  const ownedPool: Pool = {
    id: 3,
    name: "Financial Metrics",
    description: "Quarterly financial performance data",
    rights: ['2', '3'],
    contractAddress: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc')
      } else if (sortDirection === 'desc') {
        setSortField(null)
        setSortDirection(null)
      }
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ChevronsUpDown size={16} />
    if (sortDirection === 'asc') return <ChevronUp size={16} />
    if (sortDirection === 'desc') return <ChevronDown size={16} />
    return <ChevronsUpDown size={16} />
  }

  const getRightById = (rightId: string): DigitalRight | undefined => {
    return availableRights.find((right) => right.id === rightId)
  }

  const getSolanaExplorerUrl = (address: string): string => {
    return `https://explorer.solana.com/address/${address}`
  }

  const isPoolVisible = 
    ownedPool.name.toLowerCase().includes(search.toLowerCase()) ||
    ownedPool.description.toLowerCase().includes(search.toLowerCase()) ||
    !search

  return (
    <div className="container mx-auto p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsItems.map((item, index) => (
          <Card key={index} className="p-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-700">{item.label}</span>
              <span className="bg-gray-800 text-white px-3 py-1 rounded-full text-sm">
                {item.value}
              </span>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">My Pools</h2>
        <Card className="w-full overflow-hidden">
          <div className="bg-gray-800 p-4">
            <Input
              placeholder="Search by pool name or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md bg-white"
            />
          </div>
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
              {isPoolVisible ? (
                <TableRow>
                  <TableCell className="font-medium">{ownedPool.name}</TableCell>
                  <TableCell>{ownedPool.description}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {ownedPool.rights.map((rightId) => {
                        const right = getRightById(rightId)
                        if (!right) return null
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
                        )
                      })}
                    </div>
                  </TableCell>
                  <TableCell>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <a
                            href={getSolanaExplorerUrl(ownedPool.contractAddress)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-blue-500 hover:text-blue-700"
                          >
                            <span className="truncate max-w-[450px]">{ownedPool.contractAddress}</span>
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
    </div>
  )
}