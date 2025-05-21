// hooks/useUserProfile.ts
"use client";

import useSWR from 'swr';
import { useUser } from '@clerk/nextjs';

// Ensure this enum matches your Prisma RoleName and client-side usage
export enum ClientRoleName {
    DATA_PROVIDER = "DATA_PROVIDER",
    DATA_ANALYST = "DATA_ANALYST",
    CODE_PROVIDER = "CODE_PROVIDER",
}

export interface UserProfileWithRoles {
    id: string;
    clerkId: string;
    walletAddress?: string | null;
    // Add any other fields your /api/user/me endpoint returns for the user
    roles: ClientRoleName[]; // Array of role name strings
}

const fetcher = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) {
        const error = new Error('An error occurred while fetching user profile.');
        try {
            const info = await res.json();
            (error as any).info = info;
        } catch (e) {
            (error as any).info = { message: await res.text() };
        }
        (error as any).status = res.status;
        console.error("Fetcher error details:", (error as any).info);
        throw error;
    }
    return res.json();
};

export function useUserProfile() {
    const { isSignedIn, isLoaded: isAuthLoaded } = useUser();

    // The SWR key is '/api/user/me'. It will only fetch if isSignedIn is true.
    // If isSignedIn is false, data will be undefined.
    const { data, error, isLoading, mutate } = useSWR<UserProfileWithRoles>(
        isAuthLoaded && isSignedIn ? '/api/user/me' : null,
        fetcher,
        {
            shouldRetryOnError: false, // Don't retry on 401, 404 etc.
            revalidateOnFocus: true,   // Revalidate when window gains focus
        }
    );

    return {
        userProfile: data,
        roles: data?.roles || [], // Default to empty array
        isLoadingProfile: !isAuthLoaded || (isSignedIn && isLoading), // Loading if auth not loaded OR (signed in AND SWR is loading)
        isErrorProfile: error,
        mutateUserProfile: mutate, // Function to manually trigger revalidation
    };
}