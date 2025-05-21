// app/select-roles/page.tsx
'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useUser, SignedIn, SignedOut, SignInButton } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';

// Matches Prisma's RoleName enum values. Used for selection state.
enum ClientRoleName {
    DATA_PROVIDER = "DATA_PROVIDER",
    DATA_ANALYST = "DATA_ANALYST",
    CODE_PROVIDER = "CODE_PROVIDER",
}

// Interface for a role object fetched from /api/roles
interface FetchedRole {
    id: number; // The integer ID from the database Role table
    name: ClientRoleName; // The RoleName string value
    description: string;
    // Add 'label' if your API provides it, or derive it if needed.
    // For now, we'll derive label from 'name' or use a mapping.
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
        default: return roleName; // Fallback to the raw name
    }
}


export default function SelectRolesPage() {
    const { user, isSignedIn, isLoaded: isAuthLoaded } = useUser();
    const router = useRouter();

    const [allAvailableRoles, setAllAvailableRoles] = useState<FetchedRole[]>([]); // Stores roles from DB
    const [selectedClientRoles, setSelectedClientRoles] = useState<ClientRoleName[]>([]);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isFetchingPageData, setIsFetchingPageData] = useState(true); // Combined loading state

    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    useEffect(() => {
        async function loadPageData() {
            if (isAuthLoaded && isSignedIn && user) {
                setError(null);
                setIsFetchingPageData(true);
                try {
                    // Fetch all available roles (name, description)
                    const rolesResponse = await fetch('/api/roles');
                    if (!rolesResponse.ok) throw new Error('Failed to fetch available roles.');
                    const fetchedRoles: FetchedRole[] = await rolesResponse.json();
                    setAllAvailableRoles(fetchedRoles);

                    // Fetch user's currently selected roles
                    const userProfileResponse = await fetch('/api/user/me');
                    if (!userProfileResponse.ok) {
                        if (userProfileResponse.status === 404) {
                            console.warn("User profile not found via /api/user/me. New user or check-user issue.");
                            // No roles selected yet for a new user, this is fine.
                        } else {
                            throw new Error(`Failed to fetch current roles (status: ${userProfileResponse.status})`);
                        }
                    } else {
                        const userData: UserProfileWithRoles = await userProfileResponse.json();
                        if (userData.roles && Array.isArray(userData.roles)) {
                            setSelectedClientRoles(userData.roles);
                        }
                    }
                } catch (fetchError: any) {
                    console.error("Error loading page data:", fetchError);
                    setError(fetchError.message || "Could not load necessary data. Please try again.");
                } finally {
                    setIsFetchingPageData(false);
                }
            } else if (isAuthLoaded && !isSignedIn) {
                setIsFetchingPageData(false); // Not signed in, no data to fetch for user
                // Fetch available roles even if not signed in if the page should show them
                try {
                     setIsFetchingPageData(true);
                     const rolesResponse = await fetch('/api/roles');
                     if (!rolesResponse.ok) throw new Error('Failed to fetch available roles.');
                     const fetchedRoles: FetchedRole[] = await rolesResponse.json();
                     setAllAvailableRoles(fetchedRoles);
                } catch (fetchError: any) {
                    console.error("Error fetching available roles (signed out):", fetchError);
                    // Potentially show a limited view or error for fetching role list
                } finally {
                    setIsFetchingPageData(false);
                }
            }
        }
        loadPageData();
    }, [isAuthLoaded, isSignedIn, user]);

    const handleRoleChange = (roleName: ClientRoleName) => {
        setSelectedClientRoles(prev =>
            prev.includes(roleName)
                ? prev.filter(r => r !== roleName)
                : [...prev, roleName]
        );
        setError(null);
        setSuccessMessage(null);
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (!isSignedIn) {
            setError("You must be signed in to update roles.");
            return;
        }
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
            setTimeout(() => router.push('/'), 2000);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isFetchingPageData) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', background: '#f7fafc' }}>
                Loading information...
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', background: '#f7fafc' }}>
            <SignedIn>
                <div style={{ background: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxWidth: '550px', width: '100%' }}>
                    <h1 style={{ fontSize: '22px', fontWeight: '600', textAlign: 'center', marginBottom: '8px', color: '#1a202c' }}>
                        {user?.firstName ? `Manage Roles for ${user.firstName}` : 'Manage Your Roles'}
                    </h1>
                    <p style={{ textAlign: 'center', marginBottom: '25px', color: '#4a5568', fontSize: '15px' }}>
                        Select or update your roles to best describe how you'll interact with Nautilus.
                    </p>
                    <form onSubmit={handleSubmit}>
                        {allAvailableRoles.length === 0 && !isFetchingPageData && <p>No roles available to select at this moment.</p>}
                        {allAvailableRoles.map(role => (
                            <div 
                                key={role.name} // Use role.name (ClientRoleName) as it's unique and used for selection
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
                                        {/* Display description fetched from DB */}
                                        <p style={{ fontSize: '13px', color: '#718096', margin: '3px 0 0 0' }}>{role.description}</p>
                                    </div>
                                </label>
                            </div>
                        ))}
                        <button type="submit" disabled={isSubmitting} style={{ width: '100%', padding: '10px 15px', marginTop: '25px', background: isSubmitting ? '#cbd5e0' : '#3182ce', color: 'white', border: 'none', borderRadius: '6px', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontSize: '16px', fontWeight: '500', transition: 'background-color 0.2s ease' }} className="hover:bg-blue-700 disabled:hover:bg-gray-400" >
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