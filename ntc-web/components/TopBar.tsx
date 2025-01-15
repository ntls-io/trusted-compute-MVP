'use client'

import Image from 'next/image'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'

interface TopBarProps {
  isNavOpen: boolean;
  toggleNav: () => void;
}

export default function TopBar({ isNavOpen, toggleNav }: TopBarProps) {
  return (
    <header className="h-16 bg-white shadow-sm flex">
      <div className={`${isNavOpen ? 'w-64' : 'w-16'} transition-all duration-300`}>
        <div className="h-full p-2 flex items-center">
          <div className="w-12 h-10 flex items-center justify-center">
            <div className="w-8 h-8 relative">
              <Image 
                src="/logo.png"
                alt="Nautilus Logo"
                fill
                className="object-contain"
                priority
              />
            </div>
          </div>
          <div className={`flex-1 overflow-hidden transition-all duration-300 ${
            isNavOpen ? 'w-40 opacity-100' : 'w-0 opacity-0'
          }`}>
            <span className="text-2xl font-bold text-gray-800 whitespace-nowrap">
              NAUTILUS
            </span>
          </div>
        </div>
      </div>

      <button 
        onClick={toggleNav}
        className="px-3 mx-4 hover:bg-gray-100 transition-colors border rounded-lg flex items-center h-8 self-center"
        type="button"
        aria-label={isNavOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        {isNavOpen ? (
          <PanelLeftClose className="h-5 w-5 text-gray-600" />
        ) : (
          <PanelLeftOpen className="h-5 w-5 text-gray-600" />
        )}
      </button>

      <div className="flex-1 flex items-center">
      </div>
    </header>
  )
}
