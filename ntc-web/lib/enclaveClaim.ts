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

// lib/enclaveClaim.ts
//
// Canonical chain-claim encoding shared with the oracle
// (devops-acr/oracle/canonical.py) and the enclave
// (sgx-mvp/oracle-verify/src/canonical.rs). A claim is a flat object of
// string values serialized as JCS restricted to that subset: keys sorted
// lexicographically, minimal separators, standard JSON escaping. The wallet
// signs `relational-chain-claim:v1\n` + canonical JSON. Any change here must
// keep the shared cross-language test vector passing in all three suites.

import bs58 from "bs58";

export const CLAIM_DOMAIN_PREFIX = "relational-chain-claim:v1\n";
export const MAX_GITHUB_URL_LENGTH = 200;

export type ClaimAction =
  | "pool_initialize"
  | "append"
  | "execute_wasm"
  | "execute_python";

export type ChainClaim = Record<string, string>;

// Imported from lib/config.ts and re-exported so existing importers keep
// working. The values are no longer environment-configurable: the claim's
// `program` and `cluster` must match both the transaction Anchor sent and the
// values measured into the enclave's MRENCLAVE, and an env var could silently
// break that agreement.
import { SOLANA_CLUSTER, DRT_PROGRAM_ID } from "@/lib/config";
export { SOLANA_CLUSTER, DRT_PROGRAM_ID };

const CLAIM_TTL_SECONDS = 600;

/** Canonical JSON: sorted keys, minimal separators (JSON.stringify escapes
 * strings exactly like the Python/Rust implementations for this subset). */
export function canonicalClaimJson(claim: ChainClaim): string {
  const keys = Object.keys(claim).sort();
  const parts = keys.map(
    (key) => `${JSON.stringify(key)}:${JSON.stringify(claim[key])}`
  );
  return `{${parts.join(",")}}`;
}

/** The exact bytes the wallet signs. */
export function claimMessageBytes(claim: ChainClaim): Uint8Array {
  return new TextEncoder().encode(
    CLAIM_DOMAIN_PREFIX + canonicalClaimJson(claim)
  );
}

async function sha256HexBytes(data: Uint8Array): Promise<string> {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.subtle) {
    throw new Error("WebCrypto unavailable; cannot hash claim payload");
  }
  // Copy into a fresh ArrayBuffer so TS accepts it regardless of the
  // underlying buffer type (SharedArrayBuffer etc.).
  const buffer = new Uint8Array(data).buffer;
  const digest = await cryptoObj.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256 of the exact payload string bytes (what the enclave re-hashes). */
export function payloadSha256Hex(payload: string): Promise<string> {
  return sha256HexBytes(new TextEncoder().encode(payload));
}

/** SHA-256 of the canonical signed message: the oracle's claim digest. */
export function claimDigestHex(claim: ChainClaim): Promise<string> {
  return sha256HexBytes(claimMessageBytes(claim));
}

export function randomNonceHex(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface BuildClaimParams {
  action: ClaimAction;
  tx: string;
  pool: string;
  claimant: string;
  /** Exact payload string ("" for execute actions). */
  payload: string;
  githubUrl?: string;
  codeHash?: string;
  cluster?: string;
  program?: string;
  nonce?: string;
  expiry?: string;
}

export async function buildClaim(params: BuildClaimParams): Promise<ChainClaim> {
  const isCompute =
    params.action === "execute_wasm" || params.action === "execute_python";
  if (isCompute) {
    if (!params.githubUrl || !params.codeHash) {
      throw new Error(
        "Compute claims require the on-chain GitHub URL and code hash"
      );
    }
    if (
      !params.githubUrl.startsWith("https://github.com/") ||
      params.githubUrl.length > MAX_GITHUB_URL_LENGTH
    ) {
      throw new Error("On-chain GitHub URL is malformed");
    }
    if (!/^[0-9a-f]{64}$/.test(params.codeHash)) {
      throw new Error("On-chain code hash must be 64 lowercase hex chars");
    }
    if (params.payload !== "") {
      throw new Error("Compute claims carry no payload");
    }
  }
  const claim: ChainClaim = {
    version: "1",
    action: params.action,
    cluster: params.cluster || SOLANA_CLUSTER,
    program: params.program || DRT_PROGRAM_ID,
    tx: params.tx,
    pool: params.pool,
    claimant: params.claimant,
    payload_sha256: await payloadSha256Hex(params.payload),
    nonce: params.nonce || randomNonceHex(),
    expiry:
      params.expiry ||
      String(Math.floor(Date.now() / 1000) + CLAIM_TTL_SECONDS),
  };
  if (isCompute) {
    claim.github_url = params.githubUrl!;
    claim.code_hash = params.codeHash!;
  }
  return claim;
}

export interface MessageSigner {
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
}

/** True when the connected wallet can produce the required claim signature. */
export function walletSupportsSignMessage(wallet: MessageSigner): boolean {
  return typeof wallet.signMessage === "function";
}

/** Ask the wallet for the claim signature (base58, as the enclave expects). */
export async function signClaim(
  wallet: MessageSigner,
  claim: ChainClaim
): Promise<string> {
  if (!walletSupportsSignMessage(wallet)) {
    throw new Error(
      "Connected wallet does not support message signing (signMessage); " +
        "it cannot authorize enclave operations"
    );
  }
  const signature = await wallet.signMessage!(claimMessageBytes(claim));
  return bs58.encode(signature);
}
