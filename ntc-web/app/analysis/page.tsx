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

'use client'

import React from 'react'
import { useEffect, useState } from 'react'
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ChevronDown, ChevronUp, ChevronsUpDown, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface DRTInstance {
  id: string
  mintAddress: string
  state: string
  isListed: boolean
  price: number | null
  drt: {
    id: string
    name: string
    description: string
    githubUrl: string | null
    isActive: boolean
  }
  pool: {
    id: string
    name: string
    description: string
    chainAddress: string
    schemaDefinition: any
  }
  owner: {
    id: string
    clerkId: string
    walletAddress: string
  }
}

interface Stats {
  totalDRTs: number
  activeDRTs: number
  listedDRTs: number
  totalValue: number
}

export default function Analysis() {
  const [search, setSearch] = useState('')
  const [stateFilters, setStateFilters] = useState<string[]>([])
  const [marketplaceFilter, setMarketplaceFilter] = useState<string[]>([])
  const [drtInstances, setDrtInstances] = useState<DRTInstance[]>([])
  const [stats, setStats] = useState<Stats>({
    totalDRTs: 0,
    activeDRTs: 0,
    listedDRTs: 0,
    totalValue: 0
  })
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)
  const [sortConfig, setSortConfig] = useState<{
    key: keyof DRTInstance | null
    direction: 'asc' | 'desc' | null
  }>({ key: null, direction: null })

  // Fetch data from API
  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/api/analysis')
        
        if (!response.ok) {
          if (response.status === 404) {
            setApiError("API endpoint not found. Please check if the backend is running.")
          } else if (response.status === 401) {
            setApiError("Unauthorized access. Please log in.")
          } else {
            setApiError(`API Error ${response.status}: ${response.statusText}`)
          }
          setDrtInstances([])
          return
        }

        const data = await response.json()
        setDrtInstances(Array.isArray(data.drtInstances) ? data.drtInstances : [])
        setStats(data.stats)
        setApiError(null)

      } catch (error) {
        console.error("Network error or API unavailable:", error)
        setApiError("Network error. Please check your connection or backend.")
        setDrtInstances([])
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Handle sort
  const handleSort = (key: keyof DRTInstance) => {
    let direction: 'asc' | 'desc' | null = 'asc'
    
    if (sortConfig.key === key) {
      if (sortConfig.direction === 'asc') direction = 'desc'
      else if (sortConfig.direction === 'desc') direction = null
    }
    
    setSortConfig({ key, direction })
  }

  // Get sort icon
  const getSortIcon = (key: keyof DRTInstance) => {
    if (sortConfig.key !== key) return <ChevronsUpDown className="h-4 w-4" />
    if (sortConfig.direction === 'asc') return <ChevronUp className="h-4 w-4" />
    if (sortConfig.direction === 'desc') return <ChevronDown className="h-4 w-4" />
    return <ChevronsUpDown className="h-4 w-4" />
  }

  const processedData = (() => {
    // First filter
    const filtered = drtInstances.filter(item => {
      const searchTerm = search.toLowerCase()
      const matchesSearch = 
        item.drt.name.toLowerCase().includes(searchTerm) ||
        item.drt.description.toLowerCase().includes(searchTerm) ||
        item.pool.name.toLowerCase().includes(searchTerm) ||
        item.state.toLowerCase().includes(searchTerm) ||
        item.owner.walletAddress.toLowerCase().includes(searchTerm)

      const matchesState = stateFilters.length === 0 || stateFilters.includes(item.state)
      const matchesMarketplace = marketplaceFilter.length === 0 || 
        marketplaceFilter.includes(item.isListed ? 'yes' : 'no')

      return matchesSearch && matchesState && matchesMarketplace
    })

    // Then sort
    const sorted = [...filtered].sort((a, b) => {
      if (!sortConfig.key || !sortConfig.direction) return 0
      
      // Helper function to safely get nested values
      const getValue = (item: DRTInstance, key: keyof DRTInstance) => {
        if (key === 'drt') return item.drt.name
        if (key === 'pool') return item.pool.name
        if (key === 'owner') return item.owner.walletAddress
        return item[key]
      }

      const aValue = getValue(a, sortConfig.key)
      const bValue = getValue(b, sortConfig.key)
      
      // Handle null/undefined values
      if (aValue === null || aValue === undefined) return 1
      if (bValue === null || bValue === undefined) return -1
      
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })

    // Finally group
    return sorted.reduce((acc, item) => {
      const poolId = item.pool.id
      if (!acc[poolId]) {
        acc[poolId] = {
          pool: item.pool,
          drts: []
        }
      }
      acc[poolId].drts.push(item)
      return acc
    }, {} as Record<string, { pool: DRTInstance['pool'], drts: DRTInstance[] }>)
  })()

  // Toggle filter functions
  const toggleStateFilter = (state: string) => {
    setStateFilters(prev => 
      prev.includes(state) 
        ? prev.filter(s => s !== state)
        : [...prev, state]
    )
  }

  const toggleMarketplaceFilter = (value: string) => {
    setMarketplaceFilter(prev =>
      prev.includes(value)
        ? prev.filter(v => v !== value)
        : [...prev, value]
    )
  }

  // Get Solana explorer URL
  const getSolanaExplorerUrl = (address: string): string => {
    return `https://explorer.solana.com/address/${address}`
  }

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-4xl font-bold text-gray-900">Analysis</h1>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-700">Total DRTs</span>
            <span className="bg-gray-800 text-white px-3 py-1 rounded-full text-sm">
              {stats.totalDRTs}
            </span>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-700">Active DRTs</span>
            <span className="bg-green-600 text-white px-3 py-1 rounded-full text-sm">
              {stats.activeDRTs}
            </span>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-700">Listed DRTs</span>
            <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm">
              {stats.listedDRTs}
            </span>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-700">Total Value</span>
            <span className="bg-purple-600 text-white px-3 py-1 rounded-full text-sm">
              {stats.totalValue.toFixed(2)} SOL
            </span>
          </div>
        </Card>
      </div>

      {apiError && (
        <div className="text-center text-red-600 text-lg font-semibold">
          {apiError}
        </div>
      )}
      
      <Card>
        {/* Search and Filters */}
        <div className="bg-gray-800 p-4">
          <div className="flex items-center gap-4">
            <Input
              type="text"
              placeholder="Search by pool name, state, wallet..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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

        {/* Table */}
        <div className="w-full">
          <Table>
          <TableHeader className="bg-gray-800 [&_tr]:border-0">
            <TableRow className="hover:bg-gray-800">
              <TableHead 
                className="text-white cursor-pointer"
                onClick={() => handleSort('drt' as keyof DRTInstance)}
              >
                <div className="flex items-center gap-2">
                  Digital Rights Token
                  {getSortIcon('drt' as keyof DRTInstance)}
                </div>
              </TableHead>
              <TableHead 
                className="text-white cursor-pointer"
                onClick={() => handleSort('state')}
              >
                <div className="flex items-center gap-2">
                  State
                  {getSortIcon('state')}
                </div>
              </TableHead>
              <TableHead 
                className="text-white cursor-pointer"
                onClick={() => handleSort('isListed')}
              >
                <div className="flex items-center gap-2">
                  Listed
                  {getSortIcon('isListed')}
                </div>
              </TableHead>
              <TableHead 
                className="text-white cursor-pointer"
                onClick={() => handleSort('owner' as keyof DRTInstance)}
              >
                <div className="flex items-center gap-2">
                  Owner
                  {getSortIcon('owner' as keyof DRTInstance)}
                </div>
              </TableHead>
              <TableHead 
                className="text-white cursor-pointer"
                onClick={() => handleSort('price')}
              >
                <div className="flex items-center gap-2">
                  Price
                  {getSortIcon('price')}
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(processedData).map(([poolId, { pool, drts }]) => (
              <React.Fragment key={poolId}>
                <TableRow className="bg-gray-50">
                  <TableCell colSpan={5} className="font-bold">
                    {pool.name}
                  </TableCell>
                </TableRow>
                {drts.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="pl-8">
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
                    <TableCell>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="font-mono text-sm">
                              {item.owner.walletAddress.slice(0, 4)}...{item.owner.walletAddress.slice(-4)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-mono text-xs">{item.owner.walletAddress}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell>
                      {item.price ? `${item.price.toFixed(2)} SOL` : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </React.Fragment>
            ))}
            {Object.keys(processedData).length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  No results found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}