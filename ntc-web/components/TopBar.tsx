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

// components/TopBar.tsx
"use client";

import React from 'react'; // Import React
import Image from "next/image";
import Link from "next/link";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Database,
  BarChartBig,
  Code2,
  Cog,
  AlertTriangle,
} from "lucide-react";
import {
  SignInButton,
  SignedIn,
  SignedOut,
  UserButton,
  ClerkLoading,
  ClerkLoaded,
} from "@clerk/nextjs";
import WalletConnector from "@/components/WalletConnector";
import { useUserProfile, ClientRoleName } from "@/hooks/useUserProfile";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface TopBarProps {
  isNavOpen: boolean;
  toggleNav: () => void;
}

const roleIconMap: Record<ClientRoleName, { icon: React.ReactElement; label: string }> = {
  [ClientRoleName.DATA_PROVIDER]: { icon: <Database className="h-5 w-5 text-sky-600" />, label: "Data Provider" },
  [ClientRoleName.DATA_ANALYST]: { icon: <BarChartBig className="h-5 w-5 text-green-600" />, label: "Data Analyst" },
  [ClientRoleName.CODE_PROVIDER]: { icon: <Code2 className="h-5 w-5 text-purple-600" />, label: "Code Provider" },
};

export default function TopBar({ isNavOpen, toggleNav }: TopBarProps) {
  const { roles, isLoadingProfile, isErrorProfile } = useUserProfile();

  return (
    <header className="h-16 bg-white shadow-sm flex items-center sticky top-0 z-50">
      <div className={`${isNavOpen ? "w-64" : "w-16"} transition-all duration-300 flex-shrink-0`}>
        <div className="h-full p-2 flex items-center">
          <div className="w-12 h-10 flex items-center justify-center">
            <div className="w-8 h-8 relative">
              <Image src="/logo.png" alt="Nautilus Logo" fill className="object-contain" priority />
            </div>
          </div>
          <div
            className={`flex-1 overflow-hidden transition-all duration-300 ${
              isNavOpen ? "w-40 opacity-100 pl-1" : "w-0 opacity-0"
            }`}
          >
            <span className="text-xl font-bold text-gray-800 whitespace-nowrap">
              NAUTILUS
            </span>
          </div>
        </div>
      </div>

      <button
        onClick={toggleNav}
        className="px-3 ml-1 mr-3 hover:bg-gray-100 transition-colors border rounded-lg flex items-center h-9 self-center flex-shrink-0"
        type="button"
        aria-label={isNavOpen ? "Close sidebar" : "Open sidebar"}
      >
        {isNavOpen ? (
          <PanelLeftClose className="h-5 w-5 text-gray-600" />
        ) : (
          <PanelLeftOpen className="h-5 w-5 text-gray-600" />
        )}
      </button>

      <div className="flex-grow"></div>

      <div className="flex items-center pr-4 space-x-3 sm:space-x-4">
        <SignedIn>
          {isLoadingProfile && (
            <div className="flex space-x-1" aria-label="Loading roles...">
              <div className="w-6 h-6 bg-gray-200 rounded-full animate-pulse"></div>
              <div className="w-6 h-6 bg-gray-200 rounded-full animate-pulse"></div>
            </div>
          )}
          {!isLoadingProfile && !isErrorProfile && roles.length > 0 && (
            <TooltipProvider delayDuration={100}>
              <div className="flex items-center space-x-2 border-r pr-3 sm:pr-4 mr-1">
                {roles.map((roleName) => {
                  const roleInfo = roleIconMap[roleName];
                  return roleInfo ? (
                    <Tooltip key={roleName}>
                      <TooltipTrigger asChild>
                        <span className="p-1 hover:bg-gray-100 rounded-full cursor-default">{roleInfo.icon}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{roleInfo.label}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : null;
                })}
              </div>
            </TooltipProvider>
          )}
          {isErrorProfile && !isLoadingProfile && (
             <TooltipProvider delayDuration={100}>
                <Tooltip>
                    <TooltipTrigger asChild>
                         <span className="p-1 flex items-center justify-center cursor-help">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                         </span>
                    </TooltipTrigger>
                    <TooltipContent><p>Could not load roles</p></TooltipContent>
                </Tooltip>
             </TooltipProvider>
          )}

          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link 
                  href="/select-roles" 
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors flex items-center justify-center"
                  aria-label="Manage Your Roles"
                >
                  <Cog className="h-5 w-5 text-gray-700" />
                </Link>
              </TooltipTrigger>
              <TooltipContent>
                <p>Manage Your Roles</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </SignedIn>

        <WalletConnector />

        <ClerkLoading>
          <div className="w-9 h-9 bg-gray-200 animate-pulse rounded-full" aria-label="Loading user authentication..."></div>
        </ClerkLoading>
        <ClerkLoaded>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                Sign in
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: "w-9 h-9" } }} />
          </SignedIn>
        </ClerkLoaded>
      </div>
    </header>
  );
}