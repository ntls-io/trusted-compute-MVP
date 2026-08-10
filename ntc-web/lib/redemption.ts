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

// lib/redemption.ts
//
// The redemption commitment: how a request proves it belongs to a burn
// transaction without a second wallet prompt.
//
// The redeemer commits to their ephemeral key, their payload, and (for
// compute) the program they intend to run, by hashing all three into an SPL
// Memo instruction carried in the same transaction that burns the DRT. The
// wallet's transaction signature therefore covers the commitment, and the
// enclave verifies that signature itself rather than trusting the oracle.
//
// Mirrored byte-for-byte by sgx-mvp/oracle-verify/src/canonical.rs; the
// vector in tests/redemption.test.ts is pinned in that suite and in
// devops-acr/tests/test_oracle.py too.

import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import bs58 from "bs58";

/** SPL Memo v2. */
export const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

export const MEMO_PREFIX = "rcc1:";

/** Domain separation for the ephemeral key's proof of possession. */
export const POSSESSION_PREFIX = "relational-possession:v1\n";

export const MAX_GITHUB_URL_LENGTH = 200;

/** Solana's packet limit; the enclave rejects anything larger. */
export const MAX_TRANSACTION_LEN = 1232;

export interface CodeReference {
  githubUrl: string;
  codeHash: string;
}

const encoder = new TextEncoder();

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Throws if the code reference is not something the enclave will accept, so
 * a DRT is never burned against metadata that would be refused afterwards.
 */
export function validateCodeReference(code: CodeReference): void {
  if (
    !code.githubUrl.startsWith("https://github.com/") ||
    code.githubUrl.length > MAX_GITHUB_URL_LENGTH
  ) {
    throw new Error(
      "On-chain GitHub URL is malformed or too long for an enclave request"
    );
  }
  if (!/^[0-9a-f]{64}$/.test(code.codeHash)) {
    throw new Error("On-chain code hash must be 64 lowercase hex chars");
  }
}

/**
 * Hash of the code identity a compute redemption commits to. Append and pool
 * initialization carry no code reference and commit to `sha256("")`.
 */
export function codeDigest(code: CodeReference | null): Uint8Array {
  if (!code) return sha256(new Uint8Array(0));
  return sha256(
    concat(
      encoder.encode(code.githubUrl),
      new Uint8Array([0]),
      encoder.encode(code.codeHash)
    )
  );
}

/** `sha256(ephemeral_pubkey ‖ sha256(payload) ‖ code_digest)`. */
export function commitment(
  ephemeralPubkey: Uint8Array,
  payload: string,
  code: CodeReference | null
): Uint8Array {
  return sha256(
    concat(ephemeralPubkey, sha256(encoder.encode(payload)), codeDigest(code))
  );
}

/** The exact memo string the transaction must carry. */
export function memoFor(
  ephemeralPubkey: Uint8Array,
  payload: string,
  code: CodeReference | null
): string {
  return MEMO_PREFIX + toHex(commitment(ephemeralPubkey, payload, code));
}

/** The memo instruction to append to the redemption transaction. */
export function memoInstruction(memo: string): TransactionInstruction {
  return new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(encoder.encode(memo)),
  });
}

export interface EphemeralKey {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
  publicKeyB58: string;
}

/**
 * A fresh key per operation, generated silently in the browser. Its hash goes
 * on-chain in the memo, so only the holder can present the redemption to the
 * enclave — without this, anyone watching devnet could collect the result of
 * a finalized redemption they did not pay for.
 */
export function generateEphemeralKey(): EphemeralKey {
  const secretKey = ed25519.utils.randomSecretKey();
  const publicKey = ed25519.getPublicKey(secretKey);
  return {
    secretKey,
    publicKey,
    publicKeyB58: bs58.encode(publicKey),
  };
}

/** Base58 signature over the transaction signature, proving key possession. */
export function provePossession(
  ephemeral: EphemeralKey,
  txSignature: Uint8Array
): string {
  const message = concat(encoder.encode(POSSESSION_PREFIX), txSignature);
  return bs58.encode(ed25519.sign(message, ephemeral.secretKey));
}

/** Request body accepted by the enclave's protected endpoints. */
export interface EnclaveRequest {
  signed_transaction: string;
  payload?: string;
  github_url?: string;
  code_hash?: string;
  ephemeral_pubkey: string;
  ephemeral_signature: string;
}

/**
 * Assemble the enclave request from a sent transaction. `payload` must be the
 * exact string that went into the commitment — the enclave re-hashes these
 * bytes and compares them to what the wallet signed.
 */
export function buildEnclaveRequest(params: {
  signedTransaction: Uint8Array;
  txSignature: Uint8Array;
  ephemeral: EphemeralKey;
  payload?: string;
  code?: CodeReference | null;
}): EnclaveRequest {
  const request: EnclaveRequest = {
    signed_transaction: toBase64(params.signedTransaction),
    ephemeral_pubkey: params.ephemeral.publicKeyB58,
    ephemeral_signature: provePossession(params.ephemeral, params.txSignature),
  };
  if (params.payload !== undefined) {
    request.payload = params.payload;
  }
  if (params.code) {
    request.github_url = params.code.githubUrl;
    request.code_hash = params.code.codeHash;
  }
  return request;
}
