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

// lib/poolBudget.ts
//
// How many DRTs fit on one pool.
//
// `createPoolWithDrts` carries every DRT's type, URL and code hash in a single
// Solana instruction, and a transaction is capped at 1232 bytes. Splitting the
// mint setup into follow-on transactions does not help: the configs all travel
// together in the instruction that creates the pool.
//
// The budget is shared between the DRT set and the pool name, which is entered
// on a later step, so neither can be validated in isolation. Measured with the
// current catalogue:
//
//   pool name    append+1   append+2   append+3   append+4
//   4 chars           803       1007       1207      1418 (over)
//   26 chars          825       1029       1229      1440 (over)
//   31 chars          830       1034       1234 (over)
//
// A fixed "you may pick three" rule would therefore be wrong. This models the
// real cost so the UI can enforce it; `tests/poolBudget.test.ts` checks the
// model against an actually serialized transaction, so it cannot drift.

import { MAX_TRANSACTION_LEN } from "@/lib/redemption";

/**
 * Bytes consumed by everything outside the createPoolWithDrts instruction
 * data: signature, message header, account keys, blockhash, both instructions'
 * framing, and the commitment memo (which is a fixed 69-byte string).
 *
 * Pinned by test against a real serialized transaction rather than derived by
 * hand; see tests/poolBudget.test.ts.
 */
export const POOL_TX_FIXED_BYTES = 537;

/** Shortest pool name worth reserving room for. */
export const MIN_POOL_NAME_LENGTH = 3;

/** Borsh: 4-byte length prefix on a string, and on the config vector. */
const STRING_PREFIX = 4;
/** Anchor instruction discriminator. */
const DISCRIMINATOR = 8;
/** ownership_supply: u64 */
const OWNERSHIP_SUPPLY = 8;

export interface DrtConfigShape {
  drtType: string;
  githubUrl?: string | null;
  codeHash?: string | null;
}

/**
 * Borsh size of one DrtInitConfig: drt_type string, supply, cost, and the two
 * optional strings (1 tag byte each, plus a length-prefixed body when present).
 */
export function drtConfigBytes(config: DrtConfigShape): number {
  const optional = (value?: string | null) =>
    value ? 1 + STRING_PREFIX + value.length : 1;
  return (
    STRING_PREFIX +
    config.drtType.length +
    8 + // supply
    8 + // cost
    optional(config.githubUrl) +
    optional(config.codeHash)
  );
}

/** compact-u16, as Solana length-prefixes instruction data. */
function shortvecLen(value: number): number {
  if (value < 0x80) return 1;
  if (value < 0x4000) return 2;
  return 3;
}

/** Serialized size of the pool creation transaction. */
export function poolCreationBytes(
  configs: DrtConfigShape[],
  poolNameLength: number
): number {
  const instructionData =
    DISCRIMINATOR +
    STRING_PREFIX +
    poolNameLength +
    STRING_PREFIX + // config vector length
    configs.reduce((total, config) => total + drtConfigBytes(config), 0) +
    OWNERSHIP_SUPPLY;
  return POOL_TX_FIXED_BYTES + shortvecLen(instructionData) + instructionData;
}

export interface PoolBudget {
  /** Bytes used by the current selection, reserving nothing for the name. */
  used: number;
  limit: number;
  /** Characters still available for the pool name. Negative means over. */
  poolNameBudget: number;
  /** Whether the selection leaves room for a usable pool name. */
  fits: boolean;
}

export function poolBudget(configs: DrtConfigShape[]): PoolBudget {
  const used = poolCreationBytes(configs, 0);
  const poolNameBudget = MAX_TRANSACTION_LEN - used;
  return {
    used,
    limit: MAX_TRANSACTION_LEN,
    poolNameBudget,
    fits: poolNameBudget >= MIN_POOL_NAME_LENGTH,
  };
}

/** Longest pool name that still fits alongside this selection. */
export function maxPoolNameLength(configs: DrtConfigShape[]): number {
  return Math.max(0, MAX_TRANSACTION_LEN - poolCreationBytes(configs, 0));
}

/**
 * Whether adding `candidate` to `selected` would still leave room for a pool
 * name. Used to disable a checkbox before the user commits to a selection they
 * would only discover was too large at the final step.
 */
export function canAdd(
  selected: DrtConfigShape[],
  candidate: DrtConfigShape
): boolean {
  return poolBudget([...selected, candidate]).fits;
}
