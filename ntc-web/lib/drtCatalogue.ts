/**
 * Nautilus Trusted Compute
 * Copyright (C) 2026 Relational Network
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

// lib/drtCatalogue.ts
//
// Maps catalogue entries (prisma DigitalRightToken ids) to the on-chain DRT
// type string.
//
// The prefixes are NOT cosmetic. The deployed Anchor program derives a
// redemption's execution_type by prefix match:
//
//   "append"        -> "append"
//   "w_compute_*"   -> "wasm"
//   "py_compute_*"  -> "python"
//   anything else   -> "unknown"
//
// and the enclave rejects an assertion whose execution_type does not match the
// endpoint. A DRT registered under any other name is burnable but can never be
// redeemed, so these strings cannot be shortened to save transaction bytes.

export type DrtRuntime = "append" | "python" | "wasm";

export interface CatalogueEntry {
  /** prisma DigitalRightToken id */
  id: string;
  /** on-chain drt_type */
  chainType: string;
  runtime: DrtRuntime;
}

export const DRT_CATALOGUE: readonly CatalogueEntry[] = [
  { id: "APPEND_DATA_POOL", chainType: "append", runtime: "append" },
  { id: "EXECUTE_MEAN_PYTHON", chainType: "py_compute_mean", runtime: "python" },
  { id: "EXECUTE_MEDIAN_PYTHON", chainType: "py_compute_median", runtime: "python" },
  { id: "EXECUTE_SD_PYTHON", chainType: "py_compute_sd", runtime: "python" },
  { id: "EXECUTE_MEAN_WASM", chainType: "w_compute_mean", runtime: "wasm" },
  { id: "EXECUTE_MEDIAN_WASM", chainType: "w_compute_median", runtime: "wasm" },
  { id: "EXECUTE_SD_WASM", chainType: "w_compute_sd", runtime: "wasm" },
] as const;

const BY_ID = new Map(DRT_CATALOGUE.map((entry) => [entry.id, entry]));

export function catalogueEntry(id: string): CatalogueEntry | undefined {
  return BY_ID.get(id);
}

/** True for entries a pool creator may select. */
export function isSelectable(id: string): boolean {
  return BY_ID.has(id);
}

/**
 * On-chain drt_type for a catalogue entry.
 *
 * Throws rather than guessing: a wrong drt_type produces an execution_type of
 * "unknown" on-chain, which the enclave refuses only *after* the DRT has been
 * burned.
 */
export function chainTypeFor(id: string): string {
  const entry = BY_ID.get(id);
  if (!entry) {
    throw new Error(
      `DRT "${id}" is not in the catalogue, so its on-chain type is unknown. ` +
        `Add it to lib/drtCatalogue.ts before offering it for selection.`
    );
  }
  return entry.chainType;
}

export function runtimeFor(id: string): DrtRuntime | undefined {
  return BY_ID.get(id)?.runtime;
}
