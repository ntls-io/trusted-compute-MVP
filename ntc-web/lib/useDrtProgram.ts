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

// lib/useDrtProgram.ts
"use client";

import * as anchor from "@coral-xyz/anchor";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useMemo } from "react";

// Import your program’s IDL JSON.
import idl from "./idl/drt_manager.json";

// (Optional) If you want to log the program address from the IDL:
console.log("Program address:", idl.address);

export function useDrtProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();

  // Custom wallet wrapper to match Anchor's Wallet type
  const anchorWallet = useMemo(() => {
    if (
      !wallet ||
      !wallet.connected ||
      !wallet.publicKey ||
      !wallet.signTransaction ||
      !wallet.signAllTransactions
    )
      return null;

    return {
      publicKey: wallet.publicKey,
      signTransaction: wallet.signTransaction,
      signAllTransactions: wallet.signAllTransactions,
    } as anchor.Wallet;
  }, [wallet]);

  // Build the provider when the wallet is ready
  const provider = useMemo(() => {
    if (!anchorWallet) return null;
    return new anchor.AnchorProvider(connection, anchorWallet, {
      commitment: "processed",
    });
  }, [connection, anchorWallet]);

  const program = useMemo(() => {
    if (!provider) return null;
    // Notice that we no longer pass a separate programId argument.
    return new anchor.Program(idl as anchor.Idl, provider);
  }, [provider]);

  return program;
}

