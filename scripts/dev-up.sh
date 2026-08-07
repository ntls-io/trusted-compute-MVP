#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Relational Network

# Bring up the local development stack (NO SGX).
#
# The one thing this script exists to do is wire the oracle key relationship
# that SGX would otherwise enforce by measurement:
#
#   1. generate an Ed25519 seed for the oracle (once, kept in .secrets/)
#   2. derive its public key
#   3. hand the seed to the oracle and the public key to the enclave
#
# In production step 3 happens at image build time and the public key is baked
# into MRENCLAVE, so a host cannot substitute a different oracle. Here it is
# just an environment variable — which is exactly the protection this stack
# does not provide. See sgx-mvp/docker/Dockerfile.dev.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS_DIR="${REPO_ROOT}/.secrets"
SEED_FILE="${SECRETS_DIR}/oracle-key.hex"

cd "${REPO_ROOT}"

log()   { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
fatal() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || fatal "docker is not installed or not on PATH"
docker info >/dev/null 2>&1 || fatal "the Docker daemon is not running — start Docker Desktop first"

PYTHON="$(command -v python3 || true)"
[ -n "${PYTHON}" ] || fatal "python3 is required to derive the oracle public key"

# ---------------------------------------------------------------------------
# 1. Oracle signing key
# ---------------------------------------------------------------------------
mkdir -p "${SECRETS_DIR}"
chmod 700 "${SECRETS_DIR}"

if [ ! -f "${SEED_FILE}" ]; then
    log "generating a development oracle signing key"
    umask 077
    "${PYTHON}" -c 'import secrets; print(secrets.token_hex(32))' > "${SEED_FILE}"
    warn "this key is for local development only — never deploy it"
else
    log "reusing the existing development oracle key (${SEED_FILE})"
fi

ORACLE_SIGNING_KEY_HEX="$(tr -d '[:space:]' < "${SEED_FILE}")"
if ! printf '%s' "${ORACLE_SIGNING_KEY_HEX}" | grep -Eq '^[0-9a-f]{64}$'; then
    fatal "${SEED_FILE} does not contain a 32-byte hex seed. Delete it to regenerate."
fi

# ---------------------------------------------------------------------------
# 2. Derive the public key
# ---------------------------------------------------------------------------
if ! "${PYTHON}" -c 'import nacl' >/dev/null 2>&1; then
    fatal "PyNaCl is required to derive the oracle public key. Install it with:
    pip install pynacl
  (or run: python3 -m venv .venv && .venv/bin/pip install pynacl, then re-run with PYTHON=.venv/bin/python)"
fi

ORACLE_PUBKEY_HEX="$("${PYTHON}" - "${ORACLE_SIGNING_KEY_HEX}" <<'PY'
import sys
from nacl.signing import SigningKey
print(SigningKey(bytes.fromhex(sys.argv[1])).verify_key.encode().hex())
PY
)"

log "oracle public key: ${ORACLE_PUBKEY_HEX}"
echo "    (in production this value is measured into MRENCLAVE; here it is only an env var)"

# ---------------------------------------------------------------------------
# 3. Bring the stack up
# ---------------------------------------------------------------------------
export ORACLE_SIGNING_KEY_HEX ORACLE_PUBKEY_HEX

if [ -f "${REPO_ROOT}/.env.dev" ]; then
    log "loading overrides from .env.dev"
    set -a; . "${REPO_ROOT}/.env.dev"; set +a
fi

if [ "$(uname -m)" = "arm64" ] || [ "$(uname -m)" = "aarch64" ]; then
    warn "arm64 host: the enclave image is linux/amd64 and runs under qemu."
    warn "The first build takes roughly 15-40 minutes; later builds are cached."
fi

log "starting the stack"
docker compose -f docker-compose.dev.yml up --build "$@"
