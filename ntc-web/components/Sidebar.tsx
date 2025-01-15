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
    { name: 'Home', href: '/', icon: Home },
    { name: 'Pools', href: '/pools', icon: LayoutDashboard },
    { name: 'Analysis', href: '/analysis', icon: LineChart },
    { name: 'Market', href: '/market', icon: ShoppingCart },
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
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center rounded-lg transition-colors ${
                isActive ? 'bg-gray-800 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <div className="w-12 h-10 flex items-center justify-center flex-shrink-0">
                <item.icon className="h-5 w-5" />
              </div>
              <div className={`flex-1 overflow-hidden transition-all duration-300 ${
                isOpen ? 'w-40 opacity-100' : 'w-0 opacity-0'
              }`}>
                <span className="whitespace-nowrap font-medium">
                  {item.name}
                </span>
              </div>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}