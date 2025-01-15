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