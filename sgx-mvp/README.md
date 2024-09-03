# SGX-MVP Directory

This directory contains all the relevant SGX code for NTC-MVP.

- `wasmi-impl` serves as the WebAssembly interpreter
- `test-data` contains sample JSON data and schemas
- `WIP`

# Quick Start

```sh
# Build the program and the final Gramine manifest
make SGX=1

# Run the program
make SGX=1 wasm-mvp
```

To test with non-SGX Gramine instead, omit `SGX=1` in both commands.
