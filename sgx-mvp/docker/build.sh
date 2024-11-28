#!/usr/bin/env bash
set -euo pipefail

usage() {
    echo "Usage: build.sh [ubuntu20,ubuntu22]"
    exit 1
}

if [ $# -ne 1 ]; then
    usage
fi

image=""
codename=""
key_path="../keys/enclave-key.pem"

case "$1" in
    ubuntu20)
        image="ubuntu:20.04"
        codename="focal"
        ;;
    ubuntu22)
        image="ubuntu:22.04"
        codename="jammy"
        ;;
    *)
        usage
        ;;
esac

# Check if key exists
if [ ! -f "$key_path" ]; then
    echo "No signing key found at $key_path"
    echo "For development:"
    echo "    gramine-sgx-gen-private-key /keys/enclave-key.pem"
    echo "For production:"
    echo "    Please use your production signing key"
    exit 1
fi

# Build the image, mounting the key at build time
docker build \
    --build-arg UBUNTU_IMAGE="${image}" \
    --build-arg UBUNTU_CODENAME="${codename}" \
    --secret id=enclave_key,src="$key_path" \
    -t sgx-mvp:stable-"${codename}" \
    .

echo "Build complete!"