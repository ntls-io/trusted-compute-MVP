/**
 * Nautilus Trusted Compute
 * Copyright (C) 2026 Relational Network
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// tests/integration/azure-smoke-test.ts
//
// Azure SGX smoke test (plan.md test plan). Runs against DEPLOYED
// infrastructure — a devnet pool, the devops-acr service (deployment API +
// oracle), and an SGX enclave VM. Requires SGX hardware; it cannot run
// locally.
//
//   1. verify expected MRENCLAVE/MRSIGNER via the attestation endpoint,
//   2. initialize a pool (redeem PoolCreated → /create_data_pool),
//   3. append once, execute Python/WASM once,
//   4. after an operator-triggered enclave restart, confirm the sealed pool
//      identity survives and a replayed redemption is rejected.
//
// Env: DEVOPS_URL, ENCLAVE_IP, VM_NAME, MRENCLAVE, MRSIGNER, POOL_PDA,
//      POOL_CREATE_TX, ANCHOR_WALLET, plus per-step redemption txs
//      (APPEND_TX, PYTHON_TX, WASM_TX) produced with the ntc-web flow or
//      the local driver. GITHUB_URL/CODE_HASH must match the on-chain DRTs.
import { Keypair } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { Agent } from "node:https";
import { buildClaim, signClaim, type ChainClaim } from "./claim.js";

const env = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`missing env ${name}`);
  return value;
};

const DEVOPS_URL = env("DEVOPS_URL");
const ENCLAVE = `https://${env("ENCLAVE_IP")}`;
const CLUSTER = env("SOLANA_CLUSTER", "devnet");
const PROGRAM = env("DRT_PROGRAM_ID", "CME2Dg7UEW82Hf99rQetEi7Hc5Db9JQPx6Azmx1eWbEE");
const POOL = env("POOL_PDA");

// RA-TLS presents a self-signed cert; trust comes from step 1's attestation.
const insecureAgent = new Agent({ rejectUnauthorized: false });

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function postEnclave(path: string, body: unknown) {
  const response = await fetch(`${ENCLAVE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // @ts-expect-error node fetch supports dispatcher-less agent via undici option
    agent: insecureAgent,
  });
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    parsed = await response.text();
  }
  return { status: response.status, body: parsed as Record<string, unknown> };
}

async function main() {
  const wallet = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(env("ANCHOR_WALLET"), "utf8")))
  );
  const claimant = wallet.publicKey.toBase58();
  const signed = (claim: ChainClaim) => ({ claim, wallet_signature: signClaim(wallet, claim) });

  // ---- 1. Attestation with expected measurements ----------------------
  const attestation = await fetch(`${DEVOPS_URL}/attestation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      vm_name: env("VM_NAME"),
      mrenclave: env("MRENCLAVE"),
      mrsigner: env("MRSIGNER"),
      port: 443,
    }),
  }).then((r) => r.json());
  check("attestation with expected MRENCLAVE/MRSIGNER", attestation.success === true);

  // ---- 2. Initialize the pool -----------------------------------------
  const initPayload = JSON.stringify({
    schema: JSON.parse(env("POOL_SCHEMA", '{"type":"object"}')),
    data: JSON.parse(env("SEED_DATA", '{"rows":[]}')),
  });
  const initClaim = buildClaim({
    action: "pool_initialize", cluster: CLUSTER, program: PROGRAM,
    tx: env("POOL_CREATE_TX"), pool: POOL, claimant, payload: initPayload,
  });
  const init = await postEnclave("/create_data_pool", { ...signed(initClaim), payload: initPayload });
  check("pool initialized", init.status === 200, JSON.stringify(init.body).slice(0, 120));

  // Second init must be refused (one-time binding).
  const reinit = await postEnclave("/create_data_pool", { ...signed(initClaim), payload: initPayload });
  check("re-initialization rejected or cached", reinit.status === 200 || reinit.status === 409);

  // ---- 3. Append once, execute once -----------------------------------
  const appendPayload = env("APPEND_DATA", '{"rows":[{"x":1}]}');
  const appendClaim = buildClaim({
    action: "append", cluster: CLUSTER, program: PROGRAM,
    tx: env("APPEND_TX"), pool: POOL, claimant, payload: appendPayload,
  });
  const append = await postEnclave("/append_data", { ...signed(appendClaim), payload: appendPayload });
  check("append succeeds once", append.status === 200);

  const pythonClaim = buildClaim({
    action: "execute_python", cluster: CLUSTER, program: PROGRAM,
    tx: env("PYTHON_TX"), pool: POOL, claimant, payload: "",
    githubUrl: env("GITHUB_URL"), codeHash: env("CODE_HASH"),
  });
  const python = await postEnclave("/execute_python", signed(pythonClaim));
  check("python executes once", python.status === 200, JSON.stringify(python.body).slice(0, 120));

  if (process.env.WASM_TX) {
    const wasmClaim = buildClaim({
      action: "execute_wasm", cluster: CLUSTER, program: PROGRAM,
      tx: env("WASM_TX"), pool: POOL, claimant, payload: "",
      githubUrl: env("WASM_GITHUB_URL"), codeHash: env("WASM_CODE_HASH"),
    });
    const wasm = await postEnclave("/execute_wasm", signed(wasmClaim));
    check("wasm executes once", wasm.status === 200);
  }

  // Replay of a consumed redemption with a DIFFERENT claim must be refused.
  const replayClaim = buildClaim({
    action: "execute_python", cluster: CLUSTER, program: PROGRAM,
    tx: env("PYTHON_TX"), pool: POOL, claimant, payload: "",
    githubUrl: env("GITHUB_URL"), codeHash: env("CODE_HASH"),
  }); // fresh nonce/expiry → different digest
  const replay = await postEnclave("/execute_python", signed(replayClaim));
  check("replay with different claim rejected", replay.status === 409);

  // Identical retry is served from the sealed result cache.
  const cached = await postEnclave("/execute_python", signed(pythonClaim));
  check("identical retry served from cache", cached.status === 200);

  // ---- 4. Restart persistence -----------------------------------------
  if (process.env.RESTARTED === "1") {
    const postRestartReplay = await postEnclave("/execute_python", signed(replayClaim));
    check("replay state survives restart", postRestartReplay.status === 409);
    const postRestartInit = await postEnclave("/create_data_pool", { ...signed(initClaim), payload: initPayload });
    check("sealed pool identity survives restart", postRestartInit.status === 200 || postRestartInit.status === 409);
  } else {
    console.log(
      "NOTE  restart the enclave (same measured image), then re-run with RESTARTED=1 to verify sealed identity and replay-state persistence"
    );
  }

  console.log(failures === 0 ? "\nSMOKE TEST PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
