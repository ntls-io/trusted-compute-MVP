'use client'

import Image from 'next/image'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { 
  SignInButton, 
  SignedIn, 
  SignedOut, 
  UserButton,
  ClerkLoading,
  ClerkLoaded 
} from '@clerk/nextjs'

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

      <div className="flex-1 flex items-center justify-end pr-4">
        <ClerkLoading>
          <div className="w-24 h-8 bg-gray-100 animate-pulse rounded-lg"></div>
        </ClerkLoading>
        <ClerkLoaded>
          <SignedOut>
            <SignInButton>
              <button className="px-4 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                Sign in
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton afterSignOutUrl="/"/>
          </SignedIn>
        </ClerkLoaded>
      </div>
    </header>
  )
}