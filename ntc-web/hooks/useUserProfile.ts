// hooks/useUserProfile.ts
"use client";

import { useEffect } from "react";
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
    // signal “not found” without spamming the console
    const err = new Error("Not Found");
    (err as any).status = 404;
    throw err;
  }

  if (!res.ok) {
    // all other errors get logged
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
  const { isSignedIn, isLoaded: isAuthLoaded, user } = useUser();
  const shouldFetch = isAuthLoaded && isSignedIn;

  const { data, error, isLoading, mutate } = useSWR<UserProfileWithRoles>(
    shouldFetch ? "/api/user/me" : null,
    fetcher,
    {
      shouldRetryOnError: false,
      revalidateOnFocus: true,
    }
  );

  // If we got a 404, create the profile and then re-fetch
  useEffect(() => {
    if (
      shouldFetch &&
      error &&
      (error as any).status === 404 &&
      user?.id
    ) {
      (async () => {
        try {
          await fetch("/api/user/me", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clerkId: user.id }),
          });
        } catch (e) {
          console.error("Failed to create user profile:", e);
        }
        // trigger SWR to re-fetch the now-existing profile
        mutate();
      })();
    }
  }, [error, shouldFetch, user, mutate]);

  return {
    userProfile: data,
    roles: data?.roles ?? [],
    isLoadingProfile: !isAuthLoaded || (isSignedIn && isLoading),
    isErrorProfile: error,
    mutateUserProfile: mutate,
  };
}
