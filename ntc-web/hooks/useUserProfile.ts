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

// hooks/useUserProfile.ts
"use client";

import useSWR from "swr";
import { useUser } from "@clerk/nextjs";

export enum ClientRoleName {
  DATA_PROVIDER = "DATA_PROVIDER",
  DATA_ANALYST = "DATA_ANALYST",
  CODE_PROVIDER = "CODE_PROVIDER",
}

export interface UserProfileWithRoles {
  id: string;
  clerkId: string;
  walletAddress?: string | null;
  roles: ClientRoleName[];
}

const fetcher = async (url: string) => {
  const res = await fetch(url);

  if (res.status === 404) {
    const err = new Error("Not Found");
    (err as any).status = 404;
    throw err;
  }

  if (!res.ok) {
    const err = new Error(`Error ${res.status} fetching ${url}`);
    (err as any).status = res.status;
    try {
      const body = await res.json();
      (err as any).info = body;
      console.error("Fetcher error:", body);
    } catch {
      const text = await res.text();
      console.error("Fetcher error:", text);
    }
    throw err;
  }

  return res.json();
};


export function useUserProfile() {
  const { isSignedIn, isLoaded: isAuthLoaded } = useUser();
  const shouldFetch = isAuthLoaded && isSignedIn;

  const { data, error, isLoading, mutate } = useSWR<UserProfileWithRoles>(
    shouldFetch ? "/api/user/me" : null,
    fetcher,
    {
      shouldRetryOnError: false, // Keep this false to handle the 404 state correctly
      revalidateOnFocus: true,
    }
  );

  return {
    userProfile: data,
    roles: data?.roles ?? [],
    isLoadingProfile: !isAuthLoaded || (isSignedIn && isLoading),
    isErrorProfile: error,
    mutateUserProfile: mutate,
  };
}