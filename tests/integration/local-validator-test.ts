/**
 * Nautilus Trusted Compute
 * Copyright (C) 2026 Relational Network
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// tests/integration/local-validator-test.ts
//
// Local-validator integration test (plan.md test plan) using the UNCHANGED
// Anchor program:
//   1. create a correctly configured pool (compute DRTs carry real
//      URL/hash metadata on-chain),
//   2. redeem each DRT type,
//   3. confirm the oracle authorizes exactly one operation per redemption
//      (a second identical verify succeeds — statelessness is the enclave's
//      replay ledger's job — but altered payload/code metadata is rejected,
//      and unredeemed/forged claims are rejected).
//
// The oracle→enclave half is covered by the mock-oracle unit tests in
// sgx-mvp/oracle-verify; full end-to-end runs on Azure SGX hardware via
// azure-smoke-test.ts.
//
// Prerequisites (run local-validator-test.sh to orchestrate):
//   - solana-test-validator with drt_manager.so deployed at DRT_PROGRAM_ID
//   - the oracle running with SOLANA_RPC_URL=http://127.0.0.1:8899,
//     SOLANA_CLUSTER=localnet, and a test ORACLE_SIGNING_KEY_HEX
//   - env: ORACLE_URL (default http://127.0.0.1:8000), ANCHOR_WALLET
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { buildClaim, signClaim, sha256Hex, type ChainClaim } from "./claim.js";
import { readFileSync } from "node:fs";

const ORACLE_URL = process.env.ORACLE_URL ?? "http://127.0.0.1:8000";
const RPC_URL = process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
const CLUSTER = process.env.SOLANA_CLUSTER ?? "localnet";
const PROGRAM_ID = process.env.DRT_PROGRAM_ID ?? "CME2Dg7UEW82Hf99rQetEi7Hc5Db9JQPx6Azmx1eWbEE";
const IDL_PATH = process.env.DRT_IDL_PATH ?? "../../drt-manager/target/idl/drt_manager.json";

const GITHUB_URL = "https://github.com/ntls-io/python-scripts/blob/main/calculate_mean.py";
const CODE_HASH = process.env.TEST_CODE_HASH ?? "a".repeat(64);

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function verifyChainClaim(claim: ChainClaim, walletSignature: string) {
  const response = await fetch(`${ORACLE_URL}/oracle/v1/verify-chain-claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claim, wallet_signature: walletSignature }),
  });
  return { status: response.status, body: await response.json() };
}

async function main() {
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

  const createTx = await program.methods
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
    .rpc({ commitment: "finalized" });
  console.log("pool created:", poolPda.toBase58(), createTx);

  // pool_initialize claim verifies against the PoolCreated event
  const initPayload = JSON.stringify({ schema: { type: "object" }, data: { rows: [] } });
  const initClaim = buildClaim({
    action: "pool_initialize", cluster: CLUSTER, program: PROGRAM_ID,
    tx: createTx, pool: poolPda.toBase58(),
    claimant: wallet.publicKey.toBase58(), payload: initPayload,
  });
  const initResult = await verifyChainClaim(initClaim, signClaim(wallet, initClaim));
  check("oracle authorizes pool_initialize", initResult.status === 200, JSON.stringify(initResult.body).slice(0, 120));

  // ---- 2. Redeem each DRT and verify --------------------------------
  // (mint/buy steps depend on the program's buy flow; the driver assumes
  //  the wallet holds one token of each DRT — see local-validator-test.sh)
  for (const [drtType, action, payload, extra] of [
    ["append", "append", '{"rows":[{"x":1}]}', {}],
    ["py_compute_median", "execute_python", "", { githubUrl: GITHUB_URL, codeHash: CODE_HASH }],
  ] as const) {
    const redeemTx = await redeemOne(program, wallet, poolPda, ownershipMint, drtType, programId);
    const claim = buildClaim({
      action, cluster: CLUSTER, program: PROGRAM_ID, tx: redeemTx,
      pool: poolPda.toBase58(), claimant: wallet.publicKey.toBase58(),
      payload, ...extra,
    });
    const ok = await verifyChainClaim(claim, signClaim(wallet, claim));
    check(`oracle authorizes ${action}`, ok.status === 200);

    // Altered payload must be rejected (signature no longer matches).
    const tampered = { ...claim, payload_sha256: sha256Hex("tampered") };
    const tamperedResult = await verifyChainClaim(tampered, signClaim(wallet, claim));
    check(`altered payload rejected for ${action}`, tamperedResult.status === 400);

    if (action === "execute_python") {
      // Altered code metadata (resigned by the claimant) must be rejected
      // against the on-chain event.
      const wrongCode = { ...claim, code_hash: "b".repeat(64) };
      const wrongResult = await verifyChainClaim(wrongCode, signClaim(wallet, wrongCode));
      check("altered code metadata rejected", wrongResult.status === 409);
    }
  }

  // ---- 3. Unredeemed transaction rejected -----------------------------
  const bogus = buildClaim({
    action: "append", cluster: CLUSTER, program: PROGRAM_ID,
    tx: "5".repeat(87).slice(0, 87), pool: poolPda.toBase58(),
    claimant: wallet.publicKey.toBase58(), payload: "{}",
  });
  const bogusResult = await verifyChainClaim(bogus, signClaim(wallet, bogus));
  check("unknown transaction rejected", bogusResult.status >= 400);

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

async function redeemOne(
  program: anchor.Program,
  wallet: Keypair,
  pool: PublicKey,
  ownershipMint: PublicKey,
  drtType: string,
  programId: PublicKey
): Promise<string> {
  const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } =
    await import("@solana/spl-token");
  const [drtMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("drt_mint"), pool.toBuffer(), Buffer.from(drtType)],
    programId
  );
  const userTokenAccount = await getAssociatedTokenAddress(drtMint, wallet.publicKey);
  const userOwnershipAccount = await getAssociatedTokenAddress(ownershipMint, wallet.publicKey);
  return program.methods
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
    .rpc({ commitment: "finalized" });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
