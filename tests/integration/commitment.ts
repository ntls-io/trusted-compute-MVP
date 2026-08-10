/**
 * Nautilus Trusted Compute
 * Copyright (C) 2026 Relational Network
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// tests/integration/commitment.ts
//
// Redemption-commitment helpers for the integration drivers.
//
// Deliberately written against the specification rather than importing
// ntc-web/lib/redemption.ts, so these drivers catch a divergence between the
// three implementations instead of inheriting one. The vector below is the
// same one pinned in sgx-mvp/oracle-verify/src/tests.rs,
// devops-acr/tests/test_oracle.py, and ntc-web/tests/redemption.test.ts.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

export const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);
export const MEMO_PREFIX = "rcc1:";
export const POSSESSION_PREFIX = "relational-possession:v1\n";
export const MAX_TRANSACTION_LEN = 1232;

export interface CodeReference {
  githubUrl: string;
  codeHash: string;
}

function sha256(data: Uint8Array): Buffer {
  return createHash("sha256").update(data).digest();
}

export function codeDigest(code: CodeReference | null): Buffer {
  if (!code) return sha256(new Uint8Array(0));
  return sha256(
    Buffer.concat([
      Buffer.from(code.githubUrl, "utf8"),
      Buffer.from([0]),
      Buffer.from(code.codeHash, "utf8"),
    ])
  );
}

export function commitment(
  ephemeralPubkey: Uint8Array,
  payload: string,
  code: CodeReference | null
): Buffer {
  return sha256(
    Buffer.concat([
      Buffer.from(ephemeralPubkey),
      sha256(Buffer.from(payload, "utf8")),
      codeDigest(code),
    ])
  );
}

export function memoFor(
  ephemeralPubkey: Uint8Array,
  payload: string,
  code: CodeReference | null
): string {
  return MEMO_PREFIX + commitment(ephemeralPubkey, payload, code).toString("hex");
}

export function memoInstruction(memo: string): TransactionInstruction {
  return new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memo, "utf8"),
  });
}

export interface Ephemeral {
  keypair: nacl.SignKeyPair;
  publicKey: Uint8Array;
  publicKeyB58: string;
}

export function generateEphemeral(): Ephemeral {
  const keypair = nacl.sign.keyPair();
  return {
    keypair,
    publicKey: keypair.publicKey,
    publicKeyB58: bs58.encode(keypair.publicKey),
  };
}

export function provePossession(
  ephemeral: Ephemeral,
  txSignature: Uint8Array
): string {
  const message = Buffer.concat([
    Buffer.from(POSSESSION_PREFIX, "utf8"),
    Buffer.from(txSignature),
  ]);
  return bs58.encode(nacl.sign.detached(message, ephemeral.keypair.secretKey));
}

export interface EnclaveRequest {
  signed_transaction: string;
  payload?: string;
  github_url?: string;
  code_hash?: string;
  ephemeral_pubkey: string;
  ephemeral_signature: string;
}

export function buildEnclaveRequest(params: {
  signedTransaction: Uint8Array;
  txSignature: Uint8Array;
  ephemeral: Ephemeral;
  payload?: string;
  code?: CodeReference | null;
}): EnclaveRequest {
  const request: EnclaveRequest = {
    signed_transaction: Buffer.from(params.signedTransaction).toString("base64"),
    ephemeral_pubkey: params.ephemeral.publicKeyB58,
    ephemeral_signature: provePossession(params.ephemeral, params.txSignature),
  };
  if (params.payload !== undefined) request.payload = params.payload;
  if (params.code) {
    request.github_url = params.code.githubUrl;
    request.code_hash = params.code.codeHash;
  }
  return request;
}

/**
 * Sign and send a transaction carrying the commitment memo, returning the
 * signed bytes the enclave will verify. Mirrors ntc-web's `signSendWithMemo`.
 */
export async function signSendWithMemo(
  connection: import("@solana/web3.js").Connection,
  payer: Keypair,
  transaction: Transaction,
  memoIx: TransactionInstruction
): Promise<{ tx: string; signature: Uint8Array; signedTransaction: Uint8Array }> {
  transaction.add(memoIx);
  transaction.feePayer = payer.publicKey;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;
  transaction.sign(payer);

  const raw = transaction.serialize();
  assert.ok(
    raw.length <= MAX_TRANSACTION_LEN,
    `transaction is ${raw.length} bytes, over the ${MAX_TRANSACTION_LEN} limit`
  );
  const tx = await connection.sendRawTransaction(raw, {
    preflightCommitment: "confirmed",
  });
  await connection.confirmTransaction(
    { signature: tx, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  return { tx, signature: bs58.decode(tx), signedTransaction: Uint8Array.from(raw) };
}

/** Fails fast if this file has drifted from the other implementations. */
export function assertVectorMatches(): void {
  const eph = new Uint8Array(32).fill(3);
  assert.equal(
    memoFor(
      eph,
      "",
      {
        githubUrl:
          "https://github.com/nautilus-project/py_compute_median/blob/main/script.py",
        codeHash: "a".repeat(64),
      }
    ),
    "rcc1:a62f64638528d12d6b6e20f785527768ea6d8d5dbe4c3b0fd8e0b9196ced408c"
  );
  assert.equal(
    memoFor(eph, '{"a":1}', null),
    "rcc1:14952fb6c44231bde18f203a7cde30edbc3ae553bca48dea64dc651905f35c0c"
  );
}
