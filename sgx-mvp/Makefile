ARCH_LIBDIR ?= /lib/$(shell $(CC) -dumpmachine)

SELF_EXE = target/release/sgx-mvp

.PHONY: all
all: $(SELF_EXE) sgx-mvp.manifest
ifeq ($(SGX),1)
all: sgx-mvp.manifest.sgx sgx-mvp.sig
endif

ifeq ($(DEBUG),1)
GRAMINE_LOG_LEVEL = debug
else
GRAMINE_LOG_LEVEL = error
endif

# Note that we're compiling in release mode regardless of the DEBUG setting passed
# to Make, as compiling in debug mode results in an order of magnitude's difference in
# performance that makes testing by running a benchmark with ab painful. The primary goal
# of the DEBUG setting is to control Gramine's loglevel.
-include $(SELF_EXE).d # See also: .cargo/config.toml
$(SELF_EXE): Cargo.toml
	cargo build --release

RA_TYPE ?= dcap
ISVPRODID	?= 0
ISVSVN		?= 0

sgx-mvp.manifest: sgx-mvp.manifest.template
	gramine-manifest \
		-Dentrypoint=$$(command -v gramine-ratls) \
		-Dlog_level=$(GRAMINE_LOG_LEVEL) \
		-Darch_libdir=$(ARCH_LIBDIR) \
		-Dself_exe=$(SELF_EXE) \
		-Dra_type=$(RA_TYPE) \
		-Disvprodid=$(ISVPRODID) \
		-Disvsvn=$(ISVSVN) \
		$< $@

# Make on Ubuntu <= 20.04 doesn't support "Rules with Grouped Targets" (`&:`),
# see the helloworld example for details on this workaround.
sgx-mvp.manifest.sgx sgx-mvp.sig: sgx_sign
	@:

.INTERMEDIATE: sgx_sign
sgx_sign: sgx-mvp.manifest $(SELF_EXE)
	gramine-sgx-sign \
		--manifest $< \
		--output $<.sgx \
		--key keys/enclave-key.pem

ifeq ($(SGX),)
GRAMINE = gramine-direct
else
GRAMINE = gramine-sgx
endif

.PHONY: mvp
mvp: all
	$(GRAMINE) sgx-mvp

.PHONY: clean
clean:
	$(RM) -rf *.token *.sig *.manifest.sgx *.manifest result-* OUTPUT data/data_pool

.PHONY: distclean
distclean: clean
	$(RM) -rf target/ Cargo.lock attest mbedtls

##################### REMOTE ATTESTATION CLIENT ##############################

MBEDTLS_PATH = https://github.com/ARMmbed/mbedtls/archive/mbedtls-3.3.0.tar.gz

CFLAGS += $(shell pkg-config --cflags mbedtls_gramine)
LDFLAGS += -ldl -Wl,--enable-new-dtags $(shell pkg-config --libs mbedtls_gramine)

mbedtls:
	wget $(MBEDTLS_PATH) -O mbedtls.tgz
	mkdir mbedtls
	tar -xvzf mbedtls.tgz -C mbedtls --strip-components 1
	rm mbedtls.tgz

attest: attest.c mbedtls
	C_INCLUDE_PATH=mbedtls/include $(CC) $< $(CFLAGS) $(LDFLAGS) -o $@

