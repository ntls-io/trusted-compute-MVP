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

// LayoutClient.tsx
'use client'

import { useState } from 'react'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'

export default function LayoutClient({
  children,
}: {
  children: React.ReactNode
}) {
  const [isNavOpen, setIsNavOpen] = useState(true)
  const [isHovered, setIsHovered] = useState(false)

  const isExpanded = isNavOpen || isHovered

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <TopBar isNavOpen={isExpanded} toggleNav={() => setIsNavOpen(!isNavOpen)} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar 
          isOpen={isExpanded} 
          onHoverStart={() => !isNavOpen && setIsHovered(true)}
          onHoverEnd={() => setIsHovered(false)}
        />
        <main className="flex-1 overflow-y-auto p-8">
          {children}
        </main>
      </div>
    </div>
  )
}