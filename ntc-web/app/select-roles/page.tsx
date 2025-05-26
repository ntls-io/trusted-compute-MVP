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

// app/select-roles/page.tsx
'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useUser, SignedIn, SignedOut, SignInButton } from '@clerk/nextjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSWRConfig } from 'swr';

// Matches Prisma's RoleName enum values. Used for selection state.
enum ClientRoleName {
    DATA_PROVIDER = "DATA_PROVIDER",
    DATA_ANALYST = "DATA_ANALYST",
    CODE_PROVIDER = "CODE_PROVIDER",
}

// Interface for a role object fetched from /api/roles
interface FetchedRole {
    id: number;
    name: ClientRoleName;
    description: string;
}

// Interface for the expected user profile data from /api/user/me
interface UserProfileWithRoles {
    id: string;
    clerkId: string;
    walletAddress?: string | null;
    roles: ClientRoleName[];
}

// Helper to get a user-friendly label from RoleName
function getRoleLabel(roleName: ClientRoleName): string {
    switch (roleName) {
        case ClientRoleName.DATA_PROVIDER: return "Data Provider";
        case ClientRoleName.DATA_ANALYST: return "Data Analyst";
        case ClientRoleName.CODE_PROVIDER: return "Code Provider";
        default:
            const words = (roleName as string).toLowerCase().split('_');
            return words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }
}

export default function SelectRolesPage() {
    const { user, isSignedIn, isLoaded: isAuthLoaded } = useUser();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { mutate } = useSWRConfig();

    const [allAvailableRoles, setAllAvailableRoles] = useState<FetchedRole[]>([]);
    const [selectedClientRoles, setSelectedClientRoles] = useState<ClientRoleName[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isFetchingPageData, setIsFetchingPageData] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    useEffect(() => {
        async function loadPageData() {
            setIsFetchingPageData(true);
            setError(null);
            try {
                const rolesResponse = await fetch('/api/roles');
                if (!rolesResponse.ok) throw new Error('Failed to fetch available roles.');
                const fetchedRolesData: FetchedRole[] = await rolesResponse.json();
                setAllAvailableRoles(fetchedRolesData);

                if (isSignedIn && user) {
                    const userProfileResponse = await fetch('/api/user/me');
                    if (!userProfileResponse.ok) {
                        if (userProfileResponse.status === 404) {
                            console.warn("User profile (for roles) not found via /api/user/me for role pre-selection.");
                        } else {
                            console.error(`Failed to fetch current roles (status: ${userProfileResponse.status})`);
                        }
                    } else {
                        const userData: UserProfileWithRoles = await userProfileResponse.json();
                        if (userData.roles && Array.isArray(userData.roles)) {
                            setSelectedClientRoles(userData.roles);
                        }
                    }
                }
            } catch (fetchError: any) {
                console.error("Error loading page data for /select-roles:", fetchError);
                setError(fetchError.message || "Could not load page data.");
            } finally {
                setIsFetchingPageData(false);
            }
        }
        if (isAuthLoaded) {
            loadPageData();
        }
    }, [isAuthLoaded, isSignedIn, user]);

    const handleRoleChange = (roleName: ClientRoleName) => {
        setSelectedClientRoles(prev => prev.includes(roleName) ? prev.filter(r => r !== roleName) : [...prev, roleName]);
        setError(null); // Clear error when user makes a change
        setSuccessMessage(null);
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (!isSignedIn) {
            setError("You must be signed in to update roles.");
            return;
        }

        // --- MODIFIED: Enforce at least one role selection ---
        if (selectedClientRoles.length === 0) {
            setError("Please select at least one role to continue.");
            return;
        }
        // --- End of modification ---

        setIsSubmitting(true);
        setError(null);
        setSuccessMessage(null);
        try {
            const response = await fetch('/api/user/assign-roles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roles: selectedClientRoles }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'An unknown error occurred.');
            setSuccessMessage(data.message || 'Roles updated successfully! Redirecting...');
            await mutate('/api/user/me');

            const nextUrl = searchParams.get('next') || '/';
            setTimeout(() => router.push(nextUrl), 2000);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isAuthLoaded || isFetchingPageData) {
        return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', background: '#f7fafc' }}>Loading information...</div>;
    }

    // --- MODIFIED: Condition for disabling the submit button ---
    const isSubmitDisabled = isSubmitting || selectedClientRoles.length === 0;

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', background: '#f7fafc' }}>
            <SignedIn>
                <div style={{ background: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxWidth: '550px', width: '100%' }}>
                     <h1 style={{ fontSize: '22px', fontWeight: '600', textAlign: 'center', marginBottom: '8px', color: '#1a202c' }}>
                        {user?.firstName ? `Manage Roles for ${user.firstName}` : 'Manage Your Roles'}
                    </h1>
                    <p style={{ textAlign: 'center', marginBottom: '25px', color: '#4a5568', fontSize: '15px' }}>
                        Select or update your roles to best describe how you'll interact with Nautilus. You must select at least one.
                    </p>
                    <form onSubmit={handleSubmit}>
                        {allAvailableRoles.length === 0 && !isFetchingPageData && <p className="text-center text-gray-500">No roles are currently available to select.</p>}
                        {allAvailableRoles.map(role => (
                            <div 
                                key={role.name} 
                                style={{ 
                                    marginBottom: '12px', 
                                    padding: '12px 15px', 
                                    border: '1px solid #e2e8f0', 
                                    borderRadius: '6px', 
                                    background: selectedClientRoles.includes(role.name) ? 'rgba(49, 130, 206, 0.05)' : 'transparent',
                                    transition: 'background-color 0.2s ease'
                                }}
                                className="hover:bg-gray-50"
                            >
                                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        style={{ marginRight: '12px', height: '18px', width: '18px', accentColor: '#3182ce' }}
                                        checked={selectedClientRoles.includes(role.name)}
                                        onChange={() => handleRoleChange(role.name)}
                                        disabled={isSubmitting}
                                        className="form-checkbox"
                                    />
                                    <div>
                                        <span style={{ fontWeight: '500', color: '#2d3748' }}>{getRoleLabel(role.name)}</span>
                                        <p style={{ fontSize: '13px', color: '#718096', margin: '3px 0 0 0' }}>{role.description}</p>
                                    </div>
                                </label>
                            </div>
                        ))}
                        {/* MODIFIED: Button disabled state and background */}
                        <button 
                            type="submit" 
                            disabled={isSubmitDisabled} 
                            style={{ 
                                width: '100%', 
                                padding: '10px 15px', 
                                marginTop: '25px', 
                                background: isSubmitDisabled ? '#cbd5e0' : '#3182ce', // gray-400 if disabled, else blue-600
                                color: 'white', 
                                border: 'none', 
                                borderRadius: '6px', 
                                cursor: isSubmitDisabled ? 'not-allowed' : 'pointer', 
                                fontSize: '16px', 
                                fontWeight: '500', 
                                transition: 'background-color 0.2s ease' 
                            }} 
                            className="hover:bg-blue-700 disabled:hover:bg-gray-400" 
                        >
                            {isSubmitting ? 'Saving...' : 'Save and Continue'}
                        </button>
                        {error && <p style={{ color: '#e53e3e', marginTop: '15px', textAlign: 'center', fontSize: '14px' }}>Error: {error}</p>}
                        {successMessage && <p style={{ color: '#38a169', marginTop: '15px', textAlign: 'center', fontSize: '14px' }}>{successMessage}</p>}
                    </form>
                </div>
            </SignedIn>
            <SignedOut>
                 <div style={{ textAlign: 'center', background: 'white', padding: '40px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    <p style={{ marginBottom: '20px' }}>Please sign in to select or manage your roles.</p>
                    <SignInButton mode="modal">
                        <button style={{ padding: '10px 20px', background: '#3182ce', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Sign In</button>
                    </SignInButton>
                </div>
            </SignedOut>
        </div>
    );
}