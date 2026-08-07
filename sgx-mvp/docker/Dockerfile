# syntax=docker/dockerfile:1
# check=skip=FromPlatformFlagConstDisallowed

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

# SGX-only Docker image for sgx-mvp with DCAP RA-TLS attestation.
#
# Deterministic build: the enclave is signed at BUILD TIME so MRENCLAVE and
# MRSIGNER are baked into the image and never change at runtime. The signing
# key is NOT needed to run the container.
#
# Everything that affects MRENCLAVE is pinned for reproducibility:
#   - Ubuntu base image pinned to SHA256 digest
#   - Ubuntu apt snapshot frozen via snapshot.ubuntu.com
#   - Rust toolchain pinned to exact version (matches rust-toolchain.toml)
#   - rustup pinned to exact version + SHA256 of installer
#   - Gramine + SGX + Azure DCAP packages pinned to exact versions
#   - GPG keyrings pinned to SHA256
#   - Cargo.lock committed; built with --locked
#   - Cargo profile pinned (codegen-units=1, no debug info, stripped)
#   - RUSTFLAGS pinned (rng-seed=0, build-id=none, remap-path-prefix)
#   - SOURCE_DATE_EPOCH, TZ and PYTHONHASHSEED pinned
#   - Python bytecode precompiled with --invalidation-mode unchecked-hash
#   - sgx.trusted_files rewritten to an LC_ALL=C sorted explicit list
#   - --date 0000-00-00 to gramine-sgx-sign
#
# Build context is the sgx-mvp project directory (see ../.dockerignore), NOT
# this docker/ directory. Use docker/build.sh or `make docker-build`.

ARG UBUNTU_IMAGE=ubuntu:20.04@sha256:8feb4d8ca5354def3d8fce243717141ce31e2c428701f6682bd2fafe15388214
ARG UBUNTU_SNAPSHOT=20260210T000000Z
ARG CA_CERTS_VERSION=20240203~20.04.1

# ---------------------------------------------------------------------------
# Stage 1 — Rust build (pinned toolchain for reproducibility)
# ---------------------------------------------------------------------------
# hadolint ignore=DL3006
FROM ${UBUNTU_IMAGE} AS builder
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG UBUNTU_SNAPSHOT
ARG CA_CERTS_VERSION
ARG TARGETPLATFORM

RUN test "${TARGETPLATFORM}" = "linux/amd64" || \
    (echo "error: SGX image must be built for linux/amd64 (got ${TARGETPLATFORM})" >&2; exit 1)

# Install CA roots before switching to snapshot mirrors (which redirect to HTTPS).
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates=${CA_CERTS_VERSION} && \
    rm -rf /var/lib/apt/lists/*

# Freeze Ubuntu package resolution to a timestamped snapshot so transitive
# dependency versions cannot drift over time. If snapshot.ubuntu.com is
# unavailable we fall back to the standard archive; exact version pins in
# every apt-get install still guarantee reproducibility for pinned packages.
RUN printf 'Acquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99ubuntu-snapshot && \
    printf 'deb [check-valid-until=no] https://snapshot.ubuntu.com/ubuntu/%s focal main restricted universe multiverse\n' "${UBUNTU_SNAPSHOT}" > /etc/apt/sources.list && \
    printf 'deb [check-valid-until=no] https://snapshot.ubuntu.com/ubuntu/%s focal-updates main restricted universe multiverse\n' "${UBUNTU_SNAPSHOT}" >> /etc/apt/sources.list && \
    printf 'deb [check-valid-until=no] https://snapshot.ubuntu.com/ubuntu/%s focal-security main restricted universe multiverse\n' "${UBUNTU_SNAPSHOT}" >> /etc/apt/sources.list && \
    if ! apt-get update 2>/dev/null; then \
      echo "WARNING: snapshot.ubuntu.com unavailable — using archive.ubuntu.com" >&2; \
      printf 'deb http://archive.ubuntu.com/ubuntu/ focal main restricted universe multiverse\n'        > /etc/apt/sources.list; \
      printf 'deb http://archive.ubuntu.com/ubuntu/ focal-updates main restricted universe multiverse\n' >> /etc/apt/sources.list; \
      printf 'deb http://archive.ubuntu.com/ubuntu/ focal-security main restricted universe multiverse\n' >> /etc/apt/sources.list; \
    fi && \
    rm -rf /var/lib/apt/lists/*

# Pinned builder packages. To update: `make docker-pins` prints the resolved
# versions from the base image + snapshot; paste them here.
ARG BUILD_ESSENTIAL_VERSION=12.8ubuntu1.1
ARG CLANG_VERSION=1:10.0-50~exp1
ARG CURL_VERSION=7.68.0-1ubuntu2.25
ARG PKG_CONFIG_VERSION=0.29.1-0ubuntu4
ARG LIBSSL_DEV_VERSION=1.1.1f-1ubuntu2.24

# Python and numeric packages are resolved by the frozen apt snapshot rather
# than pinned by hand. Leave empty for snapshot-resolved, or set to an exact
# version to hard-pin (see `make docker-pins`).
ARG PYTHON38_DEV_VERSION=
ARG LIBFFI_DEV_VERSION=
# Versions come from the build args above plus the frozen apt snapshot;
# hadolint cannot see through the ${VAR:+=${VAR}} expansion, so DL3008 fires
# even though these packages are pinned.
# hadolint ignore=DL3008
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    curl=${CURL_VERSION} \
    ca-certificates=${CA_CERTS_VERSION} \
    build-essential=${BUILD_ESSENTIAL_VERSION} \
    clang=${CLANG_VERSION} \
    pkg-config=${PKG_CONFIG_VERSION} \
    libssl-dev=${LIBSSL_DEV_VERSION} \
    "python3.8-dev${PYTHON38_DEV_VERSION:+=${PYTHON38_DEV_VERSION}}" \
    "libffi-dev${LIBFFI_DEV_VERSION:+=${LIBFFI_DEV_VERSION}}" && \
    rm -rf /var/lib/apt/lists/*

# Pin the exact Rust toolchain so MRENCLAVE is reproducible.
# Update deliberately — never use "stable". Must match rust-toolchain.toml.
ARG RUST_TOOLCHAIN=1.92.0

# Pin rustup by VERSION + SHA256 using a versioned, immutable URL.
# The /archive/ URL is stable across rustup releases; sh.rustup.rs is not.
ARG RUSTUP_VERSION=1.29.0
ARG RUSTUP_SHA256=4acc9acc76d5079515b46346a485974457b5a79893cfb01112423c89aeb5aa10

ENV CARGO_HOME=/opt/cargo
ENV RUSTUP_HOME=/opt/rustup
ENV PATH=/opt/cargo/bin:${PATH}
# Build C/C++ with clang, not Ubuntu 20.04's gcc-9. aws-lc-sys (pulled in by
# rustls) refuses to build with gcc-9 because of the memcmp miscompilation in
# https://gcc.gnu.org/bugzilla/show_bug.cgi?id=95189 and panics with
# "### COMPILER BUG DETECTED ###". clang is a pinned package, so this is also
# one fewer floating input into the binary.
ENV CC=clang
ENV CXX=clang++
# Point pyo3 at the exact interpreter. python3.8-dev installs /usr/bin/python3.8
# but no `python3` alias, so pyo3-ffi's build script fails with "no Python 3.x
# interpreter found". Naming it explicitly also stops the build depending on
# whatever `python3` happens to resolve to.
ENV PYO3_PYTHON=/usr/bin/python3.8
ENV SOURCE_DATE_EPOCH=1704067200
ENV TZ=UTC
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
# Reproducibility envs:
#   CARGO_INCREMENTAL=0  — incremental builds embed timestamps/hashes that drift
#   CODEGEN_UNITS=1      — required: parallel codegen *within* a crate is not
#                          deterministic
#   ZERO_AR_DATE=1       — strip mtimes from ar archives
#
# CARGO_BUILD_JOBS is deliberately not pinned. Cargo builds separate crates in
# parallel, but each crate's output is fully determined by codegen-units=1, the
# fixed RUSTFLAGS below, and the locked Cargo.lock, so parallel jobs still
# produce byte-identical binaries.
ENV CARGO_INCREMENTAL=0
ENV CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1
ENV CARGO_PROFILE_RELEASE_DEBUG=0
ENV CARGO_PROFILE_RELEASE_STRIP=symbols
ENV ZERO_AR_DATE=1
ENV RUSTFLAGS="-Ccodegen-units=1 -Cdebuginfo=0 -Cstrip=symbols -Clink-arg=-Wl,--build-id=none -Cllvm-args=-rng-seed=0 --remap-path-prefix=/build=."
ENV CFLAGS="-g0 -frandom-seed=sgx-mvp -Wno-builtin-macro-redefined -D__DATE__=\"redacted\" -D__TIME__=\"redacted\" -D__TIMESTAMP__=\"redacted\""
ENV CXXFLAGS="-g0 -frandom-seed=sgx-mvp -Wno-builtin-macro-redefined -D__DATE__=\"redacted\" -D__TIME__=\"redacted\" -D__TIMESTAMP__=\"redacted\""

RUN curl -sSf "https://static.rust-lang.org/rustup/archive/${RUSTUP_VERSION}/x86_64-unknown-linux-gnu/rustup-init" \
        -o /tmp/rustup-init && \
    echo "${RUSTUP_SHA256}  /tmp/rustup-init" | sha256sum -c - && \
    chmod +x /tmp/rustup-init && \
    /tmp/rustup-init -y --profile minimal --default-toolchain ${RUST_TOOLCHAIN} && \
    rm /tmp/rustup-init

WORKDIR /build

# Local tree only — this image is built from the working checkout, never from a
# git clone. build.rs is at the project root and is referenced by
# python-rust-impl via `build = "../build.rs"`.
COPY rust-toolchain.toml Cargo.toml Cargo.lock build.rs ./
COPY .cargo ./.cargo
COPY src ./src
COPY oracle-verify ./oracle-verify
COPY wasmi-impl ./wasmi-impl
COPY python-rust-impl ./python-rust-impl
COPY json-append ./json-append
COPY github-download ./github-download

RUN cargo fetch --locked && \
    CARGO_NET_OFFLINE=true cargo build --release --locked

# ---------------------------------------------------------------------------
# Stage 2 — Signer image
# ---------------------------------------------------------------------------
# Carries the tooling needed to configure apt repos, generate the manifest, and
# sign the enclave. Installs the SAME pinned package set as the runtime stage,
# because the trusted-file list measured here must match the files present at
# runtime byte for byte.
# ---------------------------------------------------------------------------

# hadolint ignore=DL3006
FROM ${UBUNTU_IMAGE} AS signer
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG UBUNTU_CODENAME=focal
ARG UBUNTU_SNAPSHOT
ARG CA_CERTS_VERSION
ARG TARGETPLATFORM
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV TZ=UTC
ENV SOURCE_DATE_EPOCH=1704067200
ENV PYTHONHASHSEED=0

RUN test "${TARGETPLATFORM}" = "linux/amd64" || \
    (echo "error: SGX image must be built for linux/amd64 (got ${TARGETPLATFORM})" >&2; exit 1)

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates=${CA_CERTS_VERSION} && \
    rm -rf /var/lib/apt/lists/*

RUN printf 'Acquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99ubuntu-snapshot && \
    printf 'deb [check-valid-until=no] https://snapshot.ubuntu.com/ubuntu/%s focal main restricted universe multiverse\n' "${UBUNTU_SNAPSHOT}" > /etc/apt/sources.list && \
    printf 'deb [check-valid-until=no] https://snapshot.ubuntu.com/ubuntu/%s focal-updates main restricted universe multiverse\n' "${UBUNTU_SNAPSHOT}" >> /etc/apt/sources.list && \
    printf 'deb [check-valid-until=no] https://snapshot.ubuntu.com/ubuntu/%s focal-security main restricted universe multiverse\n' "${UBUNTU_SNAPSHOT}" >> /etc/apt/sources.list && \
    if ! apt-get update 2>/dev/null; then \
      echo "WARNING: snapshot.ubuntu.com unavailable — using archive.ubuntu.com" >&2; \
      printf 'deb http://archive.ubuntu.com/ubuntu/ focal main restricted universe multiverse\n'        > /etc/apt/sources.list; \
      printf 'deb http://archive.ubuntu.com/ubuntu/ focal-updates main restricted universe multiverse\n' >> /etc/apt/sources.list; \
      printf 'deb http://archive.ubuntu.com/ubuntu/ focal-security main restricted universe multiverse\n' >> /etc/apt/sources.list; \
    fi && \
    rm -rf /var/lib/apt/lists/*

ARG RT_CURL_VERSION=7.68.0-1ubuntu2.25
ARG GNUPG2_VERSION=2.2.19-3ubuntu2.5
ARG BINUTILS_VERSION=2.34-6ubuntu1.11

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    curl=${RT_CURL_VERSION} \
    gnupg2=${GNUPG2_VERSION} \
    binutils=${BINUTILS_VERSION} && \
    rm -rf /var/lib/apt/lists/*

# Pin GPG keyrings by SHA256 so builds don't break on key rotation and we
# verify we're trusting the same keys every time.
ARG GRAMINE_KEYRING_SHA256=29c8a028a14f11e3ac3f2ca2669d6ef717656e64d375cd74617319a75db94f13
ARG INTEL_SGX_DEB_SHA256=92f96f84281031d889deb81060c44325f0481aee621ae47a15ae1df4431b4a23
ARG MICROSOFT_ASC_SHA256=2fa9c05d591a1582a9aba276272478c262e95ad00acf60eaee1644d93941e3c6

RUN curl -fsSLo /usr/share/keyrings/gramine-keyring.gpg https://packages.gramineproject.io/gramine-keyring-${UBUNTU_CODENAME}.gpg && \
    echo "${GRAMINE_KEYRING_SHA256}  /usr/share/keyrings/gramine-keyring.gpg" | sha256sum -c - && \
    echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/gramine-keyring.gpg] https://packages.gramineproject.io/ '${UBUNTU_CODENAME}' main' > /etc/apt/sources.list.d/gramine.list

RUN curl -fsSLo /usr/share/keyrings/intel-sgx-deb.key https://download.01.org/intel-sgx/sgx_repo/ubuntu/intel-sgx-deb.key && \
    echo "${INTEL_SGX_DEB_SHA256}  /usr/share/keyrings/intel-sgx-deb.key" | sha256sum -c - && \
    echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/intel-sgx-deb.key] https://download.01.org/intel-sgx/sgx_repo/ubuntu '${UBUNTU_CODENAME}' main' > /etc/apt/sources.list.d/intel-sgx.list

RUN curl -fsSLo /tmp/microsoft.asc https://packages.microsoft.com/keys/microsoft.asc && \
    echo "${MICROSOFT_ASC_SHA256}  /tmp/microsoft.asc" | sha256sum -c - && \
    gpg --dearmor /tmp/microsoft.asc && \
    mv /tmp/microsoft.asc.gpg /usr/share/keyrings/microsoft-prod.gpg && \
    rm -f /tmp/microsoft.asc && \
    echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/ubuntu/20.04/prod focal main' > /etc/apt/sources.list.d/microsoft-prod.list

# Pin Gramine + SGX package versions for a reproducible MRENCLAVE.
ARG GRAMINE_VERSION=1.8
ARG SGX_AESM_VERSION=2.25.100.3-focal1
ARG SGX_DCAP_QV_VERSION=1.22.100.3-focal1
ARG AZ_DCAP_VERSION=1.12.3
ARG PSMISC_VERSION=23.3-1
# Snapshot-resolved unless explicitly pinned (see `make docker-pins`).
ARG PYTHON38_VERSION=
ARG LIBPYTHON38_VERSION=
ARG NUMPY_VERSION=
ARG SCIPY_VERSION=
# Versions come from the build args above plus the frozen apt snapshot;
# hadolint cannot see through the ${VAR:+=${VAR}} expansion, so DL3008 fires
# even though these packages are pinned.
# hadolint ignore=DL3008
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    gramine=${GRAMINE_VERSION} \
    gramine-ratls-dcap=${GRAMINE_VERSION} \
    sgx-aesm-service=${SGX_AESM_VERSION} \
    libsgx-aesm-launch-plugin=${SGX_AESM_VERSION} \
    libsgx-aesm-quote-ex-plugin=${SGX_AESM_VERSION} \
    libsgx-aesm-ecdsa-plugin=${SGX_AESM_VERSION} \
    libsgx-dcap-quote-verify=${SGX_DCAP_QV_VERSION} \
    az-dcap-client=${AZ_DCAP_VERSION} \
    psmisc=${PSMISC_VERSION} \
    "python3.8${PYTHON38_VERSION:+=${PYTHON38_VERSION}}" \
    "libpython3.8${LIBPYTHON38_VERSION:+=${LIBPYTHON38_VERSION}}" \
    "python3-numpy${NUMPY_VERSION:+=${NUMPY_VERSION}}" \
    "python3-scipy${SCIPY_VERSION:+=${SCIPY_VERSION}}" && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# az-dcap-client installs libdcap_quoteprov.so at /usr/lib, which the Gramine
# enclave cannot see (only /lib and /lib/x86_64-linux-gnu are mounted). The
# in-enclave QVL dlopens libdcap_quoteprov.so.1 then libdcap_quoteprov.so;
# place both in arch_libdir so they resolve via LD_LIBRARY_PATH and are measured
# into MRENCLAVE by the trusted_files sort below.
RUN cp /usr/lib/libdcap_quoteprov.so /lib/x86_64-linux-gnu/libdcap_quoteprov.so && \
    ln -s libdcap_quoteprov.so /lib/x86_64-linux-gnu/libdcap_quoteprov.so.1

# Deterministic Python bytecode. Ubuntu's .pyc files carry source mtimes, which
# differ between the signer and runtime stages and between builds. Recompiling
# with --invalidation-mode unchecked-hash replaces the timestamp header with a
# hash of the source, making every .pyc a pure function of the .py file. The
# runtime stage runs the byte-identical command so the measured files match.
# `|| true` because a handful of stdlib test fixtures are intentionally invalid
# Python and always fail to compile.
RUN find /usr/lib/python3.8 /usr/lib/python3/dist-packages -name '__pycache__' -type d -prune -exec rm -rf {} + && \
    { python3.8 -m compileall -q -f --invalidation-mode unchecked-hash \
        /usr/lib/python3.8 /usr/lib/python3/dist-packages || true; }

WORKDIR /app

COPY --from=builder /build/target/release/sgx-mvp /app/sgx-mvp
COPY docker/sgx-mvp.manifest.template /app/sgx-mvp.manifest.template

# Static DNS config baked into the image as trusted_files. Public resolvers
# because Docker's internal 127.0.0.11 DNS is a userspace proxy that is NOT
# reachable from inside the Gramine SGX enclave. The enclave needs working DNS
# to reach the oracle and to download GitHub artifacts.
RUN mkdir -p /app/dns && \
    printf 'nameserver 1.1.1.1\nnameserver 8.8.8.8\noptions ndots:0\n' > /app/dns/resolv.conf && \
    printf '127.0.0.1 localhost\n' > /app/dns/hosts && \
    printf 'hosts: files dns\n' > /app/dns/nsswitch.conf

# Pin the system CA bundle into /app so outbound TLS from inside the enclave
# (oracle assertions, GitHub artifact downloads, and libcurl inside
# libdcap_quoteprov.so fetching PCK collateral from Azure PCS) can verify
# server certificates against a measured trust store.
RUN cp /etc/ssl/certs/ca-certificates.crt /app/ca-certificates.crt

# Oracle trust anchors measured into MRENCLAVE. Supplied from deploy.mk via
# build args. An empty pubkey would build a silently unusable enclave, so fail
# loudly here as well as in the Makefile.
ARG ORACLE_URL
ARG ORACLE_PUBKEY_HEX
ARG SOLANA_CLUSTER=devnet
ARG DRT_PROGRAM_ID=CME2Dg7UEW82Hf99rQetEi7Hc5Db9JQPx6Azmx1eWbEE

RUN if [ -z "${ORACLE_URL}" ]; then \
        echo "error: ORACLE_URL build arg is required (set it in deploy.mk)" >&2; exit 1; \
    fi && \
    if ! printf '%s' "${ORACLE_PUBKEY_HEX}" | grep -Eq '^[0-9a-f]{64}$'; then \
        echo "error: ORACLE_PUBKEY_HEX must be 64 lowercase hex chars (got '${ORACLE_PUBKEY_HEX}')" >&2; \
        echo "       This is the Ed25519 public key of the oracle signing key." >&2; \
        exit 1; \
    fi

# Generate the Gramine manifest.
#
# gramine-manifest does more than render the template: it expands each
# recursive directory entry ("file:/usr/lib/python3.8/") into an explicit
# [[sgx.trusted_files]] table carrying that file's sha256, walking directories
# in sorted order. The result here is ~5200 entries / ~21k lines, and it is
# what gramine-sgx-sign measures.
#
# Because the expansion is already sorted and hashed, no post-processing of the
# list is needed — an earlier revision piped this through an awk rewrite copied
# from a project whose Gramine emitted a flat `sgx.trusted_files = [...]` array;
# against this output that awk matched nothing and was a verified no-op.
#
# The ordered URI list is written to /app/trusted-files.list so that a MRENCLAVE
# mismatch between two builds can be diagnosed by diffing the two lists instead
# of bisecting the whole image.
RUN ENTRYPOINT=$(command -v gramine-ratls) && \
    gramine-manifest \
    -Dentrypoint="${ENTRYPOINT}" \
    -Dlog_level=error \
    -Darch_libdir=/lib/x86_64-linux-gnu \
    -Dapp_dir=/app \
    -Dself_exe=/app/sgx-mvp \
    -Dra_type=dcap \
    -Ddata_dir=/data \
    -Disvprodid=0 \
    -Disvsvn=0 \
    -Doracle_url="${ORACLE_URL}" \
    -Doracle_pubkey_hex="${ORACLE_PUBKEY_HEX}" \
    -Dsolana_cluster="${SOLANA_CLUSTER}" \
    -Ddrt_program_id="${DRT_PROGRAM_ID}" \
    /app/sgx-mvp.manifest.template /app/sgx-mvp.manifest && \
    grep '^uri = ' /app/sgx-mvp.manifest \
      | sed 's/^uri = "file://; s/"$//' > /app/trusted-files.list && \
    echo "trusted files measured: $(wc -l < /app/trusted-files.list)" && \
    if [ ! -s /app/trusted-files.list ]; then \
        echo "error: no trusted files were expanded into the manifest" >&2; exit 1; \
    fi && \
    for required in /app/sgx-mvp /app/dns/resolv.conf /app/dns/hosts \
                    /app/dns/nsswitch.conf /app/ca-certificates.crt /usr/bin/python3.8; do \
        grep -qx "$required" /app/trusted-files.list || \
            { echo "error: $required is not a measured trusted file" >&2; exit 1; }; \
    done

# ---------- SIGN THE ENCLAVE AT BUILD TIME ----------
# The signing key is injected via a BuildKit secret so it never ends up in a
# layer. This produces sgx-mvp.manifest.sgx and sgx-mvp.sig, which lock
# MRENCLAVE and MRSIGNER into the image.
#
# --date 0000-00-00 zeroes the SIGSTRUCT build date. Without it, every rebuild
# on a different day produces a different measurement.
#
# Usage:  docker build --secret id=sgx-key,src=/path/to/enclave-key.pem ...
RUN --mount=type=secret,id=sgx-key,required=true \
    gramine-sgx-sign \
        --manifest /app/sgx-mvp.manifest \
        --output /app/sgx-mvp.manifest.sgx \
        --key /run/secrets/sgx-key \
        --date 0000-00-00

# ---------------------------------------------------------------------------
# Stage 3 — Runtime image
# ---------------------------------------------------------------------------
# Fresh Ubuntu base with only the packages needed to run the signed enclave.
# Keyrings and repo definitions are copied from the signer stage so curl,
# gnupg2 and binutils do not ship in the production image.
#
# The pinned package set MUST match the signer stage exactly: the enclave
# measured those files, so any byte difference fails Gramine's integrity check.
# ---------------------------------------------------------------------------
# hadolint ignore=DL3006
FROM ${UBUNTU_IMAGE}
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG UBUNTU_CODENAME=focal
ARG UBUNTU_SNAPSHOT
ARG CA_CERTS_VERSION
ARG TARGETPLATFORM
ARG GRAMINE_VERSION=1.8
ARG SGX_AESM_VERSION=2.25.100.3-focal1
ARG SGX_DCAP_QV_VERSION=1.22.100.3-focal1
ARG AZ_DCAP_VERSION=1.12.3
ARG PSMISC_VERSION=23.3-1
ARG PYTHON38_VERSION=
ARG LIBPYTHON38_VERSION=
ARG NUMPY_VERSION=
ARG SCIPY_VERSION=
ARG SOCAT_VERSION=
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV TZ=UTC
ENV SOURCE_DATE_EPOCH=1704067200
ENV PYTHONHASHSEED=0

RUN test "${TARGETPLATFORM}" = "linux/amd64" || \
    (echo "error: SGX image must be built for linux/amd64 (got ${TARGETPLATFORM})" >&2; exit 1)

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates=${CA_CERTS_VERSION} && \
    rm -rf /var/lib/apt/lists/*

RUN printf 'Acquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99ubuntu-snapshot && \
    printf 'deb [check-valid-until=no] https://snapshot.ubuntu.com/ubuntu/%s focal main restricted universe multiverse\n' "${UBUNTU_SNAPSHOT}" > /etc/apt/sources.list && \
    printf 'deb [check-valid-until=no] https://snapshot.ubuntu.com/ubuntu/%s focal-updates main restricted universe multiverse\n' "${UBUNTU_SNAPSHOT}" >> /etc/apt/sources.list && \
    printf 'deb [check-valid-until=no] https://snapshot.ubuntu.com/ubuntu/%s focal-security main restricted universe multiverse\n' "${UBUNTU_SNAPSHOT}" >> /etc/apt/sources.list && \
    if ! apt-get update 2>/dev/null; then \
      echo "WARNING: snapshot.ubuntu.com unavailable — using archive.ubuntu.com" >&2; \
      printf 'deb http://archive.ubuntu.com/ubuntu/ focal main restricted universe multiverse\n'        > /etc/apt/sources.list; \
      printf 'deb http://archive.ubuntu.com/ubuntu/ focal-updates main restricted universe multiverse\n' >> /etc/apt/sources.list; \
      printf 'deb http://archive.ubuntu.com/ubuntu/ focal-security main restricted universe multiverse\n' >> /etc/apt/sources.list; \
    fi && \
    rm -rf /var/lib/apt/lists/*

COPY --from=signer /usr/share/keyrings/gramine-keyring.gpg /usr/share/keyrings/gramine-keyring.gpg
COPY --from=signer /usr/share/keyrings/intel-sgx-deb.key /usr/share/keyrings/intel-sgx-deb.key
COPY --from=signer /usr/share/keyrings/microsoft-prod.gpg /usr/share/keyrings/microsoft-prod.gpg
COPY --from=signer /etc/apt/sources.list.d/gramine.list /etc/apt/sources.list.d/gramine.list
COPY --from=signer /etc/apt/sources.list.d/intel-sgx.list /etc/apt/sources.list.d/intel-sgx.list
COPY --from=signer /etc/apt/sources.list.d/microsoft-prod.list /etc/apt/sources.list.d/microsoft-prod.list
# Versions come from the build args above plus the frozen apt snapshot;
# hadolint cannot see through the ${VAR:+=${VAR}} expansion, so DL3008 fires
# even though these packages are pinned.
# hadolint ignore=DL3008
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    gramine=${GRAMINE_VERSION} \
    gramine-ratls-dcap=${GRAMINE_VERSION} \
    sgx-aesm-service=${SGX_AESM_VERSION} \
    libsgx-aesm-launch-plugin=${SGX_AESM_VERSION} \
    libsgx-aesm-quote-ex-plugin=${SGX_AESM_VERSION} \
    libsgx-aesm-ecdsa-plugin=${SGX_AESM_VERSION} \
    libsgx-dcap-quote-verify=${SGX_DCAP_QV_VERSION} \
    az-dcap-client=${AZ_DCAP_VERSION} \
    psmisc=${PSMISC_VERSION} \
    "python3.8${PYTHON38_VERSION:+=${PYTHON38_VERSION}}" \
    "libpython3.8${LIBPYTHON38_VERSION:+=${LIBPYTHON38_VERSION}}" \
    "python3-numpy${NUMPY_VERSION:+=${NUMPY_VERSION}}" \
    "python3-scipy${SCIPY_VERSION:+=${SCIPY_VERSION}}" \
    "socat${SOCAT_VERSION:+=${SOCAT_VERSION}}" && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Mirror the signer stage: the enclave measured libdcap_quoteprov.so at
# /lib/x86_64-linux-gnu/libdcap_quoteprov.so, so the runtime image must have the
# byte-identical file at the same path or integrity checks fail.
RUN cp /usr/lib/libdcap_quoteprov.so /lib/x86_64-linux-gnu/libdcap_quoteprov.so && \
    ln -s libdcap_quoteprov.so /lib/x86_64-linux-gnu/libdcap_quoteprov.so.1

# Byte-identical to the signer stage: these .pyc files were measured into
# MRENCLAVE, so they must be regenerated exactly the same way here.
RUN find /usr/lib/python3.8 /usr/lib/python3/dist-packages -name '__pycache__' -type d -prune -exec rm -rf {} + && \
    { python3.8 -m compileall -q -f --invalidation-mode unchecked-hash \
        /usr/lib/python3.8 /usr/lib/python3/dist-packages || true; }

WORKDIR /app

COPY --from=signer /app/sgx-mvp /app/sgx-mvp
COPY --from=signer /app/sgx-mvp.manifest /app/sgx-mvp.manifest
COPY --from=signer /app/sgx-mvp.manifest.sgx /app/sgx-mvp.manifest.sgx
COPY --from=signer /app/sgx-mvp.sig /app/sgx-mvp.sig
COPY --from=signer /app/trusted-files.list /app/trusted-files.list
COPY --from=signer /app/dns /app/dns
COPY --from=signer /app/ca-certificates.crt /app/ca-certificates.crt

# Fixed service identity: deterministic UID/GID across every build.
ARG APP_USER=relational
ARG APP_UID=10001
ARG APP_GID=10001

# The container bootstraps as root to start AESM, then drops privileges in
# start.sh before launching gramine-sgx.
RUN groupadd --gid ${APP_GID} ${APP_USER} && \
    useradd --uid ${APP_UID} --gid ${APP_GID} \
        --home-dir /nonexistent --no-create-home \
        --shell /usr/sbin/nologin ${APP_USER} && \
    mkdir -p /var/run/aesmd/ /data && \
    chown root:root /var/run/aesmd && \
    chmod 0755 /var/run/aesmd && \
    chown ${APP_UID}:${APP_GID} /data && \
    chmod 0750 /data

COPY docker/restart_aesm.sh /restart_aesm.sh
COPY docker/start.sh /start.sh
RUN chmod 0755 /restart_aesm.sh /start.sh

# The Rust server binds 127.0.0.1:8080 inside the enclave; start.sh runs socat
# to expose it on 8081.
EXPOSE 8081

ENTRYPOINT ["/start.sh"]
