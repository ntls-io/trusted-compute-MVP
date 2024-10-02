ARCH_LIBDIR ?= /lib/$(shell $(CC) -dumpmachine)

SELF_EXE = target/release/sgx-mvp

# WASM files
SRC_WASM_MEAN= get-mean-wasm/
SRC_WASM_MEDIAN= get-median-wasm/
SRC_WASM_SD= get-sd-wasm/
WASM_MEAN_BIN = bin/get_mean_wasm.wasm
WASM_MEDIAN_BIN = bin/get_median_wasm.wasm
WASM_SD_BIN = bin/get_sd_wasm.wasm

CACERT_FILE = etc/ssl/cacert.pem

.PHONY: all
all: check_wasm_bin cacert $(SELF_EXE) sgx-mvp.manifest
ifeq ($(SGX),1)
all: check_wasm_bin sgx-mvp.manifest.sgx sgx-mvp.sig
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

sgx-mvp.manifest: sgx-mvp.manifest.template
	gramine-manifest \
		-Dlog_level=$(GRAMINE_LOG_LEVEL) \
		-Darch_libdir=$(ARCH_LIBDIR) \
		-Dself_exe=$(SELF_EXE) \
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

.PHONY: wasm
wasm:
	@echo "\033[32mRequest to compile the wasm part...\033[0m"
	@make -C $(SRC_WASM_MEAN)
	@make -C $(SRC_WASM_MEDIAN)
	@make -C $(SRC_WASM_SD)

.PHONY: wasm-mvp
wasm-mvp: all
	$(GRAMINE) sgx-mvp

# Download the latest CA certificate bundle
.PHONY: cacert
cacert:
	@echo "\033[32mDownloading the latest CA certificate bundle...\033[0m"
	curl -o $(CACERT_FILE) https://curl.se/ca/cacert.pem

#TODO: Add additional WASM binaries here
.PHONY: check_wasm_bin
check_wasm_bin:
	@if [ ! -f $(WASM_MEAN_BIN) ]; then \
		echo "\033[31mError: $(WASM_MEAN_BIN) does not exist. Please compile the WASM binary.\033[0m"; \
		echo "\033[31mPlease run: make wasm\033[0m"; \
		exit 1; \
	fi
	@if [ ! -f $(WASM_MEDIAN_BIN) ]; then \
		echo "\033[31mError: $(WASM_MEDIAN_BIN) does not exist. Please compile the WASM binary.\033[0m"; \
		echo "\033[31mPlease run: make wasm\033[0m"; \
		exit 1; \
	fi
	@if [ ! -f $(WASM_SD_BIN) ]; then \
		echo "\033[31mError: $(WASM_SD_BIN) does not exist. Please compile the WASM binary.\033[0m"; \
		echo "\033[31mPlease run: make wasm\033[0m"; \
		exit 1; \
	fi

.PHONY: clean
clean:
	$(RM) -rf *.token *.sig *.manifest.sgx *.manifest result-* OUTPUT $(CACERT_FILE)
	@make -C $(SRC_WASM_MEAN) clean
	@make -C $(SRC_WASM_MEDIAN) clean
	@make -C $(SRC_WASM_SD) clean
	@find temp/ -type f ! -name '.gitkeep' -exec $(RM) {} +

.PHONY: distclean
distclean: clean
	$(RM) -rf target/ Cargo.lock
