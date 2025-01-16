'use client'

import { usePathname } from 'next/navigation'
import LayoutClient from './LayoutClient'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthPage = pathname === '/sign-in' || pathname === '/sign-up'

  if (isAuthPage) {
    return children
  }

  return <LayoutClient>{children}</LayoutClient>
}