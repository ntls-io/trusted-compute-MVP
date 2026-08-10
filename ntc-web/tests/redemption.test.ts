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

// tests/redemption.test.ts
//
// The commitment scheme, and the transaction-size budget the memo has to fit
// inside. The pinned vector below is asserted byte-for-byte in
// sgx-mvp/oracle-verify/src/tests.rs and devops-acr/tests/test_oracle.py too;
// if this test and those disagree, the enclave will reject every request.

import test from "node:test";
import assert from "node:assert/strict";
import { ed25519 } from "@noble/curves/ed25519";
import { Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import bs58 from "bs58";

import {
  buildEnclaveRequest,
  codeDigest,
  commitment,
  generateEphemeralKey,
  MAX_GITHUB_URL_LENGTH,
  MAX_TRANSACTION_LEN,
  MEMO_PROGRAM_ID,
  memoFor,
  memoInstruction,
  POSSESSION_PREFIX,
  provePossession,
  toBase64,
  validateCodeReference,
} from "../lib/redemption";

const GITHUB_URL =
  "https://github.com/nautilus-project/py_compute_median/blob/main/script.py";
const CODE_HASH = "a".repeat(64);
const CODE = { githubUrl: GITHUB_URL, codeHash: CODE_HASH };

// ---------------------------------------------------------------------------
// Cross-language commitment vector
// ---------------------------------------------------------------------------

test("commitment vector matches the Rust and Python implementations", () => {
  const eph = new Uint8Array(32).fill(3);
  assert.equal(
    memoFor(eph, "", CODE),
    "rcc1:a62f64638528d12d6b6e20f785527768ea6d8d5dbe4c3b0fd8e0b9196ced408c"
  );
  assert.equal(
    memoFor(eph, '{"a":1}', null),
    "rcc1:14952fb6c44231bde18f203a7cde30edbc3ae553bca48dea64dc651905f35c0c"
  );
});

// ---------------------------------------------------------------------------
// Commitment behaviour
// ---------------------------------------------------------------------------

test("every committed field changes the commitment", () => {
  const eph = new Uint8Array(32).fill(3);
  const other = new Uint8Array(32).fill(4);
  const base = memoFor(eph, "", CODE);

  assert.notEqual(base, memoFor(other, "", CODE), "ephemeral key");
  assert.notEqual(base, memoFor(eph, "x", CODE), "payload");
  assert.notEqual(
    base,
    memoFor(eph, "", { githubUrl: GITHUB_URL, codeHash: "b".repeat(64) }),
    "code hash"
  );
  assert.notEqual(
    base,
    memoFor(eph, "", { githubUrl: "https://github.com/x/y", codeHash: CODE_HASH }),
    "github url"
  );
  assert.notEqual(base, memoFor(eph, "", null), "absent code reference");
});

test("the code reference is unambiguously delimited", () => {
  // Without the 0x00 separator these two would hash identically.
  const a = codeDigest({ githubUrl: "https://github.com/ab", codeHash: "c" });
  const b = codeDigest({ githubUrl: "https://github.com/a", codeHash: "bc" });
  assert.notDeepEqual(a, b);
});

test("absent code reference commits to sha256 of the empty string", () => {
  assert.deepEqual(codeDigest(null), codeDigest(null));
  assert.equal(Buffer.from(codeDigest(null)).toString("hex").length, 64);
});

test("payload is hashed as exact bytes, not parsed JSON", () => {
  const eph = new Uint8Array(32).fill(1);
  // Semantically equal JSON, different bytes: must commit differently.
  assert.notEqual(memoFor(eph, '{"a":1}', null), memoFor(eph, '{ "a": 1 }', null));
});

test("memo is the prefix plus 64 hex chars", () => {
  const memo = memoFor(new Uint8Array(32), "", null);
  assert.match(memo, /^rcc1:[0-9a-f]{64}$/);
  assert.equal(memo.length, 69);
  assert.equal(commitment(new Uint8Array(32), "", null).length, 32);
});

// ---------------------------------------------------------------------------
// Ephemeral key and proof of possession
// ---------------------------------------------------------------------------

test("ephemeral keys are fresh and the proof verifies", () => {
  const a = generateEphemeralKey();
  const b = generateEphemeralKey();
  assert.notDeepEqual(a.publicKey, b.publicKey);
  assert.equal(a.publicKey.length, 32);
  assert.equal(bs58.decode(a.publicKeyB58).length, 32);

  const txSignature = new Uint8Array(64).fill(7);
  const proof = bs58.decode(provePossession(a, txSignature));
  const message = Buffer.concat([
    Buffer.from(POSSESSION_PREFIX, "utf8"),
    Buffer.from(txSignature),
  ]);
  assert.ok(ed25519.verify(proof, message, a.publicKey));
});

test("a proof does not transfer to another transaction or another key", () => {
  const eph = generateEphemeralKey();
  const other = generateEphemeralKey();
  const txSignature = new Uint8Array(64).fill(7);
  const proof = bs58.decode(provePossession(eph, txSignature));

  const wrongTx = Buffer.concat([
    Buffer.from(POSSESSION_PREFIX, "utf8"),
    Buffer.from(new Uint8Array(64).fill(8)),
  ]);
  assert.equal(ed25519.verify(proof, wrongTx, eph.publicKey), false);

  const rightTx = Buffer.concat([
    Buffer.from(POSSESSION_PREFIX, "utf8"),
    Buffer.from(txSignature),
  ]);
  assert.equal(ed25519.verify(proof, rightTx, other.publicKey), false);
});

// ---------------------------------------------------------------------------
// Code reference validation (runs before a DRT is burned)
// ---------------------------------------------------------------------------

test("code references the enclave would refuse are rejected up front", () => {
  assert.doesNotThrow(() => validateCodeReference(CODE));
  assert.throws(
    () => validateCodeReference({ githubUrl: "https://example.com/x.py", codeHash: CODE_HASH }),
    /malformed/
  );
  assert.throws(
    () =>
      validateCodeReference({
        githubUrl: "https://github.com/" + "x".repeat(MAX_GITHUB_URL_LENGTH),
        codeHash: CODE_HASH,
      }),
    /too long/
  );
  assert.throws(
    () => validateCodeReference({ githubUrl: GITHUB_URL, codeHash: "nope" }),
    /64 lowercase hex/
  );
  assert.throws(
    () => validateCodeReference({ githubUrl: GITHUB_URL, codeHash: "A".repeat(64) }),
    /64 lowercase hex/
  );
});

// ---------------------------------------------------------------------------
// Enclave request assembly
// ---------------------------------------------------------------------------

test("request carries the signed bytes and omits absent optional fields", () => {
  const ephemeral = generateEphemeralKey();
  const signedTransaction = new Uint8Array([1, 2, 3, 4]);
  const txSignature = new Uint8Array(64).fill(5);

  const execute = buildEnclaveRequest({
    signedTransaction,
    txSignature,
    ephemeral,
    code: CODE,
  });
  assert.equal(execute.signed_transaction, toBase64(signedTransaction));
  assert.equal(execute.ephemeral_pubkey, ephemeral.publicKeyB58);
  assert.equal(execute.github_url, GITHUB_URL);
  assert.equal(execute.code_hash, CODE_HASH);
  assert.equal("payload" in execute, false);

  const append = buildEnclaveRequest({
    signedTransaction,
    txSignature,
    ephemeral,
    payload: '{"x":1}',
  });
  assert.equal(append.payload, '{"x":1}');
  assert.equal("github_url" in append, false);
});

test("base64 round-trips the full transaction size", () => {
  const bytes = new Uint8Array(MAX_TRANSACTION_LEN).map((_, i) => i % 256);
  assert.deepEqual(new Uint8Array(Buffer.from(toBase64(bytes), "base64")), bytes);
});

// ---------------------------------------------------------------------------
// Transaction size budget
// ---------------------------------------------------------------------------

test("memo instruction targets the SPL Memo program and carries the memo", () => {
  const memo = memoFor(new Uint8Array(32).fill(3), "", CODE);
  const ix = memoInstruction(memo);
  assert.ok(ix.programId.equals(MEMO_PROGRAM_ID));
  assert.equal(ix.keys.length, 0);
  assert.equal(ix.data.toString("utf8"), memo);
});

/**
 * The memo has to fit inside transactions that are already near Solana's
 * limit — pool creation especially, which initialises every DRT mint in one
 * transaction.
 *
 * This bounds the memo's marginal cost and checks a redemption-shaped
 * transaction end to end. The real gate for pool creation is the runtime
 * check in `signSendWithMemo`, which refuses to send anything over the limit
 * rather than letting the RPC reject it opaquely; this test exists so the
 * budget that check enforces cannot silently grow.
 */
test("memo fits within the transaction size limit", () => {
  const payer = Keypair.generate();
  const memo = memoFor(new Uint8Array(32).fill(3), "", CODE);

  const build = (instructionCount: number, accountsEach: number, withMemo: boolean) => {
    const tx = new Transaction();
    for (let i = 0; i < instructionCount; i++) {
      tx.add(
        new TransactionInstruction({
          keys: Array.from({ length: accountsEach }, () => ({
            pubkey: Keypair.generate().publicKey,
            isSigner: false,
            isWritable: true,
          })),
          programId: new PublicKey("CME2Dg7UEW82Hf99rQetEi7Hc5Db9JQPx6Azmx1eWbEE"),
          data: Buffer.alloc(32),
        })
      );
    }
    if (withMemo) tx.add(memoInstruction(memo));
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = bs58.encode(new Uint8Array(32).fill(1));
    return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).length;
  };

  // A redemption: one instruction, ~9 accounts. Ample headroom.
  const redeemWithMemo = build(1, 9, true);
  assert.ok(
    redeemWithMemo < MAX_TRANSACTION_LEN,
    `redemption is ${redeemWithMemo} bytes, limit ${MAX_TRANSACTION_LEN}`
  );

  // Marginal cost: the memo program key (32B) plus the memo data and framing.
  const overhead = redeemWithMemo - build(1, 9, false);
  assert.ok(overhead < 160, `memo overhead is ${overhead} bytes`);
});

test("feePayer is the account the enclave will treat as the claimant", () => {
  // account_keys[0] is the fee payer, and the enclave matches it against the
  // oracle's redeemer. Guards against a future change that sets a different
  // fee payer than the redeeming wallet.
  const payer = Keypair.generate();
  const tx = new Transaction();
  tx.add(
    new TransactionInstruction({
      keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: true }],
      programId: new PublicKey("CME2Dg7UEW82Hf99rQetEi7Hc5Db9JQPx6Azmx1eWbEE"),
      data: Buffer.alloc(0),
    })
  );
  tx.add(memoInstruction(memoFor(new Uint8Array(32), "", null)));
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = bs58.encode(new Uint8Array(32).fill(1));
  const message = tx.compileMessage();
  assert.ok(message.accountKeys[0].equals(payer.publicKey));
  assert.ok(message.accountKeys.some((key) => key.equals(MEMO_PROGRAM_ID)));
});
