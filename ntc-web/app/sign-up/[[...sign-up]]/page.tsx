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

// ntc-web/app/sign-up/[[...sign-up]]/page.tsx
'use client';

import { SignUp, useUser } from "@clerk/nextjs";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation"; // For App Router
import { useState, useEffect, FormEvent } from "react";

// Define client-side enum (matches Prisma's RoleName)
enum ClientRoleName {
  DATA_PROVIDER = "DATA_PROVIDER",
  DATA_ANALYST = "DATA_ANALYST",
  CODE_PROVIDER = "CODE_PROVIDER",
}

// Define available roles with user-friendly labels
const availableRoles: { id: ClientRoleName; label: string; description: string }[] = [
  { id: ClientRoleName.DATA_PROVIDER, label: 'Data Provider', description: "I want to create and contribute data to pools." },
  { id: ClientRoleName.DATA_ANALYST, label: 'Data Analyst', description: "I want to analyze data and run computations on pools." },
  { id: ClientRoleName.CODE_PROVIDER, label: 'Code Provider', description: "I want to supply code for computations (DRTs)." },
];

// Helper to render the main page layout consistently
const PageLayout = ({ children }: { children: React.ReactNode }) => {
  const currentYear = new Date().getFullYear();
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-grow flex items-center justify-center bg-gray-50 py-12"> {/* Added py-12 for spacing */}
        <div className="w-full max-w-md">
          <div className="bg-white py-8 px-6 shadow-lg rounded-lg"> {/* Increased shadow */}
            {children}
          </div>
        </div>
      </div>
      <footer className="py-6 bg-gray-50">
        <div className="text-center text-sm text-gray-600">
          <div className="mb-2">
            Copyright © {currentYear}. <span className="font-semibold">Nautilus</span> All rights reserved.
          </div>
          <div>
            <a href="/privacy-policy" className="font-semibold hover:text-gray-900 transition-colors"> {/* Use actual links */}
              Privacy
            </a>
            <span className="mx-2 font-light">and</span>
            <a href="/terms-of-use" className="font-semibold hover:text-gray-900 transition-colors">
              Terms of Use
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};


export default function SignUpPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isSignedIn, isLoaded: isUserLoaded } = useUser();

  const [selectedClientRoles, setSelectedClientRoles] = useState<ClientRoleName[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [roleSuccessMessage, setRoleSuccessMessage] = useState<string | null>(null);

  const currentStep = searchParams.get('step');

  useEffect(() => {
    // If user is signed in AND they are not on the 'selectRoles' step,
    // it means they've completed the entire flow or are revisiting.
    // Redirect them to the dashboard.
    if (isUserLoaded && isSignedIn && currentStep !== 'selectRoles') {
      router.push('/'); //
    }
  }, [isUserLoaded, isSignedIn, currentStep, router]);


  const handleRoleChange = (roleName: ClientRoleName) => {
    setSelectedClientRoles(prev =>
      prev.includes(roleName)
        ? prev.filter(r => r !== roleName)
        : [...prev, roleName]
    );
    setRoleError(null);
  };

  const handleRoleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isSignedIn) {
      setRoleError("You must be signed in to select roles.");
      return;
    }
    if (selectedClientRoles.length === 0) {
      setRoleError("Please select at least one role to continue.");
      return;
    }

    setIsLoadingRoles(true);
    setRoleError(null);
    setRoleSuccessMessage(null);

    try {
      const response = await fetch('/api/user/assign-roles', { // Ensure this API route exists
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: selectedClientRoles }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to assign roles.');
      }
      setRoleSuccessMessage(data.message || 'Roles assigned successfully! Redirecting...');
      setTimeout(() => router.push('/'), 2000); // Adjust redirect path
    } catch (err: any) {
      setRoleError(err.message);
    } finally {
      setIsLoadingRoles(false);
    }
  };

  if (!isUserLoaded) {
    return <PageLayout><div>Loading...</div></PageLayout>;
  }

  // STEP 2: Role Selection UI (if user signed up & redirected here)
  if (isSignedIn && currentStep === 'selectRoles') {
    return (
      <PageLayout>
        <div className="mb-6 text-center">
            <div className="mb-4 flex justify-center">
                <div className="w-40 h-40 relative"> {/* Smaller logo */}
                <Image src="/logo.png" alt="Logo" fill className="object-contain" priority />
                </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">One Last Step!</h2>
            <p className="text-gray-600 text-sm mt-2">Tell us how you'll use Nautilus.</p>
        </div>
        
        <form onSubmit={handleRoleSubmit}>
          {availableRoles.map(role => (
            <div key={role.id} className="mb-3 p-3 border border-gray-200 rounded-md hover:bg-gray-50">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="mr-3 h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  checked={selectedClientRoles.includes(role.id)}
                  onChange={() => handleRoleChange(role.id)}
                />
                <div>
                  <span className="font-medium text-gray-800">{role.label}</span>
                  <p className="text-xs text-gray-500 mt-1">{role.description}</p>
                </div>
              </label>
            </div>
          ))}
          <button 
            type="submit" 
            disabled={isLoadingRoles || selectedClientRoles.length === 0}
            className="w-full mt-6 py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isLoadingRoles ? 'Saving...' : 'Complete Setup'}
          </button>
          {roleError && <p className="mt-3 text-sm text-red-600 text-center">{roleError}</p>}
          {roleSuccessMessage && <p className="mt-3 text-sm text-green-600 text-center">{roleSuccessMessage}</p>}
        </form>
      </PageLayout>
    );
  }

  // STEP 1: Clerk Sign Up UI (Default, or if not signed in)
  // Also handles cases where ?step=selectRoles but user is not signed in (they need to sign up first)
  if (!isSignedIn) {
    return (
      <PageLayout>
        <div className="mb-6 text-center">
          <div className="mb-4 flex justify-center">
            <div className="w-40 h-40 relative"> {/* Smaller logo for consistency */}
              <Image src="/logo.png" alt="Logo" fill className="object-contain" priority />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Create Account</h2>
        </div>

        <SignUp
          fallbackRedirectUrl="/sign-up?step=selectRoles" // Critical: redirect back here after Clerk sign-up
          appearance={{
            elements: {
              formButtonPrimary: "bg-blue-600 hover:bg-blue-700 text-sm normal-case",
              card: "shadow-none border-none", // Remove Clerk's card shadow if PageLayout provides it
              headerTitle: "hidden",
              headerSubtitle: "hidden",
              socialButtonsBlockButton: "text-gray-600 hover:bg-gray-100 border border-gray-300",
              footerActionLink: "text-blue-600 hover:text-blue-700 font-semibold"
            }
          }}
        />

        <div className="mt-6 text-center text-sm">
          <span className="text-gray-600">Already have an account? </span>
          <a href="/sign-in" className="text-blue-600 hover:text-blue-700 font-semibold">
            Sign In
          </a>
        </div>
      </PageLayout>
    );
  }
  
  // Fallback / Loading state if none of the above conditions are met (e.g. user is loaded, signed in, but no step query param)
  // The useEffect above should handle redirecting to / in this case.
  return <PageLayout><div>Loading your experience...</div></PageLayout>;
}