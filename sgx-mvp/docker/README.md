# sgx-mvp — SGX Docker image

Reproducible Gramine + DCAP RA-TLS image for the sgx-mvp enclave. Built and signed in CI, with `MRENCLAVE`
pinned in [`../measurements.toml`](../measurements.toml).

## Why reproducibility matters here

The security argument of this system is that a client verifies `MRENCLAVE` before trusting the enclave — and
the **oracle's public key is measured into `MRENCLAVE`** (`loader.env.ORACLE_ED25519_PUBKEY_HEX` in
[`sgx-mvp.manifest.template`](sgx-mvp.manifest.template)). That is what stops a compromised host pointing the
enclave at an oracle it controls.

That guarantee is only worth anything if the measurement is reproducible. If two builds of the same commit
produce different measurements, nobody can pin an expected value, and attestation degrades to "trust whatever
the host reports".

## Build

Defaults to the host signing key at `$HOME/.config/gramine/enclave-key.pem` (generate with
`gramine-sgx-gen-private-key` if missing). From the project root:

```bash
make docker-build                                  # uses deploy.mk + default key
SGX_SIGNING_KEY=/path/to/prod.pem make docker-build
```

Or directly:

```bash
cd docker
ORACLE_URL=https://... ORACLE_PUBKEY_HEX=<64 hex> ./build.sh ubuntu20
```

The oracle trust anchors come from [`../deploy.mk`](../deploy.mk). Both the Makefile and `build.sh` **refuse
to build** when `ORACLE_PUBKEY_HEX` is missing or malformed: an unconfigured enclave answers every protected
request with `503 enclave_unconfigured`, which is painful to diagnose after the fact.

Build context is the project directory `sgx-mvp/`, not this `docker/` directory — see
[`../.dockerignore`](../.dockerignore). The image is built from the **local checkout**; earlier revisions
cloned the repo from GitHub inside the Dockerfile, so local changes were silently never built.

## How this image gets deployed

CI publishes the signed image to GHCR and stops there. **devops-acr provisions SGX VMs on demand** and its
bootstrap script pulls this image by the reference in its `SGX_IMAGE` setting — there is no long-lived VM and
nothing deploys over SSH.

So the release flow is: build and sign here → record the measurement in `measurements.toml` → point
devops-acr's `SGX_IMAGE` at the digest CI printed. Use a digest rather than a tag: a measurement only means
something alongside the exact image content that produced it.

## Run

The signing key is **not** required at runtime — it is consumed at Docker build time only.

```bash
docker run --rm \
  -p 8080:8081 \
  --device /dev/sgx_enclave \
  --device /dev/sgx_provision \
  -v /opt/sgx-mvp/data:/data \
  relationalnetwork/sgx-mvp:focal
```

The container starts as root only long enough to wire AESM and the SGX device groups, then drops to UID/GID
`10001` (`relational`) before launching `gramine-sgx`. Pre-create the data directory with that ownership:

```bash
sudo install -d -m 0750 -o 10001 -g 10001 /opt/sgx-mvp/data
```

Mount `/data` on a volume. It holds the sealed pool identity and the replay ledger; without a volume they are
lost the moment the container is replaced.

The Rust server binds `127.0.0.1:8080` inside the enclave, so `start.sh` runs `socat` to expose it on 8081.

## Reproducibility

`MRSIGNER` is determined by the RSA-3072 signing key. `MRENCLAVE` is determined by the binary, the manifest,
and every trusted file. The Dockerfile pins everything that affects it:

- Ubuntu base image SHA256 digest + apt snapshot (`UBUNTU_SNAPSHOT` via `snapshot.ubuntu.com`)
- Rust toolchain (`RUST_TOOLCHAIN`, matches [`../rust-toolchain.toml`](../rust-toolchain.toml))
- rustup installer (`RUSTUP_VERSION` + `RUSTUP_SHA256`, versioned `static.rust-lang.org/rustup/archive/` URL)
- Gramine + SGX AESM + DCAP packages (`GRAMINE_VERSION`, `SGX_AESM_VERSION`, `SGX_DCAP_QV_VERSION`,
  `AZ_DCAP_VERSION`)
- GPG keyrings (`GRAMINE_KEYRING_SHA256`, `INTEL_SGX_DEB_SHA256`, `MICROSOFT_ASC_SHA256`)
- `Cargo.lock` committed, built with `--locked`
- Rust reproducibility env (`SOURCE_DATE_EPOCH`, fixed `RUSTFLAGS` with `codegen-units=1`, `build-id=none`,
  `rng-seed=0`, `remap-path-prefix`); `CFLAGS`/`CXXFLAGS` redact `__DATE__`/`__TIME__`/`__TIMESTAMP__`
- Build platform (`linux/amd64`, enforced in every stage and in `build.sh`)
- Runtime UID/GID (`10001:10001`)
- SIGSTRUCT date (**`--date 0000-00-00`** to `gramine-sgx-sign`) — without this, every rebuild on a different
  day yields a different measurement
- `sgx.debug = false` hardcoded in [`sgx-mvp.manifest.template`](sgx-mvp.manifest.template)
- `sgx.max_threads` a constant — it previously read the host's `EDMM` env var at manifest-render time, making
  the measurement depend on the build machine

### Trusted files

`gramine-manifest` does more than render the template. It expands each recursive directory entry
(`"file:/usr/lib/python3.8/"`) into an explicit `[[sgx.trusted_files]]` table carrying that file's SHA-256,
walking directories in sorted order. For this image that is ~5,200 entries across the Gramine runtime,
`arch_libdir`, the CPython 3.8 standard library and `dist-packages` (NumPy/SciPy) — about 21,000 lines of
manifest, and it is what `gramine-sgx-sign` measures.

Because that expansion is already sorted and hashed, the list needs no post-processing. The build writes the
ordered URI list to `/app/trusted-files.list` inside the image so that a `MRENCLAVE` mismatch between two
builds can be diagnosed by diffing the two lists:

```bash
docker run --rm --entrypoint cat <image-a> /app/trusted-files.list > a.list
docker run --rm --entrypoint cat <image-b> /app/trusted-files.list > b.list
diff a.list b.list
```

The build also asserts that the binary, the DNS files, the CA bundle and the Python interpreter actually made
it into the measured set, so a manifest mistake fails the build rather than shipping an enclave that trusts
less than intended.

### Python determinism

This image embeds CPython 3.8, NumPy and SciPy, which the reference deterministic build did not have to deal
with. Ubuntu ships `.pyc` files whose headers carry source **mtimes**, so they differ between the signer and
runtime stages and between builds.

Both stages therefore delete every `__pycache__` and recompile identically:

```
python3.8 -m compileall -q -f --invalidation-mode unchecked-hash \
    /usr/lib/python3.8 /usr/lib/python3/dist-packages
```

`unchecked-hash` replaces the timestamp header with a hash of the source, making each `.pyc` a pure function
of its `.py`. `PYTHONDONTWRITEBYTECODE=1` and `PYTHONHASHSEED=0` are set in the manifest so nothing is written
or reordered at runtime. The signer and runtime stages install the **same pinned package set** — the enclave
measured those files, so any byte difference fails Gramine's integrity check at startup.

### Partially pinned packages

`python3.8`, `libpython3.8`, `python3-numpy`, `python3-scipy`, `libffi-dev` and `socat` are resolved by the
frozen apt snapshot rather than hard-pinned by version string. The snapshot makes resolution deterministic in
practice; the explicit pins used elsewhere are belt-and-braces for the case where `snapshot.ubuntu.com` is
unreachable and the build falls back to `archive.ubuntu.com`.

To harden them, print the resolved versions and paste them into the matching `ARG`s:

```bash
make docker-pins
```

## Verification

```bash
make docker-sigstruct      # prints the [enclave] block in measurements.toml field order
make verify-mrenclave      # rebuilds --no-cache and diffs against measurements.toml
```

CI does the same on every push: builds with the `ENCLAVE_SIGNING_KEY` secret, asserts `debug_enclave = False`,
`isv_prod_id = 0`, `isv_svn = 0`, and fails if `mr_enclave` drifts from `measurements.toml`.

To roll a release:

1. `make docker-build && make docker-sigstruct`
2. Copy the printed `[enclave]` block into [`../measurements.toml`](../measurements.toml) **in the same PR**
   as the source change.
3. Merge — CI re-verifies and pushes the image.

Deploy by **digest**, not tag, when pinning a release. CI prints the `Deploy:` line for each successful build
in the workflow run summary.

## Rotating the oracle key destroys sealed state

The encrypted `/data` mount is keyed by `_sgx_mrenclave`. Because the oracle public key is measured into
`MRENCLAVE`, rotating the oracle signing key changes the measurement, which makes the existing sealed pool
identity and replay ledger **unreadable**. There is no migration path in this prototype — a measurement change
means starting from a fresh pool.

---

SPDX-License-Identifier: AGPL-3.0-or-later · Copyright (C) 2026 Relational Network
