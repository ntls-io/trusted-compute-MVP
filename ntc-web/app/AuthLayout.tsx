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