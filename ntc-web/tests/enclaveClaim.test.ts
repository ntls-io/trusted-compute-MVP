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

// tests/enclaveClaim.test.ts
//
// Frontend claim tests (plan.md test plan): deterministic claim encoding
// cross-checked byte-for-byte against the oracle and enclave
// canonicalization (shared pinned vector), payload hashing, wallet-signature
// cancellation, unsupported wallets, and redemption-tx propagation.
import { test } from "node:test";
import assert from "node:assert/strict";
import bs58 from "bs58";
import {
  buildClaim,
  canonicalClaimJson,
  claimDigestHex,
  claimMessageBytes,
  payloadSha256Hex,
  signClaim,
  walletSupportsSignMessage,
  CLAIM_DOMAIN_PREFIX,
} from "../lib/enclaveClaim";

const GITHUB_URL =
  "https://github.com/nautilus-project/py_compute_median/blob/main/script.py";
const CODE_HASH = "a".repeat(64);
const SHA256_EMPTY =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

// Pinned identically in devops-acr/tests/test_oracle.py and
// sgx-mvp/oracle-verify/src/canonical.rs; do not edit one without the others.
const CANONICAL_VECTOR_DIGEST =
  "600528edcf47bf38a4ced6da3b9565d0e43e8d408073ad38aa1eb4ee38098628";

function vectorClaim(): Record<string, string> {
  return {
    version: "1",
    action: "execute_python",
    cluster: "devnet",
    program: "CME2Dg7UEW82Hf99rQetEi7Hc5Db9JQPx6Azmx1eWbEE",
    tx: bs58.encode(new Uint8Array(64).fill(2)),
    pool: bs58.encode(new Uint8Array(32).fill(1)),
    claimant: bs58.encode(new Uint8Array(32).fill(3)),
    payload_sha256: SHA256_EMPTY,
    nonce: "00112233445566778899aabbccddeeff",
    expiry: "1767225600",
    github_url: GITHUB_URL,
    code_hash: CODE_HASH,
  };
}

test("canonical encoding matches the shared cross-language vector", async () => {
  assert.equal(await claimDigestHex(vectorClaim()), CANONICAL_VECTOR_DIGEST);
});

test("canonical encoding is deterministic regardless of key order", async () => {
  const claim = vectorClaim();
  const shuffled: Record<string, string> = {};
  for (const key of Object.keys(claim).reverse()) {
    shuffled[key] = claim[key];
  }
  assert.equal(canonicalClaimJson(shuffled), canonicalClaimJson(claim));
  assert.equal(await claimDigestHex(shuffled), CANONICAL_VECTOR_DIGEST);
});

test("signed message carries the domain prefix", () => {
  const bytes = claimMessageBytes(vectorClaim());
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.startsWith(CLAIM_DOMAIN_PREFIX));
  assert.ok(text.endsWith("}"));
});

test("payload hashing matches sha256 of the exact string bytes", async () => {
  assert.equal(await payloadSha256Hex(""), SHA256_EMPTY);
  // Independently computed: echo -n '{"x":1}' | shasum -a 256
  assert.equal(
    await payloadSha256Hex('{"x":1}'),
    "5041bf1f713df204784353e82f6a4a535931cb64f1f4b4a5aeaffcb720918b22"
  );
});

test("buildClaim propagates the redemption transaction and pool", async () => {
  const tx = bs58.encode(new Uint8Array(64).fill(9));
  const claim = await buildClaim({
    action: "execute_wasm",
    tx,
    pool: bs58.encode(new Uint8Array(32).fill(4)),
    claimant: bs58.encode(new Uint8Array(32).fill(5)),
    payload: "",
    githubUrl: GITHUB_URL,
    codeHash: CODE_HASH,
  });
  assert.equal(claim.tx, tx);
  assert.equal(claim.action, "execute_wasm");
  assert.equal(claim.payload_sha256, SHA256_EMPTY);
  assert.equal(claim.github_url, GITHUB_URL);
  assert.match(claim.nonce, /^[0-9a-f]{32}$/);
  assert.ok(parseInt(claim.expiry, 10) > Date.now() / 1000);
});

test("compute claims without on-chain code metadata are refused", async () => {
  await assert.rejects(
    buildClaim({
      action: "execute_python",
      tx: "t",
      pool: "p",
      claimant: "c",
      payload: "",
    }),
    /GitHub URL and code hash/
  );
});

test("malformed code metadata is refused", async () => {
  await assert.rejects(
    buildClaim({
      action: "execute_python",
      tx: "t",
      pool: "p",
      claimant: "c",
      payload: "",
      githubUrl: "https://example.com/script.py",
      codeHash: CODE_HASH,
    }),
    /malformed/
  );
  await assert.rejects(
    buildClaim({
      action: "execute_python",
      tx: "t",
      pool: "p",
      claimant: "c",
      payload: "",
      githubUrl: GITHUB_URL,
      codeHash: "not-hex",
    }),
    /64 lowercase hex/
  );
});

test("compute claims must not carry a payload", async () => {
  await assert.rejects(
    buildClaim({
      action: "execute_python",
      tx: "t",
      pool: "p",
      claimant: "c",
      payload: '{"x":1}',
      githubUrl: GITHUB_URL,
      codeHash: CODE_HASH,
    }),
    /no payload/
  );
});

test("wallets without signMessage are detected and refused", async () => {
  assert.equal(walletSupportsSignMessage({}), false);
  assert.equal(
    walletSupportsSignMessage({ signMessage: async (m: Uint8Array) => m }),
    true
  );
  await assert.rejects(signClaim({}, vectorClaim()), /signMessage/);
});

test("wallet signature cancellation propagates", async () => {
  const cancellingWallet = {
    signMessage: async () => {
      throw new Error("User rejected the request.");
    },
  };
  await assert.rejects(
    signClaim(cancellingWallet, vectorClaim()),
    /User rejected/
  );
});

test("wallet signature is base58 of the raw signature bytes", async () => {
  const fakeSignature = new Uint8Array(64).fill(7);
  const wallet = { signMessage: async () => fakeSignature };
  const encoded = await signClaim(wallet, vectorClaim());
  assert.deepEqual(bs58.decode(encoded), fakeSignature);
});
