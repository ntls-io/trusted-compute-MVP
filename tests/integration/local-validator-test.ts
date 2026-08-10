/**
 * Nautilus Trusted Compute
 * Copyright (C) 2026 Relational Network
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// tests/integration/local-validator-test.ts
//
// Local-validator integration test using the UNCHANGED Anchor program:
//   1. create a correctly configured pool (compute DRTs carry real
//      URL/hash metadata on-chain), with the commitment memo attached,
//   2. redeem each DRT type, again with a commitment memo,
//   3. confirm the oracle reports each transaction correctly, and rejects
//      unknown, stale, or non-DRT transactions.
//
// The oracle is now only asked "did this finalize, and what did it emit?",
// so what this driver exercises is the chain→oracle half. The commitment
// itself — payload, code identity, ephemeral key — is verified inside the
// enclave; that half is covered by the mock-oracle unit tests in
// sgx-mvp/oracle-verify, and end to end on SGX hardware via
// azure-smoke-test.ts.
//
// Prerequisites (run local-validator-test.sh to orchestrate):
//   - solana-test-validator with drt_manager.so deployed at DRT_PROGRAM_ID
//   - the oracle running with SOLANA_RPC_URL=http://127.0.0.1:8899,
//     SOLANA_CLUSTER=localnet, and a test ORACLE_SIGNING_KEY_HEX
//   - env: ORACLE_URL (default http://127.0.0.1:8000), ANCHOR_WALLET
import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import { readFileSync } from "node:fs";
import {
  assertVectorMatches,
  generateEphemeral,
  memoFor,
  memoInstruction,
  signSendWithMemo,
} from "./commitment.js";

const ORACLE_URL = process.env.ORACLE_URL ?? "http://127.0.0.1:8000";
const RPC_URL = process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
const PROGRAM_ID = process.env.DRT_PROGRAM_ID ?? "CME2Dg7UEW82Hf99rQetEi7Hc5Db9JQPx6Azmx1eWbEE";
const IDL_PATH = process.env.DRT_IDL_PATH ?? "../../drt-manager/target/idl/drt_manager.json";

const GITHUB_URL = "https://github.com/ntls-io/python-scripts/blob/main/calculate_mean.py";
const CODE_HASH = process.env.TEST_CODE_HASH ?? "a".repeat(64);
const CODE = { githubUrl: GITHUB_URL, codeHash: CODE_HASH };

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function verifyTransaction(tx: string) {
  const response = await fetch(`${ORACLE_URL}/oracle/v1/verify-transaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tx }),
  });
  return { status: response.status, body: await response.json() };
}

/** Decode a compact JWS payload without verifying (the enclave verifies). */
function assertionPayload(jws: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(jws.split(".")[1], "base64url").toString("utf8"));
}

async function main() {
  // Guard against this driver drifting from the other three implementations.
  assertVectorMatches();

  const wallet = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(process.env.ANCHOR_WALLET!, "utf8")))
  );
  const connection = new anchor.web3.Connection(RPC_URL, "finalized");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(wallet),
    { commitment: "finalized" }
  );
  anchor.setProvider(provider);
  const idl = JSON.parse(readFileSync(new URL(IDL_PATH, import.meta.url), "utf8"));
  const program = new anchor.Program(idl, provider);
  const programId = new PublicKey(PROGRAM_ID);

  // ---- 1. Create a correctly configured pool --------------------------
  const poolName = `itest-${Date.now() % 100000}`;
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

  const drtConfigs = [
    { drtType: "append", supply: new anchor.BN(100), cost: new anchor.BN(1000), githubUrl: null, codeHash: null },
    { drtType: "py_compute_median", supply: new anchor.BN(100), cost: new anchor.BN(1000), githubUrl: GITHUB_URL, codeHash: CODE_HASH },
  ];

  const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } =
    await import("@solana/spl-token");
  const ownershipTokenAccount = await getAssociatedTokenAddress(ownershipMint, wallet.publicKey);

  const initPayload = JSON.stringify({ schema: { type: "object" }, data: { rows: [] } });
  const initEphemeral = generateEphemeral();

  // Cast: Anchor's builder types recurse without depth limit on an untyped
  // IDL, which tsc reports as TS2589.
  const methods = program.methods as anchor.Program["methods"];
  const createIx = await methods
    .createPoolWithDrts(poolName, drtConfigs, new anchor.BN(1000))
    .accounts({
      pool: poolPda,
      owner: wallet.publicKey,
      ownershipMint,
      ownershipTokenAccount,
      feeVault,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();

  const created = await signSendWithMemo(
    connection,
    wallet,
    new Transaction().add(createIx),
    memoInstruction(memoFor(initEphemeral.publicKey, initPayload, null))
  );
  console.log("pool created:", poolPda.toBase58(), created.tx);

  const initResult = await verifyTransaction(created.tx);
  check(
    "oracle reports pool_initialize",
    initResult.status === 200,
    JSON.stringify(initResult.body).slice(0, 120)
  );
  if (initResult.status === 200) {
    const payload = assertionPayload(initResult.body.assertion);
    check("assertion names the pool", payload.pool === poolPda.toBase58());
    check("assertion names the owner", payload.claimant === wallet.publicKey.toBase58());
    check("assertion execution_type is pool_initialize", payload.execution_type === "pool_initialize");
  }

  // ---- 2. Redeem each DRT and verify --------------------------------
  // (mint/buy steps depend on the program's buy flow; the driver assumes
  //  the wallet holds one token of each DRT — see local-validator-test.sh)
  for (const [drtType, executionType, payload, code] of [
    ["append", "append", '{"rows":[{"x":1}]}', null],
    ["py_compute_median", "python", "", CODE],
  ] as const) {
    const ephemeral = generateEphemeral();
    const redeemed = await redeemOne(
      program,
      connection,
      wallet,
      poolPda,
      ownershipMint,
      drtType,
      programId,
      memoInstruction(memoFor(ephemeral.publicKey, payload, code))
    );

    const result = await verifyTransaction(redeemed.tx);
    check(`oracle reports ${drtType} redemption`, result.status === 200);
    if (result.status !== 200) continue;

    const assertion = assertionPayload(result.body.assertion);
    check(`${drtType}: execution_type is ${executionType}`, assertion.execution_type === executionType);
    check(`${drtType}: redeemer matches`, assertion.claimant === wallet.publicKey.toBase58());
    check(`${drtType}: pool matches`, assertion.pool === poolPda.toBase58());
    if (code) {
      // The oracle reports the on-chain code identity; the enclave requires
      // it to equal what the memo committed to.
      check("compute: assertion carries the on-chain URL", assertion.github_url === code.githubUrl);
      check("compute: assertion carries the on-chain hash", assertion.code_hash === code.codeHash);
    } else {
      check("append: assertion carries no code reference", assertion.github_url === null);
    }
  }

  // ---- 3. Unknown / non-DRT transactions rejected ---------------------
  const unknown = await verifyTransaction(
    "4".repeat(64) + "5".repeat(24) // syntactically plausible, never sent
  );
  check("unknown transaction rejected", unknown.status >= 400);

  const malformed = await verifyTransaction("not-a-signature");
  check("malformed signature rejected", malformed.status === 400);

  // A transaction that touches only the system program emits no DRT event.
  const transfer = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: wallet.publicKey,
      lamports: 1,
    })
  );
  const plain = await signSendWithMemo(
    connection,
    wallet,
    transfer,
    memoInstruction(memoFor(generateEphemeral().publicKey, "", null))
  );
  const plainResult = await verifyTransaction(plain.tx);
  check("non-DRT transaction rejected", plainResult.status === 409);

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

async function redeemOne(
  program: anchor.Program,
  connection: anchor.web3.Connection,
  wallet: Keypair,
  pool: PublicKey,
  ownershipMint: PublicKey,
  drtType: string,
  programId: PublicKey,
  memoIx: ReturnType<typeof memoInstruction>
) {
  const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } =
    await import("@solana/spl-token");
  const [drtMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("drt_mint"), pool.toBuffer(), Buffer.from(drtType)],
    programId
  );
  const userTokenAccount = await getAssociatedTokenAddress(drtMint, wallet.publicKey);
  const userOwnershipAccount = await getAssociatedTokenAddress(ownershipMint, wallet.publicKey);
  const redeemIx = await program.methods
    .redeemDrt(drtType)
    .accounts({
      pool,
      drtMint,
      ownershipMint,
      user: wallet.publicKey,
      userTokenAccount,
      userOwnershipAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();
  return signSendWithMemo(connection, wallet, new Transaction().add(redeemIx), memoIx);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
