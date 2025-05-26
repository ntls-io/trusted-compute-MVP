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

// components/Sidebar.tsx
'use client'

import React from 'react';
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, LayoutDashboard, LineChart, ShoppingCart, Loader2, Cog, AlertTriangle, Database, Code2 } from 'lucide-react'
import { useUserProfile, ClientRoleName } from '@/hooks/useUserProfile'; // Ensure this path is correct
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SidebarProps {
  isOpen: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}

const roleIconMap: Record<ClientRoleName, { icon: React.ReactElement; label: string }> = {
  [ClientRoleName.DATA_PROVIDER]: { icon: <Database className="h-5 w-5 text-sky-600" />, label: "Data Provider" },
  [ClientRoleName.DATA_ANALYST]: { icon: <LineChart className="h-5 w-5 text-green-600" />, label: "Data Analyst" },
  [ClientRoleName.CODE_PROVIDER]: { icon: <Code2 className="h-5 w-5 text-purple-600" />, label: "Code Provider" },
};

const allNavItems = [
  { name: 'Home', href: '/', icon: Home, disabled: false, requiredRoles: [] as ClientRoleName[] },
  { name: 'Pools', href: '/pools', icon: LayoutDashboard, disabled: false, requiredRoles: [ClientRoleName.DATA_PROVIDER, ClientRoleName.CODE_PROVIDER] },
  { name: 'Analysis', href: '/analysis', icon: LineChart, disabled: false, requiredRoles: [ClientRoleName.DATA_ANALYST] },
  { name: 'DRT Marketplace', href: '/drt-listings', icon: ShoppingCart, disabled: false, requiredRoles: [ClientRoleName.DATA_PROVIDER, ClientRoleName.CODE_PROVIDER, ClientRoleName.DATA_ANALYST] },
  { name: 'Market', href: '/market', icon: ShoppingCart, disabled: true, requiredRoles: [] as ClientRoleName[] },
];

export default function Sidebar({ isOpen, onHoverStart, onHoverEnd }: SidebarProps) {
  const pathname = usePathname();
  const { userProfile, roles, isLoadingProfile, isErrorProfile } = useUserProfile();

  // --- Loading State for the entire sidebar ---
  if (isLoadingProfile) {
    return (
      <div 
        className={`${isOpen ? 'w-64' : 'w-16'} transition-all duration-300 bg-white shadow-lg p-2 space-y-2`}
        onMouseEnter={onHoverStart}
        onMouseLeave={onHoverEnd}
      >
        {[...Array(3)].map((_, index) => (
          <div key={index} className={`flex items-center rounded-lg h-10 ${isOpen ? 'p-0' : 'justify-center'}`}>
            <div className="w-12 h-10 flex items-center justify-center flex-shrink-0">
              <div className="w-5 h-5 bg-gray-200 rounded-full animate-pulse"></div>
            </div>
            {isOpen && <div className="ml-0 flex-1 h-4 bg-gray-200 rounded animate-pulse"></div>}
          </div>
        ))}
      </div>
    );
  }

  // --- Determine items to display after loading is complete ---
  // Default to showing only "Home" if conditions aren't met for more items.
  let navItemsToDisplay = allNavItems.filter(item => item.name === 'Home');

  const profileFetchErrorIs404 = isErrorProfile && (isErrorProfile as any).status === 404;
  const profileLoadedSuccessfully = userProfile && roles; // `roles` from hook defaults to [] if userProfile.roles is undefined

  if (profileLoadedSuccessfully && roles.length > 0) {
    // User has a profile AND roles. Apply full filtering.
    navItemsToDisplay = allNavItems.filter(item => {
      if (item.name === 'Home' || item.disabled) { // "Home" and "Market (disabled)"
        return true;
      }
      if (item.requiredRoles && item.requiredRoles.length > 0) {
        return item.requiredRoles.some(requiredRole => roles.includes(requiredRole));
      }
      // Fallback for items without specific role requirements (if any added later and not Home/disabled)
      return true; 
    });
  } else if (profileLoadedSuccessfully && roles.length === 0) {
    // User has a profile but NO roles. Already defaulted to "Home" only.
    console.log("Sidebar: User has profile but no roles, showing Home only.");
    // navItemsToDisplay remains filtered to 'Home'
  } else if (profileFetchErrorIs404) {
    // New user, profile 404'd from /api/user/me. Already defaulted to "Home" only.
    console.log("Sidebar: User profile not found (404, likely new user), showing Home only.");
    // navItemsToDisplay remains filtered to 'Home'
  } else if (isErrorProfile) { 
    // Any other error fetching profile. Default to "Home" only.
    console.error("Sidebar: Unexpected error loading user profile, status:", (isErrorProfile as any).status, ". Showing Home only.");
    // navItemsToDisplay remains filtered to 'Home'
  }
  // If !userProfile and no error (e.g., signed out, which middleware should prevent here),
  // it will also default to Home only.

  return (
    <div 
      className={`${isOpen ? 'w-64' : 'w-16'} transition-all duration-300 bg-white shadow-lg`}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
    >
      <nav className="p-2 space-y-2">
        {(navItemsToDisplay || []).map((item) => { // Fallback for navItemsToDisplay just in case
          const isActive = pathname === item.href;
          const isDisabled = item.disabled;

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
                  } ${isActive ? 'pointer-events-none' : ''}`}
                  aria-disabled={isActive || isDisabled}
                  tabIndex={isDisabled ? -1 : undefined}
                >
                  <span className="whitespace-nowrap font-medium">{item.name}</span>
                </Link>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}