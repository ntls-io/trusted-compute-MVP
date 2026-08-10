SRC_RST = ./src/
BIN = ../../bin/
CARGO_OUT = target/wasm32-unknown-unknown/release/get_median_wasm.wasm
APP_WASM = median.wasm
FILES_RUST_F = $(wildcard $(SRC_RST)*.rs)

all: $(BIN)$(APP_WASM)

$(BIN)$(APP_WASM): $(FILES_RUST_F) Cargo.toml
	@cargo build --target wasm32-unknown-unknown --release
	@cp $(CARGO_OUT) $(BIN)$(APP_WASM)

clean:
	@cargo clean
	@rm -f $(BIN)$(APP_WASM)
