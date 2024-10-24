ARCH_LIBDIR ?= /lib/$(shell $(CC) -dumpmachine)

SELF_EXE = target/release/sgx-mvp

CACERT_FILE = etc/ssl/cacert.pem

.PHONY: all
all: cacert $(SELF_EXE) sgx-mvp.manifest
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

RA_TYPE ?= none

sgx-mvp.manifest: sgx-mvp.manifest.template
	gramine-manifest \
		-Dlog_level=$(GRAMINE_LOG_LEVEL) \
		-Darch_libdir=$(ARCH_LIBDIR) \
		-Dself_exe=$(SELF_EXE) \
		-Dra_type=$(RA_TYPE) \
		$< $@

# Make on Ubuntu <= 20.04 doesn't support "Rules with Grouped Targets" (`&:`),
# see the helloworld example for details on this workaround.
sgx-mvp.manifest.sgx sgx-mvp.sig: sgx_sign
	@:

.INTERMEDIATE: sgx_sign
sgx_sign: sgx-mvp.manifest $(SELF_EXE)
	gramine-sgx-sign \
		--manifest $< \
		--output $<.sgx

ifeq ($(SGX),)
GRAMINE = gramine-direct
else
GRAMINE = gramine-sgx
endif

.PHONY: mvp
mvp: all
	$(GRAMINE) sgx-mvp

# Download the latest CA certificate bundle if it does not exist
.PHONY: cacert
cacert:
	@if [ ! -f $(CACERT_FILE) ]; then \
		echo "\033[32mDownloading the latest CA certificate bundle...\033[0m"; \
		curl -o $(CACERT_FILE) https://curl.se/ca/cacert.pem; \
	else \
		echo "\033[32mCA certificate bundle already exists, skipping download...\033[0m"; \
	fi

.PHONY: clean
clean:
	$(RM) -rf *.token *.sig *.manifest.sgx *.manifest result-* OUTPUT $(CACERT_FILE)

.PHONY: distclean
distclean: clean
	$(RM) -rf target/ Cargo.lock
