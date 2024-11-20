# SGX-MVP Directory

This directory contains all the relevant SGX code for NTC-MVP.

- `wasmi-impl` serves as the WebAssembly interpreter
- `python-impl` serves as the Python interpreter
- `test-data` contains sample JSON data and schemas
- `json-append` contains code for the append functionality
- `github-download` contains the code needed to download GitHub hosted schema/binaries

# Quick Start

## Step 1

1. Follow the instructions in the [Gramine Installation Guide](https://gramine.readthedocs.io/en/stable/installation.html#install-gramine-packages-1) under "Install Gramine packages" and [Prepare a signing key](https://gramine.readthedocs.io/en/stable/quickstart.html#prepare-a-signing-key).

2. Ensure that Python 3.8 is installed. If necessary, modify the path(s) in the [sgx-mvp.manifest.template](https://github.com/ntls-io/trusted-compute-MVP/blob/main/sgx-mvp/sgx-mvp.manifest.template) to match your setup.

    Ensure that you have the necessary Python development package installed:

```sh
    sudo apt-get update
    sudo apt-get install libffi-dev
    sudo apt-get install python3.8-dev
```

3. Install Rust using the [official installation guide](https://www.rust-lang.org/tools/install)

4. Install additional dependencies

```sh
sudo apt-get update
sudo apt-get install -y libssl-dev ca-certificates
```

5. Install Azure DCAP Attestation dependancies

```sh
wget -qO- https://packages.microsoft.com/keys/microsoft.asc | sudo apt-key add
sudo add-apt-repository "deb [arch=amd64] https://packages.microsoft.com/ubuntu/`lsb_release -rs`/prod `lsb_release -cs` main"
sudo apt install az-dcap-client

sudo apt update
sudo apt-get install pkg-config
sudo apt install sgx-aesm-service libsgx-aesm-ecdsa-plugin libsgx-aesm-quote-ex-plugin
```

The AESM service should be up and running. To confirm that, use:

```sh
sudo systemctl status aesmd.service
```

Setup Azure DCAP
```sh
export AZDCAP_COLLATERAL_VERSION=v4
export AZDCAP_DEBUG_LOG_LEVEL=INFO
```

Make sure to always restart the `aesmd.service` after updating the configuration, via:

```sh
sudo systemctl restart aesmd.service
```

---

## Step 2

```sh
# Build the program and the final Gramine manifest
make SGX=1

# Run the program
make SGX=1 mvp
```
To test with non-SGX Gramine instead, omit `SGX=1` in both commands.


### Run with Azure DCAP Attestation
```sh
make SGX=1 mvp RA_TYPE=dcap
```

# Alternate Gramine use

```sh
# Run program with Gramine SGX
gramine-sgx sgx-mvp

# Run program without SGX
gramine-direct sgx-mvp
```

Note that _gramine-sgx_ requires all files we use in `sgx.trusted_files`

# Postman API Samples

This guide provides details for importing Postman collections to test the API endpoints

---

## Importing Postman Collection

To test the APIs, you can import the Postman collection provided in this repository.

### Steps to Import

1. **Locate the Postman Collection**:
   - The Postman collection is saved in the `postman/` directory of this repository.
   - File: `postman/collection.json`

2. **Open Postman**:
   - Launch the Postman application on your system.

3. **Import the Collection**:
   - Click **Import** in the top-left corner of Postman.
   - Drag and drop the `collection.json` file or click **Upload Files** and select it.

4. **Verify Imported Requests**:
   - After import, you should see all API endpoints organized under the collection.

---

## Health Check API

### Endpoint

- **URL**: `https://127.0.0.1:8080/health`
- **Method**: `GET`

### Description

The `health` endpoint verifies that the server is running and responsive. It returns a simple success message.

### Response

- **Success** (`200 OK`):
  ```sh
  Server is running
  ```

---

## Create Data Pool

### Endpoint

- **URL**: `https://127.0.0.1:8080/create_data_pool`
- **Method**: `POST`
- **Headers**: 
  - `Content-Type: application/json`

### Request Body Format

The body must include the JSON data for the new pool

```json
{
    "data": {
        "Column_1": [
            X,
            Y,
            Z
        ],
        "Column_2": [
            A,
            B,
            C
        ]
    }
}
```

### Response

- **Success** (`200 OK`):

```sh
Data sealed and saved successfully
```


- **Failure** (`500 Internal Server Error`):
```sh
"error": "Detailed error message"
```

## Append Data Pool

### Endpoint

- **URL**: `https://127.0.0.1:8080/append_data`
- **Method**: `POST`
- **Headers**: 
  - `Content-Type: application/json`

### Request Body Format

The body must include the JSON data that is appended to the existing data pool

```json
{
    "data": {
        "Column_1": [
            X,
            Y,
            Z
        ],
        "Column_2": [
            A,
            B,
            C
        ]
    }
}
```

### Response

- **Success** (`200 OK`):

```sh
Data merged, sealed, and saved successfully
```

- **Failure** (`500 Internal Server Error`):
```sh
"error": "Detailed error message"
```

---

## Execute Python API

### Endpoint

- **URL**: `https://127.0.0.1:8080/execute_python`
- **Method**: `POST`
- **Headers**: 
  - `Content-Type: application/json`

### Request Body Format

The body must include the GitHub URL of the Python script and its expected SHA256 hash. This ensures the script is verified before execution.

```json
{
  "github_url": "URL to the Python script on GitHub",
  "expected_hash": "SHA256 hash of the Python script"
}
```

### Response

- **Success** (`200 OK`):

```json
{
  "result": {
    "Column_1": X,
    "Column_2": Y
  }
}
```

- **Failure** (`500 Internal Server Error`):
```json
{
  "error": "Detailed error message"
}
```

---

## Execute WASM API

### Endpoint

- **URL**: `https://127.0.0.1:8080/execute_wasm`
- **Method**: `POST`
- **Headers**: 
  - `Content-Type: application/json`

### Request Body Format

The body must include the GitHub URL of the WASM binary and its expected SHA256 hash. This ensures the WASM binary is verified before execution.

```json
{
  "github_url": "URL to the WASM binary on GitHub",
  "expected_hash": "SHA256 hash of the WASM binary"
}
```

### Response

- **Success** (`200 OK`):

```json
{
  "result": {
    "Column_1": X,
    "Column_2": Y
  }
}
```

- **Failure** (`500 Internal Server Error`):
```json
{
  "error": "Detailed error message"
}
```

---

# Attestation Client

The attestation client (`attest`) is a tool for verifying SGX enclaves using Remote Attestation TLS (RA-TLS). It verifies the enclave's identity and measurements before establishing a secure connection.

## Prerequisites

- Intel SGX DCAP driver and SDK installed
- Gramine SDK installed
- Access to the target enclave's signature file

### Environment variables

```sh
export AZDCAP_COLLATERAL_VERSION=v4
export AZDCAP_DEBUG_LOG_LEVEL=Info
export RA_TLS_ALLOW_DEBUG_ENCLAVE_INSECURE=1
export RA_TLS_ALLOW_OUTDATED_TCB_INSECURE=1
export RA_TLS_ALLOW_HW_CONFIG_NEEDED=1
export RA_TLS_ALLOW_SW_HARDENING_NEEDED=1
```

Required environment variables for proper operation:

- `AZDCAP_COLLATERAL_VERSION=v4`: Specifies the Azure DCAP collateral version
- `AZDCAP_DEBUG_LOG_LEVEL=Info`: Sets logging verbosity for debugging
- `RA_TLS_ALLOW_DEBUG_ENCLAVE_INSECURE=1`: Permits connection to debug enclaves (development only)
- `RA_TLS_ALLOW_OUTDATED_TCB_INSECURE=1`: Allows outdated Trusted Computing Base
- `RA_TLS_ALLOW_HW_CONFIG_NEEDED=1`: Permits hardware configuration updates
- `RA_TLS_ALLOW_SW_HARDENING_NEEDED=1`: Allows software requiring security updates


**Note** The INSECURE flags should only be used in development/testing environments

## Getting Started

1. Extract Enclave Measurements

```sh
gramine-sgx-sigstruct-view sgx-mvp.sig
```

2. Build the Attestation Client

```sh
make attest
```

3 Attest the enclave via the https endpoint

```sh
APPLICATION_HOST=<enclave host> APPLICATION_PORT=8080 ./attest dcap \
        <expected mrenclave> <expected mrsigner> <expected isv_prod_id> <expected isv_svn>
```

Parameters:

- `mrenclave`: Hash measurement of the enclave code/data
- `mrsigner`: Identity of the enclave signer
- `isv_prod_id`: Product ID (use 0 to skip verification)
- `isv_svn`: Security Version Number (use 0 to skip verification)

## Example

```sh
./attest dcap c5e34826d42766363286055750373441545bc601df37fab07231bca4324db319 eb33db710373cbf7c6bfa26e6e9d40e261cfd1f5adc38db6599bfe764e9180cc 0 0
```

Expected Output:

```sh
[ using our own SGX-measurement verification callback (via command line options) ]
  - ignoring ISV_PROD_ID
  - ignoring ISV_SVN

  . Seeding the random number generator... ok
  . Connecting to tcp/127.0.0.1/8080... ok
  . Setting up the SSL/TLS structure... ok
  . Setting certificate verification mode for RA-TLS... ok
  . Installing RA-TLS callback ... ok
  . Performing the SSL/TLS handshake... Allowing quote status SW_HARDENING_NEEDED
  . Handshake completed... ok
  . Verifying peer X.509 certificate... ok
  > Write to server: 46 bytes written

GET /health HTTP/1.1
Host: 127.0.0.1:8080

  < Read from server: 119 bytes read

HTTP/1.1 200 OK
content-length: 17
content-type: text/plain
date: Wed, 20 Nov 2024 08:23:58 GMT

Server is running
Connection closed by server after receiving data
```

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