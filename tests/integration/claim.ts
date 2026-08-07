/**
 * Nautilus Trusted Compute
 * Copyright (C) 2026 Relational Network
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// tests/integration/claim.ts
//
// Canonical chain-claim helpers for the integration drivers. Mirrors
// ntc-web/lib/enclaveClaim.ts, devops-acr/oracle/canonical.py, and
// sgx-mvp/oracle-verify/src/canonical.rs.
import { createHash, randomBytes } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

export const CLAIM_DOMAIN_PREFIX = "relational-chain-claim:v1\n";

export type ChainClaim = Record<string, string>;

export function canonicalClaimJson(claim: ChainClaim): string {
  const keys = Object.keys(claim).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${JSON.stringify(claim[key])}`)
    .join(",")}}`;
}

export function claimMessageBytes(claim: ChainClaim): Uint8Array {
  return new TextEncoder().encode(CLAIM_DOMAIN_PREFIX + canonicalClaimJson(claim));
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export interface BuildClaimParams {
  action: "pool_initialize" | "append" | "execute_wasm" | "execute_python";
  cluster: string;
  program: string;
  tx: string;
  pool: string;
  claimant: string;
  payload: string;
  githubUrl?: string;
  codeHash?: string;
  expiry?: string;
}

export function buildClaim(params: BuildClaimParams): ChainClaim {
  const claim: ChainClaim = {
    version: "1",
    action: params.action,
    cluster: params.cluster,
    program: params.program,
    tx: params.tx,
    pool: params.pool,
    claimant: params.claimant,
    payload_sha256: sha256Hex(params.payload),
    nonce: randomBytes(16).toString("hex"),
    expiry: params.expiry ?? String(Math.floor(Date.now() / 1000) + 600),
  };
  if (params.action === "execute_wasm" || params.action === "execute_python") {
    if (!params.githubUrl || !params.codeHash) {
      throw new Error("compute claims need githubUrl and codeHash");
    }
    claim.github_url = params.githubUrl;
    claim.code_hash = params.codeHash;
  }
  return claim;
}

export function signClaim(keypair: Keypair, claim: ChainClaim): string {
  const signature = nacl.sign.detached(
    claimMessageBytes(claim),
    keypair.secretKey
  );
  return bs58.encode(signature);
}
