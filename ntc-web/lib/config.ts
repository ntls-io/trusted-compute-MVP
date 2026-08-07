// Nautilus Trusted Compute
// Copyright (C) 2026 Relational Network
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

// lib/config.ts
//
// Single source of truth for chain configuration.
//
// This previously lived in four places that could disagree: a hardcoded
// cluster in app/layout.tsx, another in lib/solanaConnection.ts, another in
// lib/drtHelpers.ts, and env-var reads in lib/enclaveClaim.ts. The program ID
// had three sources — the committed IDL, an env var, and the oracle's own
// setting.
//
// That divergence was not cosmetic. The signed chain claim carries `program`
// and `cluster` fields, and the enclave rejects any claim whose values do not
// match what was measured into its MRENCLAVE. Setting NEXT_PUBLIC_DRT_PROGRAM_ID
// alone would desync the claim from the transaction Anchor actually sent
// against the IDL address, producing an authorisation failure with no obvious
// cause. Both env vars are therefore gone.

import { clusterApiUrl } from "@solana/web3.js";
import idl from "@/lib/idl/drt_manager.json";

/**
 * The deployed Anchor program, read from the committed IDL.
 *
 * The IDL is what `lib/useDrtProgram.ts` builds its Program instance from, so
 * taking the ID from anywhere else risks signing a claim for one program while
 * transacting against another. To point at a different deployment, change the
 * IDL — not an environment variable.
 */
export const DRT_PROGRAM_ID: string = (idl as { address: string }).address;

/** Solana cluster. Must match EXPECTED_CLUSTER measured into the enclave. */
export const SOLANA_CLUSTER = "devnet" as const;

/** RPC endpoint used by the wallet adapter, helpers and direct connections. */
export const SOLANA_ENDPOINT = clusterApiUrl(SOLANA_CLUSTER);

/**
 * Query string for Solana Explorer links, e.g.
 *   `https://explorer.solana.com/tx/${sig}${EXPLORER_CLUSTER_QUERY}`
 * Kept here so explorer links cannot drift from the cluster actually in use.
 */
export const EXPLORER_CLUSTER_QUERY = `?cluster=${SOLANA_CLUSTER}`;

/**
 * Base URL of the devops-acr service (VM deployment API + attestation).
 *
 * Deployment identity rather than a protocol constant, so it stays an
 * environment variable and is not committed. Required: pool creation and every
 * attestation preflight call it.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** Throws with an actionable message rather than fetching `undefined/...`. */
export function requireApiUrl(): string {
  if (!API_URL) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. Point it at the devops-acr service " +
        "(see .env.example); pool creation and attestation need it."
    );
  }
  return API_URL;
}
