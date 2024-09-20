# SGX-MVP Directory

This directory contains all the relevant SGX code for NTC-MVP.

- `wasmi-impl` serves as the WebAssembly interpreter
- `test-data` contains sample JSON data and schemas
- `get-mean-wasm` contains Rust code for the WASM mean binary
- `get-median-wasm` contains Rust code for the WASM median binary

# Quick Start

## Step 1

```sh
# Build the wasm binaries
make wasm
```

## Step 2
```sh
# Build the program and the final Gramine manifest
make SGX=1

# Run the program
make SGX=1 wasm-mvp
```

To test with non-SGX Gramine instead, omit `SGX=1` in both commands.

# Alternate Gramine use

```sh
# Run program with Gramine SGX
gramine-sgx sgx-mvp

# Run program without SGX
gramine-direct sgx-mvp
```

Note that _gramine-sgx_ requires all files we use in `sgx.trusted_files`