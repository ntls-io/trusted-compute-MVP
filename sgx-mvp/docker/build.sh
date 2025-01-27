#!/usr/bin/env bash
# Nautilus Trusted Compute
# Copyright (C) 2025 Nautilus
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

set -euo pipefail

usage() {
    echo "Usage: build.sh [ubuntu20,ubuntu22]"
    echo ""
    echo "Before building, ensure you have:"
    echo "1. Generated your Gramine signing key at /keys/enclave-key.pem"
    echo "2. Set proper permissions (chmod 400) on your key"
    echo ""
    echo "To generate a development key (if you haven't already):"
    echo "    gramine-sgx-gen-private-key /keys/enclave-key.pem"
    echo "    chmod 400 /keys/enclave-key.pem"
    echo ""
    echo "Note: For production deployments, use your production signing key."
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
    echo ""
    echo "For development environments:"
    echo "    gramine-sgx-gen-private-key /keys/enclave-key.pem"
    echo "    chmod 400 /keys/enclave-key.pem"
    echo ""
    echo "For production environments:"
    echo "    Please use your secure production signing key"
    echo "    Copy it to /keys/enclave-key.pem"
    echo "    Ensure permissions are set with: chmod 400 /keys/enclave-key.pem"
    exit 1
fi

# Build the image, mounting the key at build time
docker build \
    --build-arg UBUNTU_IMAGE="${image}" \
    --build-arg UBUNTU_CODENAME="${codename}" \
    --secret id=enclave_key,src="$key_path" \
    -t sgx-mvp:stable-"${codename}" \
    .

# Extract the sig file using a temporary container
container_id=$(docker create sgx-mvp:stable-"${codename}")
docker cp "$container_id":/app/trusted-compute-MVP/sgx-mvp/sgx-mvp.sig docker-sgx-mvp.sig
docker rm "$container_id"

echo "Build complete!"