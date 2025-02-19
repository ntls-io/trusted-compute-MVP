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

import { useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { useAuth } from "@clerk/nextjs";
import { LoaderCircle } from "lucide-react";
import { LoadingProvider, useLoading } from "@/components/LoadingContext";
import { useState } from "react";

function LayoutClientInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isSignedIn, userId } = useAuth();
  const [isNavOpen, setIsNavOpen] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const { isLoading, stopLoading } = useLoading();

  const isExpanded = isNavOpen || isHovered;

  // Global loading handler
  useEffect(() => {
    const handleLoad = () => {
      // Set a minimum display time for loading
      setTimeout(() => {
        stopLoading();
      }, 800);
    };

    if (document.readyState === 'complete') {
      handleLoad();
    } else {
      window.addEventListener('load', handleLoad);
      return () => window.removeEventListener('load', handleLoad);
    }
  }, [stopLoading]);

  // Ensure user exists in database
  useEffect(() => {
    if (isSignedIn && userId) {
      fetch("/api/auth/check-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      }).catch(console.error);
    }
  }, [isSignedIn, userId]);

  return (
    <div className="flex flex-col h-screen bg-gray-100 relative">
      {/* Global loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-8 shadow-xl flex flex-col items-center max-w-md mx-auto">
            <LoaderCircle className="h-14 w-14 animate-spin text-blue-600 mb-6" />
            <h3 className="text-2xl font-semibold text-gray-800 mb-3">Loading application</h3>
            <p className="text-gray-600 text-center">
              Please wait while we prepare your dashboard...
            </p>
          </div>
        </div>
      )}

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
  return (
    <LoadingProvider>
      <LayoutClientInner>{children}</LayoutClientInner>
    </LoadingProvider>
  );
}

