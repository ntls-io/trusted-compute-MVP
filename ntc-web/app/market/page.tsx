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

interface DigitalRight {
  id: string
  name: string
  description: string
}

interface MarketItem {
  name: string
  description: string
  price: string
  digitalRights: DigitalRight
  seller: string
  state: string
}

export default function Market() {
  const [search, setSearch] = useState('')
  const [sortConfig, setSortConfig] = useState<{
    key: keyof MarketItem | null;
    direction: 'asc' | 'desc' | null;
  }>({ key: null, direction: null })
  const [loading, setLoading] = useState(false)

  // Available digital rights
  const availableRights: DigitalRight[] = [
    { id: '2', name: 'Append data pool', description: 'Permits adding new data entries to existing pools while maintaining schema requirements' },
    { id: '3', name: 'Execute Median WASM', description: 'Enables running Rust WebAssembly-based median calculations on data pools' },
    { id: '4', name: 'Execute Median Python', description: 'Allows execution of Python-based median computations on data pools' }
  ]

  // Sample market data (replace with API call)
  const items: MarketItem[] = [
    {
      name: "Market Analysis 2024",
      description: "Consumer behavior trends Q1",
      price: "$299",
      digitalRights: availableRights[0],
      seller: "AnalyticsCorp",
      state: "available"
    },
    {
      name: "Customer Demographics",
      description: "Age distribution study",
      price: "$199",
      digitalRights: availableRights[1],
      seller: "DataMetrics",
      state: "available"
    },
    {
      name: "Product Analytics",
      description: "Usage patterns Q4 2023",
      price: "$399",
      digitalRights: availableRights[2],
      seller: "InsightPro",
      state: "available"
    }
  ]

  // Handle sort
  const handleSort = (key: keyof MarketItem) => {
    let direction: 'asc' | 'desc' | null = 'asc'
    
    if (sortConfig.key === key) {
      if (sortConfig.direction === 'asc') direction = 'desc'
      else if (sortConfig.direction === 'desc') direction = null
    }
    
    setSortConfig({ key, direction })
  }

  // Get sort icon
  const getSortIcon = (key: keyof MarketItem) => {
    if (sortConfig.key !== key) return <ChevronsUpDown className="h-4 w-4" />
    if (sortConfig.direction === 'asc') return <ChevronUp className="h-4 w-4" />
    if (sortConfig.direction === 'desc') return <ChevronDown className="h-4 w-4" />
    return <ChevronsUpDown className="h-4 w-4" />
  }

  // Filter and sort items
  const filteredAndSortedItems = items
    .filter(item => {
      const searchTerm = search.toLowerCase()
      return (
        item.name.toLowerCase().includes(searchTerm) ||
        item.description.toLowerCase().includes(searchTerm) ||
        item.seller.toLowerCase().includes(searchTerm) ||
        item.digitalRights.name.toLowerCase().includes(searchTerm)
      )
    })
    .sort((a, b) => {
      if (!sortConfig.key || !sortConfig.direction) return 0
      
      const aValue = a[sortConfig.key]
      const bValue = b[sortConfig.key]
      
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })

  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-bold text-gray-900">Market</h1>
      
      <Card>
        {/* Search */}
        <div className="bg-gray-800 p-4">
          <div className="flex items-center gap-4">
            <Input
              type="text"
              placeholder="Search marketplace..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs bg-white"
            />
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
                  onClick={() => handleSort('price')}
                >
                  <div className="flex items-center gap-2">
                    Price
                    {getSortIcon('price')}
                  </div>
                </TableHead>
                <TableHead 
                  className="text-white cursor-pointer"
                  onClick={() => handleSort('digitalRights')}
                >
                  <div className="flex items-center gap-2">
                    Digital Rights
                    {getSortIcon('digitalRights')}
                  </div>
                </TableHead>
                <TableHead 
                  className="text-white cursor-pointer"
                  onClick={() => handleSort('seller')}
                >
                  <div className="flex items-center gap-2">
                    Seller
                    {getSortIcon('seller')}
                  </div>
                </TableHead>
                <TableHead className="text-white w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedItems.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.description}</TableCell>
                    <TableCell>{item.price}</TableCell>
                    <TableCell>
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        {item.digitalRights.name}
                      </span>
                    </TableCell>
                    <TableCell>{item.seller}</TableCell>
                    <TableCell>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="w-full"
                      >
                        Buy
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
              {!loading && filteredAndSortedItems.length === 0 && (
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
  )
}