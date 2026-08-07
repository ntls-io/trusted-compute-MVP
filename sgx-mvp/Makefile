# Nautilus Trusted Compute
# Copyright (C) 2025 Nautilus

# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.

# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

# Makefile for sgx-mvp.
#
# Three workflows live here:
#
#   1. Host development (no SGX, no Gramine)
#      make dev-check | dev-build | dev-test
#      Targets the oracle-verify crate, which builds anywhere. The enclave
#      binary links libpython3.8 and only builds in the Gramine environment.
#
#   2. Native SGX dev (SGX VM with Gramine + DCAP)
#      make SGX=1                # builds .manifest / .manifest.sgx / .sig
#      make SGX=1 start-sgx-mvp  # runs inside the SGX enclave
#      Uses the root-level sgx-mvp.manifest.template (sgx.debug = true).
#
#   3. Production (Docker, signed and deterministic)
#      make docker-build         # builds & signs, baking MRENCLAVE into the image
#      make docker-run           # runs locally with SGX device pass-through
#      make docker-sigstruct     # prints the [enclave] block for measurements.toml
#      make verify-mrenclave     # rebuilds --no-cache and diffs measurements.toml
#      Uses docker/sgx-mvp.manifest.template (sgx.debug = false hardcoded).

# Oracle trust anchors measured into MRENCLAVE.
#
# deploy.local.mk is included FIRST and is gitignored: it holds the deployment
# identity (oracle URL and public key) that is deliberately not committed.
# deploy.mk is committed and uses `?=`, so it only fills in what the local file
# left unset — the public protocol constants. Order matters: `?=` will not
# override an already-defined variable, so the local file must come first.
#
# Command-line overrides (make ORACLE_URL=... ) win over both.
-include deploy.local.mk
-include deploy.mk

# Use the fixed x86_64-linux-gnu path. Deriving this from `$(CC) -dumpmachine`
# yields x86_64-pc-linux-gnu under clang, which does not exist on Ubuntu and
# previously required a symlink workaround in the Dockerfile.
ARCH_LIBDIR ?= /lib/x86_64-linux-gnu

# Find the gramine-ratls binary (required for RA-TLS).
ENTRYPOINT ?= $(firstword $(wildcard /usr/bin/gramine-ratls /usr/local/bin/gramine-ratls /bin/gramine-ratls))

SELF_EXE ?= target/release/sgx-mvp
SRCS = $(shell find src oracle-verify/src -type f -name '*.rs' 2>/dev/null)

RA_TYPE ?= dcap
ISVPRODID ?= 0
ISVSVN ?= 0

# Signing key. Docker builds inject this as a BuildKit secret; native builds
# pass it to gramine-sgx-sign directly.
SGX_SIGNING_KEY ?= $(HOME)/.config/gramine/enclave-key.pem

IMAGE ?= relationalnetwork/sgx-mvp:focal
UBUNTU_IMAGE ?= ubuntu:20.04@sha256:8feb4d8ca5354def3d8fce243717141ce31e2c428701f6682bd2fafe15388214

# Host directory backing the encrypted /data mount for `docker-run`.
DATA_DIR ?= $(abspath data)

ifeq ($(DEBUG),1)
GRAMINE_LOG_LEVEL = debug
else
GRAMINE_LOG_LEVEL = error
endif

ifeq ($(SGX),)
GRAMINE = gramine-direct
else
GRAMINE = gramine-sgx
endif

.PHONY: all
all: $(SELF_EXE) sgx-mvp.manifest
ifeq ($(SGX),1)
all: sgx-mvp.manifest.sgx sgx-mvp.sig
endif

.PHONY: help
help:
	@echo "Host development (no SGX, no Gramine):"
	@echo "  make dev-check                fast host compile check (oracle-verify)"
	@echo "  make dev-build                host dev build"
	@echo "  make dev-test                 cargo test"
	@echo ""
	@echo "Native SGX dev (SGX VM):"
	@echo "  make SGX=1                    build SGX artefacts (.manifest/.sgx/.sig)"
	@echo "  make SGX=1 start-sgx-mvp      run inside the SGX enclave"
	@echo "  make show-measurements        inspect local SIGSTRUCT measurements"
	@echo ""
	@echo "Production (Docker, signed and deterministic):"
	@echo "  make docker-build             build signed SGX Docker image"
	@echo "  make docker-run               run the image (override with DATA_DIR=/path)"
	@echo "  make docker-stop              stop the running container"
	@echo "  make docker-sigstruct         print the [enclave] block for measurements.toml"
	@echo "  make verify-mrenclave         rebuild --no-cache and compare measurements.toml"
	@echo "  make docker-pins              print resolved apt versions for pinning"
	@echo ""
	@echo "Attestation client (C-based DCAP verifier):"
	@echo "  make attest                   build the attestation client"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean                    remove generated manifest/signing artifacts"
	@echo "  make distclean                clean + remove target/"

# ─────────────────────────────────────────────────────────────────────────────
# Oracle trust anchor guard
# ─────────────────────────────────────────────────────────────────────────────
# An empty ORACLE_PUBKEY_HEX silently produces an enclave that rejects every
# protected request with 503 enclave_unconfigured. Fail at build time instead.

.PHONY: check-oracle-vars
check-oracle-vars:
	@if [ -z "$(ORACLE_URL)" ]; then \
		echo "error: ORACLE_URL is not set."; \
		echo "       Set it in deploy.mk, or pass ORACLE_URL=https://... on the command line."; \
		exit 1; \
	fi
	@if ! printf '%s' "$(ORACLE_PUBKEY_HEX)" | grep -Eq '^[0-9a-f]{64}$$'; then \
		echo "error: ORACLE_PUBKEY_HEX must be 64 lowercase hex characters."; \
		echo "       Got: '$(ORACLE_PUBKEY_HEX)'"; \
		echo "       This is the Ed25519 PUBLIC key of the oracle. See deploy.mk for how to obtain it."; \
		exit 1; \
	fi

# ─────────────────────────────────────────────────────────────────────────────
# Host development (no SGX, no Gramine)
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: dev-check
dev-check:
	cargo dev-check

.PHONY: dev-build
dev-build:
	cargo dev-build

.PHONY: dev-test
dev-test:
	cargo dev-test

# ─────────────────────────────────────────────────────────────────────────────
# Native SGX dev
# ─────────────────────────────────────────────────────────────────────────────

$(DATA_DIR):
	mkdir -p $(DATA_DIR)

# Release profile regardless of DEBUG: debug builds are an order of magnitude
# slower inside SGX. DEBUG controls Gramine's log level only.
-include $(SELF_EXE).d # See also: .cargo/config.toml
$(SELF_EXE): Cargo.toml Cargo.lock $(SRCS)
	cargo build --release --locked

sgx-mvp.manifest: sgx-mvp.manifest.template check-oracle-vars | $(DATA_DIR)
	@if [ -z "$(ENTRYPOINT)" ]; then \
		echo "error: gramine-ratls not found; install gramine-ratls-dcap or set ENTRYPOINT=/path/to/gramine-ratls"; \
		exit 1; \
	fi
	gramine-manifest \
		-Dentrypoint=$(ENTRYPOINT) \
		-Dlog_level=$(GRAMINE_LOG_LEVEL) \
		-Darch_libdir=$(ARCH_LIBDIR) \
		-Dself_exe=$(SELF_EXE) \
		-Dra_type=$(RA_TYPE) \
		-Disvprodid=$(ISVPRODID) \
		-Disvsvn=$(ISVSVN) \
		-Doracle_url=$(ORACLE_URL) \
		-Doracle_pubkey_hex=$(ORACLE_PUBKEY_HEX) \
		-Dsolana_cluster=$(SOLANA_CLUSTER) \
		-Ddrt_program_id=$(DRT_PROGRAM_ID) \
		$< $@

# Make on Ubuntu <= 20.04 doesn't support "Rules with Grouped Targets" (`&:`).
sgx-mvp.manifest.sgx sgx-mvp.sig: sgx_sign
	@:

.INTERMEDIATE: sgx_sign
sgx_sign: sgx-mvp.manifest $(SELF_EXE)
	@if [ ! -f "$(SGX_SIGNING_KEY)" ]; then \
		echo "error: SGX signing key not found at $(SGX_SIGNING_KEY)"; \
		echo "       Generate one with: gramine-sgx-gen-private-key $(SGX_SIGNING_KEY)"; \
		echo "       Or set SGX_SIGNING_KEY=/path/to/enclave-key.pem"; \
		exit 1; \
	fi
	gramine-sgx-sign \
		--manifest $< \
		--output $<.sgx \
		--key $(SGX_SIGNING_KEY) \
		--date 0000-00-00

.PHONY: start-sgx-mvp
start-sgx-mvp: all
	$(GRAMINE) sgx-mvp

# Back-compat alias for the previous target name.
.PHONY: mvp
mvp: start-sgx-mvp

.PHONY: show-measurements
show-measurements: sgx-mvp.sig
	@gramine-sgx-sigstruct-view sgx-mvp.sig | grep -E "mr_enclave|mr_signer|isv_prod_id|isv_svn|debug_enclave"

# ─────────────────────────────────────────────────────────────────────────────
# Production (Docker, signed and deterministic)
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: docker-build
docker-build: check-oracle-vars
	cd docker && \
		SGX_SIGNING_KEY="$(SGX_SIGNING_KEY)" \
		ORACLE_URL="$(ORACLE_URL)" \
		ORACLE_PUBKEY_HEX="$(ORACLE_PUBKEY_HEX)" \
		SOLANA_CLUSTER="$(SOLANA_CLUSTER)" \
		DRT_PROGRAM_ID="$(DRT_PROGRAM_ID)" \
		IMAGE_TAG="$(IMAGE)" \
		./build.sh ubuntu20

# Exit 137 (SIGKILL) is expected: Gramine SGX does not propagate SIGTERM to the
# enclave, so Docker force-stops the container after the stop timeout. Harmless
# — Gramine's encrypted filesystem flushes writes synchronously.
.PHONY: docker-run
docker-run:
	@mkdir -p $(DATA_DIR)
	@status=0; \
	docker run --rm -it \
		--name sgx-mvp \
		-p 8080:8081 \
		--device /dev/sgx_enclave \
		--device /dev/sgx_provision \
		--stop-timeout 30 \
		-v "$(DATA_DIR):/data" \
		$(IMAGE) || status=$$?; \
	case "$$status" in \
		0|130|137) exit 0 ;; \
		*) exit "$$status" ;; \
	esac

.PHONY: docker-stop
docker-stop:
	docker stop -t 30 sgx-mvp

.PHONY: docker-sigstruct
docker-sigstruct:
	@echo "Extracting enclave measurements from $(IMAGE)..."
	@docker create --name sgx-mvp-sigstruct $(IMAGE) >/dev/null 2>&1
	@docker cp sgx-mvp-sigstruct:/app/sgx-mvp.sig /tmp/sgx-mvp-docker.sig >/dev/null 2>&1
	@docker rm sgx-mvp-sigstruct >/dev/null 2>&1
	@echo "[enclave]"
	@gramine-sgx-sigstruct-view --verbose --output-format=toml /tmp/sgx-mvp-docker.sig \
		| awk ' \
			/^mr_enclave = / { mr_enclave = $$0 } \
			/^mr_signer = / { mr_signer = $$0 } \
			/^isv_prod_id = / { isv_prod_id = $$0 } \
			/^isv_svn = / { isv_svn = $$0 } \
			/^debug_enclave = / { debug_enclave = $$0 } \
			END { \
				print mr_enclave; \
				print mr_signer; \
				print isv_prod_id; \
				print isv_svn; \
				print debug_enclave; \
			} \
		'
	@rm -f /tmp/sgx-mvp-docker.sig

.PHONY: verify-mrenclave
verify-mrenclave: check-oracle-vars
	@EXPECTED_MR=$$(sed -n 's/^mr_enclave = "\(.*\)"$$/\1/p' measurements.toml | head -1); \
	if ! printf '%s\n' "$$EXPECTED_MR" | grep -Eq '^[0-9a-f]{64}$$'; then \
		echo "ERROR: measurements.toml does not contain a pinned mr_enclave yet."; \
		echo "Run 'make docker-build' and 'make docker-sigstruct', then record the value."; \
		exit 1; \
	fi
	@if [ ! -f "$(SGX_SIGNING_KEY)" ]; then \
		echo "ERROR: Signing key not found at $(SGX_SIGNING_KEY)"; \
		exit 1; \
	fi
	@echo "=== Building locally (no cache) ==="
	@cd docker && DOCKER_BUILDKIT=1 docker build \
		--platform linux/amd64 \
		--no-cache \
		--build-arg UBUNTU_CODENAME=focal \
		--build-arg ORACLE_URL="$(ORACLE_URL)" \
		--build-arg ORACLE_PUBKEY_HEX="$(ORACLE_PUBKEY_HEX)" \
		--build-arg SOLANA_CLUSTER="$(SOLANA_CLUSTER)" \
		--build-arg DRT_PROGRAM_ID="$(DRT_PROGRAM_ID)" \
		--secret id=sgx-key,src="$(SGX_SIGNING_KEY)" \
		-t relationalnetwork/sgx-mvp:verify-local \
		-f Dockerfile \
		.. >/dev/null
	@BUILT_MR=$$(docker run --rm \
		--entrypoint gramine-sgx-sigstruct-view \
		relationalnetwork/sgx-mvp:verify-local \
		/app/sgx-mvp.sig 2>/dev/null | grep 'mr_enclave:' | awk '{print $$2}' | head -1); \
	EXPECTED_MR=$$(sed -n 's/^mr_enclave = "\(.*\)"$$/\1/p' measurements.toml | head -1); \
	echo "Built:    $$BUILT_MR"; \
	echo "Expected: $$EXPECTED_MR  (measurements.toml)"; \
	if [ "$$BUILT_MR" = "$$EXPECTED_MR" ]; then \
		echo "MATCH - MRENCLAVE matches measurements.toml"; \
	else \
		echo "MISMATCH - MRENCLAVE differs from measurements.toml!"; \
		echo "If intentional, update measurements.toml in the same PR."; \
		exit 1; \
	fi

# Print the apt versions the frozen snapshot resolves to, for the packages the
# Dockerfile leaves snapshot-resolved. Paste these into the matching ARGs to
# hard-pin them.
.PHONY: docker-pins
docker-pins:
	@docker run --rm --platform linux/amd64 $(UBUNTU_IMAGE) bash -c '\
		apt-get update -qq >/dev/null 2>&1; \
		for p in python3.8 python3.8-dev libpython3.8 python3-numpy python3-scipy libffi-dev socat \
		         ca-certificates build-essential clang curl pkg-config libssl-dev gnupg2 binutils psmisc; do \
			v=$$(apt-cache policy $$p 2>/dev/null | awk "/Candidate:/ {print \$$2}"); \
			printf "%-24s %s\n" "$$p" "$$v"; \
		done'

# ─────────────────────────────────────────────────────────────────────────────
# Attestation client (C-based DCAP verifier)
# ─────────────────────────────────────────────────────────────────────────────

MBEDTLS_PATH = https://github.com/ARMmbed/mbedtls/archive/mbedtls-3.3.0.tar.gz

CFLAGS += $(shell pkg-config --cflags mbedtls_gramine 2>/dev/null)
LDFLAGS += -ldl -Wl,--enable-new-dtags $(shell pkg-config --libs mbedtls_gramine 2>/dev/null)

mbedtls:
	wget $(MBEDTLS_PATH) -O mbedtls.tgz
	mkdir mbedtls
	tar -xvzf mbedtls.tgz -C mbedtls --strip-components 1
	rm mbedtls.tgz

attest: attest.c mbedtls
	C_INCLUDE_PATH=mbedtls/include $(CC) $< $(CFLAGS) $(LDFLAGS) -o $@

# ─────────────────────────────────────────────────────────────────────────────
# Cleanup
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: clean
clean:
	$(RM) -rf *.token *.sig *.manifest.sgx *.manifest result-* OUTPUT data/data_pool

# Cargo.lock is deliberately NOT removed: it is committed and pins the
# dependency graph that MRENCLAVE depends on.
.PHONY: distclean
distclean: clean
	$(RM) -rf target/ attest mbedtls
