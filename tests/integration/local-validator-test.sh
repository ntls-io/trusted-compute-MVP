#!/usr/bin/env bash
# Nautilus Trusted Compute
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Orchestrates the local-validator integration test (plan.md test plan).
# Requires: solana-test-validator, anchor CLI, node 20+, python 3.10+,
# a built drt_manager.so (anchor build in trusted-compute-MVP/drt-manager),
# and `pip install -r devops-acr/requirements.txt`.
#
# The chain→oracle path runs for real; the oracle→enclave path is covered
# by mock-oracle unit tests (sgx-mvp/oracle-verify) because the enclave
# needs SGX hardware — the full E2E lives in azure-smoke-test.ts.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
DRT_PROGRAM_ID="CME2Dg7UEW82Hf99rQetEi7Hc5Db9JQPx6Azmx1eWbEE"
ORACLE_PORT=8000
RPC_PORT=8899

cleanup() {
  [[ -n "${VALIDATOR_PID:-}" ]] && kill "$VALIDATOR_PID" 2>/dev/null || true
  [[ -n "${ORACLE_PID:-}" ]] && kill "$ORACLE_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "[1/5] Starting solana-test-validator with the unchanged drt-manager program"
solana-test-validator --reset --quiet \
  --bpf-program "$DRT_PROGRAM_ID" "$REPO_ROOT/drt-manager/target/deploy/drt_manager.so" &
VALIDATOR_PID=$!
sleep 8

echo "[2/5] Funding the test wallet"
export ANCHOR_WALLET="${ANCHOR_WALLET:-$HOME/.config/solana/id.json}"
solana airdrop 10 --url "http://127.0.0.1:$RPC_PORT" >/dev/null

echo "[3/5] Starting the oracle against the local validator"
ORACLE_SEED_HEX=$(python3 -c "import secrets; print(secrets.token_hex(32))")
(
  cd "$REPO_ROOT/../devops-acr" &&
  SOLANA_RPC_URL="http://127.0.0.1:$RPC_PORT" \
  SOLANA_CLUSTER=localnet \
  DRT_PROGRAM_ID="$DRT_PROGRAM_ID" \
  ORACLE_SIGNING_KEY_HEX="$ORACLE_SEED_HEX" \
  python3 -m uvicorn app:app --port "$ORACLE_PORT" &
)
ORACLE_PID=$!
sleep 5
curl -sf "http://127.0.0.1:$ORACLE_PORT/oracle/v1/health" | grep -q '"signing_key_ok":true'

echo "[4/5] Installing driver dependencies"
cd "$HERE"
npm install --no-audit --no-fund @solana/spl-token >/dev/null
npm install --no-audit --no-fund >/dev/null

echo "[5/5] Running the integration driver"
SOLANA_RPC_URL="http://127.0.0.1:$RPC_PORT" \
SOLANA_CLUSTER=localnet \
DRT_PROGRAM_ID="$DRT_PROGRAM_ID" \
ORACLE_URL="http://127.0.0.1:$ORACLE_PORT" \
npx tsx local-validator-test.ts
