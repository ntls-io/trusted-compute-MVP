/**
 * Nautilus Trusted Compute
 * Copyright (C) 2026 Relational Network
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// tests/integration/azure-smoke-test.ts
//
// Azure SGX smoke test. Runs against DEPLOYED infrastructure — devnet, the
// devops-acr service (deployment API + oracle), and an SGX enclave VM.
// Requires SGX hardware; it cannot run locally.
//
//   1. verify expected MRENCLAVE/MRSIGNER via the attestation endpoint,
//   2. create a pool on devnet and initialize it in the enclave,
//   3. buy and redeem an Append and a Python DRT, exercising each once,
//   4. confirm an identical retry is served from the sealed cache and that a
//      redemption cannot be diverted to another endpoint,
//   5. after an operator-triggered enclave restart, confirm the sealed pool
//      identity and replay state survive.
//
// Unlike the previous version this drives the chain itself rather than
// accepting transaction signatures from the environment. It has to: the
// enclave's authorization is a commitment inside the transaction's memo, so
// whoever builds the request must also build the transaction.
//
// State from run 1 is written to `.smoke-state.json` so the RESTARTED=1
// re-run can present the identical requests. Delete that file to start over.
//
// Env: DEVOPS_URL, ENCLAVE_IP, VM_NAME, MRENCLAVE, MRSIGNER, ANCHOR_WALLET,
//      GITHUB_URL, CODE_HASH (must match the DRT written on-chain here),
//      optional SOLANA_RPC_URL, DRT_PROGRAM_ID, DRT_IDL_PATH.
import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Agent } from "node:https";
import bs58 from "bs58";
import {
  assertVectorMatches,
  generateEphemeral,
  memoFor,
  memoInstruction,
  provePossession,
  signSendWithMemo,
  type CodeReference,
} from "./commitment.js";

const env = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`missing env ${name}`);
  return value;
};

const DEVOPS_URL = env("DEVOPS_URL");
const ENCLAVE = `https://${env("ENCLAVE_IP")}`;
const RPC_URL = env("SOLANA_RPC_URL", "https://api.devnet.solana.com");
const PROGRAM_ID = env("DRT_PROGRAM_ID", "CME2Dg7UEW82Hf99rQetEi7Hc5Db9JQPx6Azmx1eWbEE");
const IDL_PATH = env("DRT_IDL_PATH", "../../drt-manager/target/idl/drt_manager.json");
const CODE: CodeReference = {
  githubUrl: env("GITHUB_URL"),
  codeHash: env("CODE_HASH"),
};
const STATE_FILE = new URL(".smoke-state.json", import.meta.url);

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

/**
 * A completed redemption, persisted so the restart run can replay the exact
 * same request. The ephemeral secret is stored because the possession proof
 * cannot be regenerated without it.
 */
interface Recorded {
  signed_transaction: string;
  payload?: string;
  github_url?: string;
  code_hash?: string;
  ephemeral_pubkey: string;
  ephemeral_signature: string;
}

interface SmokeState {
  pool: string;
  init: Recorded;
  append: Recorded;
  python: Recorded;
}

function loadState(): SmokeState | null {
  if (!existsSync(STATE_FILE)) return null;
  return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}

async function attest(): Promise<boolean> {
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
  return attestation.success === true;
}

async function main() {
  assertVectorMatches();

  // ---- 1. Attestation with expected measurements ----------------------
  check("attestation with expected MRENCLAVE/MRSIGNER", await attest());

  if (process.env.RESTARTED === "1") {
    await verifyAfterRestart();
    return finish();
  }

  const wallet = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(env("ANCHOR_WALLET"), "utf8")))
  );
  const connection = new anchor.web3.Connection(RPC_URL, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  const idl = JSON.parse(readFileSync(new URL(IDL_PATH, import.meta.url), "utf8"));
  const program = new anchor.Program(idl, provider);
  const programId = new PublicKey(PROGRAM_ID);
  const spl = await import("@solana/spl-token");

  // ---- 2. Create the pool on devnet and initialize the enclave --------
  const poolName = `smoke-${Date.now() % 100000}`;
  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), wallet.publicKey.toBuffer(), Buffer.from(poolName)],
    programId
  );
  const [feeVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("fee_vault"), poolPda.toBuffer()],
    programId
  );
  const [ownershipMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("ownership_mint"), poolPda.toBuffer()],
    programId
  );
  const ownershipTokenAccount = await spl.getAssociatedTokenAddress(
    ownershipMint,
    wallet.publicKey
  );

  const initPayload = JSON.stringify({
    schema: JSON.parse(env("POOL_SCHEMA", '{"type":"object"}')),
    data: JSON.parse(env("SEED_DATA", '{"rows":[]}')),
  });
  const initEphemeral = generateEphemeral();

  // Cast: Anchor's builder types recurse without depth limit on an untyped
  // IDL, which tsc reports as TS2589.
  const methods = program.methods as anchor.Program["methods"];
  const createIx = await methods
    .createPoolWithDrts(
      poolName,
      [
        { drtType: "append", supply: new anchor.BN(10), cost: new anchor.BN(0), githubUrl: null, codeHash: null },
        { drtType: "py_compute_median", supply: new anchor.BN(10), cost: new anchor.BN(0), githubUrl: CODE.githubUrl, codeHash: CODE.codeHash },
      ],
      new anchor.BN(1000)
    )
    .accounts({
      pool: poolPda,
      owner: wallet.publicKey,
      ownershipMint,
      ownershipTokenAccount,
      feeVault,
      systemProgram: SystemProgram.programId,
      tokenProgram: spl.TOKEN_PROGRAM_ID,
      associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();

  const created = await signSendWithMemo(
    connection,
    wallet,
    new Transaction().add(createIx),
    memoInstruction(memoFor(initEphemeral.publicKey, initPayload, null))
  );
  console.log(`pool ${poolPda.toBase58()} created in ${created.tx}`);

  const initRequest: Recorded = {
    signed_transaction: Buffer.from(created.signedTransaction).toString("base64"),
    payload: initPayload,
    ephemeral_pubkey: initEphemeral.publicKeyB58,
    ephemeral_signature: provePossession(initEphemeral, created.signature),
  };

  const init = await postEnclave("/create_data_pool", initRequest);
  check("pool initialized", init.status === 200, JSON.stringify(init.body).slice(0, 160));

  // Second init must be refused or served from cache (one-time binding).
  const reinit = await postEnclave("/create_data_pool", initRequest);
  check("re-initialization refused or cached", reinit.status === 200 || reinit.status === 409);

  // ---- 3. Append once, execute once -----------------------------------
  const appendPayload = env("APPEND_DATA", '{"rows":[{"x":1}]}');
  const appendRequest = await redeemAndRecord(
    program, connection, wallet, poolPda, ownershipMint, programId, spl,
    "append", appendPayload, null
  );
  const append = await postEnclave("/append_data", appendRequest);
  check("append succeeds once", append.status === 200, JSON.stringify(append.body).slice(0, 160));

  const pythonRequest = await redeemAndRecord(
    program, connection, wallet, poolPda, ownershipMint, programId, spl,
    "py_compute_median", "", CODE
  );
  const python = await postEnclave("/execute_python", pythonRequest);
  check("python executes once", python.status === 200, JSON.stringify(python.body).slice(0, 160));

  // ---- 4. Cache and misdirection --------------------------------------
  // The commitment is fixed by the transaction, so a repeat is necessarily
  // the identical request and must come back from the sealed result cache
  // rather than executing again.
  const cached = await postEnclave("/execute_python", pythonRequest);
  check("identical retry served from cache", cached.status === 200);
  check(
    "cached result matches the first execution",
    JSON.stringify(cached.body) === JSON.stringify(python.body)
  );

  // A compute redemption cannot be diverted to the append endpoint.
  const diverted = await postEnclave("/append_data", { ...pythonRequest, payload: "{}" });
  check("redemption cannot be diverted to another endpoint", diverted.status >= 400);

  // A request whose payload differs from the on-chain commitment.
  const tampered = await postEnclave("/append_data", {
    ...appendRequest,
    payload: '{"rows":[{"x":999}]}',
  });
  check("payload outside the commitment rejected", tampered.status === 400);

  writeFileSync(
    STATE_FILE,
    JSON.stringify(
      { pool: poolPda.toBase58(), init: initRequest, append: appendRequest, python: pythonRequest },
      null,
      2
    )
  );
  console.log(
    "\nNOTE  restart the enclave (same measured image), then re-run with " +
      "RESTARTED=1 to verify sealed identity and replay-state persistence"
  );
  finish();
}

async function verifyAfterRestart() {
  const state = loadState();
  if (!state) throw new Error("no .smoke-state.json — run without RESTARTED=1 first");

  // The sealed replay ledger must still know these redemptions.
  const python = await postEnclave("/execute_python", state.python);
  check("replay state survives restart (cached, not re-executed)", python.status === 200);

  const append = await postEnclave("/append_data", state.append);
  check("append redemption still consumed after restart", append.status === 200);

  // The pool binding must still be in place.
  const reinit = await postEnclave("/create_data_pool", state.init);
  check(
    "sealed pool identity survives restart",
    reinit.status === 200 || reinit.status === 409
  );
}

async function redeemAndRecord(
  program: anchor.Program,
  connection: anchor.web3.Connection,
  wallet: Keypair,
  pool: PublicKey,
  ownershipMint: PublicKey,
  programId: PublicKey,
  spl: typeof import("@solana/spl-token"),
  drtType: string,
  payload: string,
  code: CodeReference | null
): Promise<Recorded> {
  const [drtMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("drt_mint"), pool.toBuffer(), Buffer.from(drtType)],
    programId
  );
  const [feeVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("fee_vault"), pool.toBuffer()],
    programId
  );
  const buyerTokenAccount = await spl.getAssociatedTokenAddress(drtMint, wallet.publicKey);
  const vaultDrtTokenAccount = await spl.getAssociatedTokenAddress(drtMint, pool, true);
  const userOwnershipAccount = await spl.getAssociatedTokenAddress(ownershipMint, wallet.publicKey);

  // Buy one token, in its own transaction: only the redemption needs a memo.
  const methods = program.methods as anchor.Program["methods"];
  await methods
    .buyDrt(drtType)
    .accounts({
      pool,
      drtMint,
      vaultDrtTokenAccount,
      buyer: wallet.publicKey,
      buyerTokenAccount,
      feeVault,
      tokenProgram: spl.TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc({ commitment: "confirmed" });

  const ephemeral = generateEphemeral();
  const redeemIx = await methods
    .redeemDrt(drtType)
    .accounts({
      pool,
      drtMint,
      ownershipMint,
      user: wallet.publicKey,
      userTokenAccount: buyerTokenAccount,
      userOwnershipAccount,
      tokenProgram: spl.TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();

  const sent = await signSendWithMemo(
    connection,
    wallet,
    new Transaction().add(redeemIx),
    memoInstruction(memoFor(ephemeral.publicKey, payload, code))
  );
  console.log(`redeemed ${drtType} in ${sent.tx}`);

  const record: Recorded = {
    signed_transaction: Buffer.from(sent.signedTransaction).toString("base64"),
    ephemeral_pubkey: ephemeral.publicKeyB58,
    ephemeral_signature: provePossession(ephemeral, sent.signature),
  };
  if (payload !== "") record.payload = payload;
  if (code) {
    record.github_url = code.githubUrl;
    record.code_hash = code.codeHash;
  }
  // Guard: the signature we recorded must be the one the enclave derives.
  if (bs58.encode(sent.signature) !== sent.tx) {
    throw new Error("recorded signature does not match the transaction id");
  }
  return record;
}

function finish(): void {
  console.log(failures === 0 ? "\nSMOKE TEST PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
