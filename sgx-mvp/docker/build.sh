#!/usr/bin/env bash
# Nautilus Trusted Compute
# Copyright (C) 2026 Relational Network
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

# Build a deterministic, signed SGX Docker image for sgx-mvp.
#
# Usage:
#   ./build.sh ubuntu20
#   SGX_SIGNING_KEY=/path/to/key.pem ./build.sh ubuntu20
#   UBUNTU_SNAPSHOT=20260210T000000Z ./build.sh ubuntu20
#
# The oracle trust anchors measured into MRENCLAVE come from ../deploy.mk and
# are normally supplied by `make docker-build`. When running this script
# directly, export them first:
#   ORACLE_URL=https://... ORACLE_PUBKEY_HEX=<64 hex> ./build.sh ubuntu20
#
# The signing key is injected as a BuildKit --secret and is NEVER stored in any
# image layer. The resulting image has a deterministic MRENCLAVE that can be
# verified with `make verify-mrenclave`.

set -euo pipefail

usage() {
    echo "Usage: build.sh ubuntu20"
    exit 1
}

if [ $# -ne 1 ]; then
    usage
fi

codename=""

case "$1" in
    ubuntu20)
        codename="focal"
        ;;
    *)
        usage
        ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "${SCRIPT_DIR}")"

# Oracle trust anchors. These are measured into MRENCLAVE; an empty public key
# builds an enclave that rejects every protected request with 503
# enclave_unconfigured, so fail before spending the build. Checked first
# because it is the more common misconfiguration.
if [ -z "${ORACLE_URL:-}" ]; then
    echo "error: ORACLE_URL is not set." >&2
    echo "Set it in ${PROJECT_DIR}/deploy.mk and build with 'make docker-build'," >&2
    echo "or export ORACLE_URL before running this script." >&2
    exit 1
fi

if ! printf '%s' "${ORACLE_PUBKEY_HEX:-}" | grep -Eq '^[0-9a-f]{64}$'; then
    echo "error: ORACLE_PUBKEY_HEX must be 64 lowercase hex characters." >&2
    echo "Got: '${ORACLE_PUBKEY_HEX:-<unset>}'" >&2
    echo "This is the Ed25519 PUBLIC key of the oracle signing key. Read it from" >&2
    echo "the running oracle with:" >&2
    echo "  curl -s \"${ORACLE_URL}/oracle/v1/health\" | python3 -c 'import json,sys; print(json.load(sys.stdin)[\"oracle_pubkey\"])'" >&2
    exit 1
fi

# Resolve signing key. Default to $HOME/.config/gramine/enclave-key.pem. When
# running under sudo, $HOME is /root — fall back to SUDO_USER's home so the
# user's existing key is picked up automatically.
if [ -z "${SGX_SIGNING_KEY:-}" ]; then
    if [ -n "${SUDO_USER:-}" ]; then
        _home=$(getent passwd "${SUDO_USER}" | cut -d: -f6)
    else
        _home="${HOME}"
    fi
    SGX_KEY="${_home}/.config/gramine/enclave-key.pem"
else
    SGX_KEY="${SGX_SIGNING_KEY}"
fi

if [ ! -f "${SGX_KEY}" ]; then
    echo "error: SGX signing key not found at ${SGX_KEY}" >&2
    echo "Generate one with: gramine-sgx-gen-private-key ${SGX_KEY}" >&2
    echo "Or set SGX_SIGNING_KEY=/path/to/key" >&2
    exit 1
fi

SOLANA_CLUSTER="${SOLANA_CLUSTER:-devnet}"
DRT_PROGRAM_ID="${DRT_PROGRAM_ID:-CME2Dg7UEW82Hf99rQetEi7Hc5Db9JQPx6Azmx1eWbEE}"
IMAGE_TAG="${IMAGE_TAG:-relationalnetwork/sgx-mvp:${codename}}"

echo "Using SGX signing key: ${SGX_KEY}"
echo "MRENCLAVE and MRSIGNER will be baked into the image."
echo "Building for platform: linux/amd64"
echo "Oracle URL:      ${ORACLE_URL}"
echo "Oracle pubkey:   ${ORACLE_PUBKEY_HEX}"
echo "Solana cluster:  ${SOLANA_CLUSTER}"
echo "DRT program:     ${DRT_PROGRAM_ID}"
if [ -n "${UBUNTU_SNAPSHOT:-}" ]; then
    echo "Ubuntu snapshot: ${UBUNTU_SNAPSHOT}"
fi

extra_build_args=()
if [ -n "${UBUNTU_SNAPSHOT:-}" ]; then
    extra_build_args+=(--build-arg "UBUNTU_SNAPSHOT=${UBUNTU_SNAPSHOT}")
fi

DOCKER_BUILDKIT=1 docker build \
    --platform linux/amd64 \
    --build-arg UBUNTU_CODENAME="${codename}" \
    --build-arg ORACLE_URL="${ORACLE_URL}" \
    --build-arg ORACLE_PUBKEY_HEX="${ORACLE_PUBKEY_HEX}" \
    --build-arg SOLANA_CLUSTER="${SOLANA_CLUSTER}" \
    --build-arg DRT_PROGRAM_ID="${DRT_PROGRAM_ID}" \
    ${extra_build_args[@]+"${extra_build_args[@]}"} \
    --secret id=sgx-key,src="${SGX_KEY}" \
    -t "${IMAGE_TAG}" \
    -f "${SCRIPT_DIR}/Dockerfile" \
    "${PROJECT_DIR}"
