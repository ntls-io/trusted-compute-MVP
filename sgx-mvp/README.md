# SGX-MVP Directory

This directory contains all the relevant SGX code for NTC-MVP.

- `wasmi-impl` serves as the WebAssembly interpreter
- `python-impl` serves as the Python interpreter
- `test-data` contains sample JSON data and schemas
- `json-append` contains code for the append functionality
- `github-download` contains the code needed to download GitHub hosted schema/binaries
- `sgx-cosmos-db` contains the code to download the schemas from CosmosDB

# Quick Start

## Step 0

1. Follow the instructions in the [Gramine Installation Guide](https://gramine.readthedocs.io/en/stable/installation.html#install-gramine-packages-1) under "Install Gramine packages."

2. Ensure that Python 3.8 is installed. If necessary, modify the path(s) in the [sgx-mvp.manifest.template](https://github.com/ntls-io/trusted-compute-MVP/blob/main/sgx-mvp/sgx-mvp.manifest.template) to match your setup.

    Ensure that you have the necessary Python development package installed:

```sh
    sudo apt-get install libffi-dev
    sudo apt-get install python3.8-dev
```

3. Install Rust using the [official installation guide](https://www.rust-lang.org/tools/install)

4. Additional dependencies

```sh
sudo apt-get update
sudo apt-get install libssl-dev
```

## Step 1

Before running the program, you need to set the required environment variables. Ensure that you replace the placeholder values with your actual database information before running the script.

Create a script `start.sh` with the following contents:

```sh
export DATABASE_NAME="database_name"
export COLLECTION_NAME="collection_name"
export COSMOSDB_URI="connection_string"
```

Allow execution of the new script `chmod +x start.sh`

To load these environment variables, run the following command:

```sh
source ./start.sh
```

## Step 2

```sh
# Build the program and the final Gramine manifest
make SGX=1

# Run the program
make SGX=1 mvp
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

# Cleaning Up

To maintain a clean workspace, you can use the following commands:

## `make clean`

This command removes generated files and artifacts from the build process, including:
- All temporary tokens, signatures, and SGX manifests.
- The `result-*` files and any generated `OUTPUT` files.
- Cleans up the WASM binaries for _mean_, _median_, and _standard deviation_.

Run it as follows:

```sh
make clean
```

## `make distclean`

This command performs a more thorough cleanup by first invoking **make clean** and then removing additional files, such as:

- The target/ directory where compiled artifacts are stored.
- The Cargo.lock file, which can help ensure that the next build uses fresh dependencies.

Run it as follows:

```sh
make distclean
```