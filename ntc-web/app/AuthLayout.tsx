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

// AuthLayout.tsx
// AuthLayout.tsx
'use client'

import { useAuth } from '@clerk/nextjs'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import LayoutClient from './LayoutClient'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const isAuthPage = pathname === '/sign-in' || pathname === '/sign-up'

  useEffect(() => {
    if (isLoaded && !isSignedIn && !isAuthPage) {
      router.push('/sign-in')
    }
  }, [isLoaded, isSignedIn, isAuthPage, router])

  // Show loading state while Clerk loads
  if (!isLoaded) {
    return <div>Loading...</div>
  }

  // If on auth page, show without layout
  if (isAuthPage) {
    return children
  }

  // For all other pages, ensure user is signed in
  if (!isSignedIn) {
    return <div>Redirecting to sign in...</div>
  }

  // User is authenticated, show with layout
  return <LayoutClient>{children}</LayoutClient>
}