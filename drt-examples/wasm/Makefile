# Build the example WASM binaries from source.
#
# The committed binaries in bin/ are what the DRT catalogue references by
# SHA-256, so rebuilding here changes those hashes and invalidates every DRT
# minted against them. See ../README.md.

CRATES = mean median sd

.PHONY: all
all: $(CRATES)

.PHONY: $(CRATES)
$(CRATES):
	@echo "\033[32mBuilding $@ wasm binary...\033[0m"
	@$(MAKE) -C src/$@

.PHONY: hashes
hashes:
	@shasum -a 256 bin/*.wasm

.PHONY: clean
clean:
	@for c in $(CRATES); do $(MAKE) -C src/$$c clean; done
