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

ARG UBUNTU_IMAGE=ubuntu:20.04
ARG UBUNTU_CODENAME=focal

################################
# STAGE 1 — BUILDER
################################
FROM ${UBUNTU_IMAGE} AS builder
ARG UBUNTU_CODENAME

ENV DEBIAN_FRONTEND=noninteractive
ENV CC=clang
ENV CXX=clang++

# Build-time dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gnupg2 \
    binutils \
    git \
    make \
    cmake \
    clang \
    llvm \
    pkg-config \
    ca-certificates \
    python3.8-dev \
    python3-numpy \
    python3-scipy \
    libffi-dev \
    libssl-dev \
    software-properties-common \
    && rm -rf /var/lib/apt/lists/*

# Gramine repo
RUN curl -fsSLo /usr/share/keyrings/gramine-keyring.gpg \
      https://packages.gramineproject.io/gramine-keyring.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/gramine-keyring.gpg] \
      https://packages.gramineproject.io/ ${UBUNTU_CODENAME} main" \
      > /etc/apt/sources.list.d/gramine.list

# Intel SGX repo
RUN curl -fsSLo /usr/share/keyrings/intel-sgx-deb.key \
      https://download.01.org/intel-sgx/sgx_repo/ubuntu/intel-sgx-deb.key && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/intel-sgx-deb.key] \
      https://download.01.org/intel-sgx/sgx_repo/ubuntu ${UBUNTU_CODENAME} main" \
      > /etc/apt/sources.list.d/intel-sgx.list

# Microsoft repo (Azure DCAP)
RUN curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor \
      > /usr/share/keyrings/microsoft-prod.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] \
      https://packages.microsoft.com/ubuntu/20.04/prod focal main" \
      > /etc/apt/sources.list.d/microsoft-prod.list

# Gramine (build-time, pinned)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gramine=1.8* \
    && rm -rf /var/lib/apt/lists/*

# Rust toolchain (builder only)
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Clone only sgx-mvp
WORKDIR /build
RUN git clone --depth 1 --filter=blob:none \
    https://github.com/ntls-io/trusted-compute-MVP.git && \
    cd trusted-compute-MVP && \
    git sparse-checkout init --cone && \
    git sparse-checkout set sgx-mvp

# Required lib path workaround
RUN mkdir -p /lib/x86_64-pc-linux-gnu && \
    ln -s /lib/x86_64-linux-gnu/* /lib/x86_64-pc-linux-gnu/

# Build enclave (key mounted temporarily)
RUN --mount=type=secret,id=enclave_key,target=/build/trusted-compute-MVP/sgx-mvp/keys/enclave-key.pem \
    cd /build/trusted-compute-MVP/sgx-mvp && \
    make SGX=1 RA_TYPE=dcap

################################
# STAGE 2 — RUNTIME
################################
FROM ${UBUNTU_IMAGE} AS runtime
ARG UBUNTU_CODENAME

ENV DEBIAN_FRONTEND=noninteractive

# Minimal bootstrap tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gnupg2 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Gramine repo
RUN curl -fsSLo /usr/share/keyrings/gramine-keyring.gpg \
      https://packages.gramineproject.io/gramine-keyring.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/gramine-keyring.gpg] \
      https://packages.gramineproject.io/ ${UBUNTU_CODENAME} main" \
      > /etc/apt/sources.list.d/gramine.list

# Intel SGX repo
RUN curl -fsSLo /usr/share/keyrings/intel-sgx-deb.key \
      https://download.01.org/intel-sgx/sgx_repo/ubuntu/intel-sgx-deb.key && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/intel-sgx-deb.key] \
      https://download.01.org/intel-sgx/sgx_repo/ubuntu ${UBUNTU_CODENAME} main" \
      > /etc/apt/sources.list.d/intel-sgx.list

# Microsoft repo (Azure DCAP)
RUN curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor \
      > /usr/share/keyrings/microsoft-prod.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] \
      https://packages.microsoft.com/ubuntu/20.04/prod focal main" \
      > /etc/apt/sources.list.d/microsoft-prod.list

# Runtime dependencies (FULL Python + NumPy + SciPy)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gramine=1.8* \
    sgx-aesm-service \
    libsgx-aesm-launch-plugin \
    libsgx-aesm-epid-plugin \
    libsgx-aesm-quote-ex-plugin \
    libsgx-aesm-ecdsa-plugin \
    libsgx-dcap-quote-verify \
    az-dcap-client \
    python3.8 \
    python3-numpy \
    python3-scipy \
    libpython3.8 \
    psmisc \
    socat \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Required lib path workaround (runtime)
RUN mkdir -p /lib/x86_64-pc-linux-gnu && \
    ln -s /lib/x86_64-linux-gnu/* /lib/x86_64-pc-linux-gnu/

# Runtime dirs
RUN mkdir -p /var/run/aesmd/

# Copy built artifacts
COPY --from=builder /build/trusted-compute-MVP/sgx-mvp /app/sgx-mvp

COPY restart_aesm.sh /restart_aesm.sh
RUN chmod +x /restart_aesm.sh

RUN echo '#!/bin/sh\n\
/restart_aesm.sh\n\
socat TCP-LISTEN:8081,fork TCP:127.0.0.1:8080 &\n\
cd /app/sgx-mvp && exec gramine-sgx sgx-mvp\n' \
> /start.sh && chmod +x /start.sh

WORKDIR /app/sgx-mvp
EXPOSE 8080
ENV HOST=127.0.0.1
ENV PORT=8080

ENTRYPOINT ["/start.sh"]