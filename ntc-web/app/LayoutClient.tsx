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

// app/LayoutClient.tsx
"use client";

import React, { useEffect, useState } from "react"; // React import
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { useAuth } from "@clerk/nextjs"; // Clerk hook for auth status
import { Loader2 } from "lucide-react";

// --- Imports for Role Checking & User Profile ---
import { usePathname, useRouter } from 'next/navigation';
import { useUserProfile, ClientRoleName } from '@/hooks/useUserProfile';

// --- Define role requirements for specific base paths ---
// Add other restricted routes here as needed.
// The homepage '/' is handled by the general "no roles" check below if it's not listed here.
const routeRoleRequirements: Record<string, ClientRoleName[] | undefined> = {
  '/pools': [ClientRoleName.DATA_PROVIDER, ClientRoleName.CODE_PROVIDER],
  '/analysis': [ClientRoleName.DATA_ANALYST],
  '/drt-listings': [ClientRoleName.DATA_PROVIDER, ClientRoleName.CODE_PROVIDER, ClientRoleName.DATA_ANALYST],
  // Example: To block '/market' even if it's not explicitly disabled in sidebar:
  // '/market': ["A_ROLE_NO_ONE_HAS" as ClientRoleName], // This would effectively block it if roles are enforced
};

function LayoutClientInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isSignedIn, userId, isLoaded: isAuthLoaded_clerk } = useAuth(); // Clerk's core auth status
  const [isNavOpen, setIsNavOpen] = useState(true); // Your existing nav state
  const [isHovered, setIsHovered] = useState(false); // Your existing hover state

  // --- Hooks for role checking ---
  const router = useRouter();
  const pathname = usePathname();
  // useUserProfile uses its own useUser for isSignedIn and isLoaded, which is fine.
  const { userProfile, roles, isLoadingProfile, isErrorProfile } = useUserProfile();

  const isExpanded = isNavOpen || isHovered;

  // Ensure user exists in database
  useEffect(() => {
    if (isSignedIn && userId) {
      fetch("/api/auth/check-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }), // Ensure your API expects { userId }
      })
      .then(res => {
        if(!res.ok) {
            console.error("LayoutClientInner: check-user call failed with status:", res.status, res.statusText);
        }
        // else { console.log("LayoutClientInner: check-user call successful or already handled.");}
      })
      .catch(err => console.error("LayoutClientInner: check-user fetch error:", err));
    }
  }, [isSignedIn, userId]);


  // --- useEffect for Role-Based Access Control and "Select Roles" Redirect ---
  useEffect(() => {
    // Wait for both Clerk's auth status AND our custom user profile (with roles) to be loaded.
    if (!isAuthLoaded_clerk || isLoadingProfile) {
      return;
    }

    if (isSignedIn) { // Clerk confirms user is signed in
      const profileFetchErrorIs404 = isErrorProfile && (isErrorProfile as any).status === 404;
      const profileLoadedButNoRoles = userProfile && roles.length === 0;

      // Condition 1: User needs to select roles.
      // (Handles new users whose profile from /api/user/me might 404 initially,
      // or existing users who genuinely have no roles).
      // Avoid redirect loop if already on a page that doesn't need this check.
      if ((profileLoadedButNoRoles || profileFetchErrorIs404) &&
          pathname !== '/select-roles' &&
          !pathname.startsWith('/sign-up')) { // /sign-up has its own role selection
        console.log(`LayoutClientInner: User at ${pathname} needs roles. Redirecting to /select-roles.`);
        router.replace(`/select-roles?next=${encodeURIComponent(pathname)}`);
        return; // Exit after triggering redirect
      }

      // Condition 2: User has roles, check if they can access the current page.
      if (userProfile && roles.length > 0) {
        // Find if the current route (or its base, e.g., /pools for /pools/new) has specific role requirements.
        const baseRouteKey = Object.keys(routeRoleRequirements).find(
          (key) => key !== '/' && pathname.startsWith(key)
        );
        
        if (baseRouteKey) { // Current route or its parent has defined role requirements
          const requiredRolesForRoute = routeRoleRequirements[baseRouteKey];
          if (requiredRolesForRoute && requiredRolesForRoute.length > 0) {
            const hasAccess = requiredRolesForRoute.some(role => roles.includes(role));
            if (!hasAccess) {
              console.warn(`LayoutClientInner: User lacks required roles for ${pathname}. Redirecting to home (/).`);
              router.replace('/'); // Or to a dedicated '/unauthorized' page
              return; 
            }
          }
        }
      } else if (isErrorProfile && !profileFetchErrorIs404) {
        // A genuine error (not a 404) occurred while fetching profile for a signed-in user.
        console.error("LayoutClientInner: Unexpected error loading profile, redirecting to home (/). Details:", isErrorProfile);
        router.replace('/'); // Or an error page
        return;
      }
    }
    // If !isSignedIn, the <SignedOut> in RootLayout handles redirection to sign-in.
  }, [isAuthLoaded_clerk, isSignedIn, userProfile, roles, isLoadingProfile, isErrorProfile, pathname, router]);


  // --- Loading UI States (these will show before the main layout if conditions met) ---
  if (!isAuthLoaded_clerk || (isSignedIn && isLoadingProfile)) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-100">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
        <p className="ml-4 text-lg font-medium text-gray-700">Loading your session...</p>
      </div>
    );
  }

  const needsRoleSelectionRedirect = isSignedIn && !isLoadingProfile &&
    ((userProfile && roles.length === 0) || (!userProfile && isErrorProfile && (isErrorProfile as any).status === 404)) &&
    pathname !== '/select-roles' && !pathname.startsWith('/sign-up');

  if (needsRoleSelectionRedirect) {
    return (
        <div className="flex h-screen w-screen items-center justify-center bg-gray-100">
            <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
            <p className="ml-4 text-lg font-medium text-gray-700">Finalizing your account setup...</p>
        </div>
    );
  }
  
  if (isSignedIn && isErrorProfile && (isErrorProfile as any).status !== 404) {
    // Handle critical error fetching profile for an already signed-in user (not a 404)
    return (
        <div className="flex h-screen w-screen items-center justify-center bg-gray-100 p-4">
            <div className="text-center">
                <h2 className="text-xl font-semibold text-red-600 mb-2">Application Error</h2>
                <p className="text-gray-700">Could not load your profile details. Please try signing out and in again.</p>
                 {/* TopBar with UserButton might not be rendered here yet, so can't easily put a sign out button here */}
            </div>
        </div>
    );
  }

  // --- Your Existing Main Layout Structure ---
  return (
    <div className="flex flex-col h-screen bg-gray-100 relative">
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
  );
}

// Wrapper component to provide the loading context
export default function LayoutClient({ children }: { children: React.ReactNode }) {
  return <LayoutClientInner>{children}</LayoutClientInner>;
}