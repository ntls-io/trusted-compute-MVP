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

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, LayoutDashboard, LineChart, ShoppingCart } from 'lucide-react'

interface SidebarProps {
  isOpen: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}

export default function Sidebar({ isOpen, onHoverStart, onHoverEnd }: SidebarProps) {
  const pathname = usePathname()

  const navItems = [
    { name: 'Home', href: '/', icon: Home, disabled: false },
    { name: 'Pools', href: '/pools', icon: LayoutDashboard, disabled: false },
    { name: 'Analysis', href: '/analysis', icon: LineChart, disabled: false },
    { name: 'Market', href: '/market', icon: ShoppingCart, disabled: true },
  ]

  return (
    <div 
      className={`${isOpen ? 'w-64' : 'w-16'} transition-all duration-300 bg-white shadow-lg`}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
    >
      <nav className="p-2 space-y-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          const isDisabled = item.disabled

          return (
            <div
              key={item.name}
              className={`flex items-center rounded-lg transition-colors ${
                isActive ? 'bg-gray-800 text-white' : isDisabled ? 'text-gray-400 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <div className="w-12 h-10 flex items-center justify-center flex-shrink-0">
                <item.icon className="h-5 w-5" />
              </div>
              {isDisabled ? (
                <div className={`flex-1 overflow-hidden transition-all duration-300 ${
                  isOpen ? 'w-40 opacity-100' : 'w-0 opacity-0'
                }`}>
                  <span className="whitespace-nowrap font-medium">{item.name}</span>
                </div>
              ) : (
                <Link
                  href={item.href}
                  className={`flex-1 overflow-hidden transition-all duration-300 ${
                    isOpen ? 'w-40 opacity-100' : 'w-0 opacity-0'
                  }`}
                >
                  <span className="whitespace-nowrap font-medium">{item.name}</span>
                </Link>
              )}
            </div>
          )
        })}
      </nav>
    </div>
  )
}