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

import { useState } from 'react'
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
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react"

interface AnalysisItem {
  name: string
  description: string
  state: string
  listedOnMarketplace: string
}

export default function Analysis() {
  const [search, setSearch] = useState('')
  const [stateFilters, setStateFilters] = useState<string[]>([])
  const [marketplaceFilter, setMarketplaceFilter] = useState<string[]>([])
  const [sortConfig, setSortConfig] = useState<{
    key: keyof AnalysisItem | null;
    direction: 'asc' | 'desc' | null;
  }>({ key: null, direction: null })

  // Sample data
  const items: AnalysisItem[] = [
    {
      name: "Market Analysis 2024",
      description: "Consumer behavior trends Q1",
      state: "active",
      listedOnMarketplace: "yes"
    },
    {
      name: "Financial Metrics",
      description: "Revenue analysis by region",
      state: "completed",
      listedOnMarketplace: "no"
    },
    {
      name: "Customer Demographics",
      description: "Age distribution study",
      state: "active",
      listedOnMarketplace: "yes"
    },
    {
      name: "Sales Performance",
      description: "Monthly sales metrics",
      state: "pending",
      listedOnMarketplace: "no"
    },
    {
      name: "Product Analytics",
      description: "Usage patterns Q4 2023",
      state: "active",
      listedOnMarketplace: "yes"
    }
  ]

  // Handle sort
  const handleSort = (key: keyof AnalysisItem) => {
    let direction: 'asc' | 'desc' | null = 'asc'
    
    if (sortConfig.key === key) {
      if (sortConfig.direction === 'asc') direction = 'desc'
      else if (sortConfig.direction === 'desc') direction = null
    }
    
    setSortConfig({ key, direction })
  }

  // Get sort icon
  const getSortIcon = (key: keyof AnalysisItem) => {
    if (sortConfig.key !== key) return <ChevronsUpDown className="h-4 w-4" />
    if (sortConfig.direction === 'asc') return <ChevronUp className="h-4 w-4" />
    if (sortConfig.direction === 'desc') return <ChevronDown className="h-4 w-4" />
    return <ChevronsUpDown className="h-4 w-4" />
  }

  // Filter and sort items
  const filteredAndSortedItems = items
    .filter(item => {
      const searchTerm = search.toLowerCase()
      const matchesSearch = 
        item.name.toLowerCase().includes(searchTerm) ||
        item.description.toLowerCase().includes(searchTerm) ||
        item.state.toLowerCase().includes(searchTerm) ||
        item.listedOnMarketplace.toLowerCase().includes(searchTerm)

      const matchesState = stateFilters.length === 0 || stateFilters.includes(item.state)
      const matchesMarketplace = marketplaceFilter.length === 0 || marketplaceFilter.includes(item.listedOnMarketplace)

      return matchesSearch && matchesState && matchesMarketplace
    })
    .sort((a, b) => {
      if (!sortConfig.key || !sortConfig.direction) return 0
      
      const aValue = a[sortConfig.key]
      const bValue = b[sortConfig.key]
      
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })

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

  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-bold text-gray-900">Analysis</h1>
      
      <Card>
        {/* Search and Filters */}
        <div className="bg-gray-800 p-4">
          <div className="flex items-center gap-4">
            <Input
              type="text"
              placeholder="Search analysis..."
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
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-2">
                    Name
                    {getSortIcon('name')}
                  </div>
                </TableHead>
                <TableHead 
                  className="text-white cursor-pointer"
                  onClick={() => handleSort('description')}
                >
                  <div className="flex items-center gap-2">
                    Description
                    {getSortIcon('description')}
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
                  onClick={() => handleSort('listedOnMarketplace')}
                >
                  <div className="flex items-center gap-2">
                    Listed on marketplace
                    {getSortIcon('listedOnMarketplace')}
                  </div>
                </TableHead>
                <TableHead className="text-white w-[200px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedItems.map((item, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{item.description}</TableCell>
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