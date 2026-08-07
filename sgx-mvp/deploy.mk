# Nautilus Trusted Compute
# Copyright (C) 2026 Relational Network

# Oracle trust anchors for the enclave build.
#
# THESE VALUES ARE MEASURED INTO MRENCLAVE. Changing any of them changes the
# enclave measurement, so the change must be reviewed alongside the resulting
# mr_enclave update in measurements.toml.
#
# SPLIT: this file is COMMITTED and holds only public protocol constants. The
# deployment identity — ORACLE_URL and ORACLE_PUBKEY_HEX — lives in
# deploy.local.mk, which is gitignored. Create it from this template:
#
#   cat > deploy.local.mk <<'EOF'
#   ORACLE_URL ?= https://<your-container-app>.azurecontainerapps.io
#   ORACLE_PUBKEY_HEX ?= <64 lowercase hex>
#   EOF
#
# In CI, supply both as GitHub secrets rather than committing them.
#
# TRADE-OFF, so it is a deliberate choice rather than a surprise: because these
# two values are measured into MRENCLAVE, keeping them out of the repo means a
# measurement CANNOT be reproduced from the commit alone — verifying a build
# requires obtaining them out of band. Note also that this gives no
# confidentiality: both are readable from any built image
# (`docker run --entrypoint cat <image> /app/sgx-mvp.manifest`) and the oracle
# public key is served by the live /oracle/v1/health endpoint.
#
# Override on the command line for one-off builds:
#   make docker-build ORACLE_URL=https://staging... ORACLE_PUBKEY_HEX=abc...

# ─────────────────────────────────────────────────────────────────────────────
# ORACLE_URL — base URL of the devops-acr service hosting the oracle router.
# The enclave calls {ORACLE_URL}/oracle/v1/verify-chain-claim. Must be HTTPS.
#
# Find it with:
#   az containerapp show --name relational-devops --resource-group relational-network \
#       --query properties.configuration.ingress.fqdn -o tsv
# ─────────────────────────────────────────────────────────────────────────────
ORACLE_URL ?=https://relational-devops.redacted-for-mvp.westeurope.azurecontainerapps.io

# ─────────────────────────────────────────────────────────────────────────────
# ORACLE_PUBKEY_HEX — Ed25519 PUBLIC key of the oracle, 64 lowercase hex chars.
#
# This is the public half of devops-acr's ORACLE_SIGNING_KEY_HEX secret. The
# enclave verifies every oracle assertion against it and trusts nothing else,
# so pinning it here is what makes a compromised host unable to forge oracle
# approvals.
#
# Read it from the running oracle:
#   curl -s "$(ORACLE_URL)/oracle/v1/health" | python3 -c \
#       'import json,sys; print(json.load(sys.stdin)["oracle_pubkey"])'
#
# Or derive it from the seed directly:
#   python3 -c 'import sys; from nacl.signing import SigningKey; \
#       print(SigningKey(bytes.fromhex(sys.argv[1])).verify_key.encode().hex())' <seed-hex>
#
# Leaving this empty is a hard build error: an unconfigured enclave answers
# every protected request with 503 enclave_unconfigured, which is a confusing
# failure to debug after the fact.
# ─────────────────────────────────────────────────────────────────────────────
ORACLE_PUBKEY_HEX ?=5d4ed56275d9309f1ad9074b2575e216fcfa68297746781a729ed702d62df04b

# ─────────────────────────────────────────────────────────────────────────────
# Chain identity the enclave will accept. Claims naming a different cluster or
# program are rejected in-enclave.
# ─────────────────────────────────────────────────────────────────────────────
SOLANA_CLUSTER ?= devnet
DRT_PROGRAM_ID ?= CME2Dg7UEW82Hf99rQetEi7Hc5Db9JQPx6Azmx1eWbEE
