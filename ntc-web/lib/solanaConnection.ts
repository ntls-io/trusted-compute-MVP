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

// lib/solanaConnection.ts
import { Connection, clusterApiUrl } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import { create } from 'zustand';

// Connection configuration
export const SOLANA_NETWORK = "devnet";
export const SOLANA_ENDPOINT = clusterApiUrl(SOLANA_NETWORK);

// Create a single connection instance
export const connection = new Connection(SOLANA_ENDPOINT, "processed");

// Custom hook for using the connection consistently
export function useSolanaConnection() {
  const { connection } = useConnection();
  return connection;
}

// Define state shape
type State = {
  isConnecting: boolean;
  lastError: string | null;
}

// Define actions
type Actions = {
  setConnecting: (isConnecting: boolean) => void;
  setError: (error: string | null) => void;
}

// Combine state and actions
type ConnectionState = State & Actions;

// Create store with explicit type annotations
export const useConnectionStore = create<ConnectionState>((set: (
  fn: (state: ConnectionState) => ConnectionState
) => void) => ({
  isConnecting: false,
  lastError: null,
  setConnecting: (isConnecting: boolean) => 
    set((state) => ({ ...state, isConnecting })),
  setError: (error: string | null) => 
    set((state) => ({ ...state, lastError: error }))
}));