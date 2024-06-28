# Nautilus Trusted Compute MVP

This repository is organized into several sub-directories containing components of the Nautilus Trusted Compute MVP.

## Signing Service & Enclave

- **Description**: Responsible for signing transactions and ensuring secure communication with the front-end.
- **Components**:
  - **Signing Service**: Signs transactions and handles secure communication with the front-end.
  - **Signing Enclave**: Unseals and reseals keys, verifies users, and signs unsigned transactions.

## Execution Service & Enclave

- **Description**: Manages execution and verification requests, and supports the execution of WASM binaries.
- **Components**:
  - **Execution Service**: Manages execution and verification requests.
  - **Execution Enclave**: Unseals and reseals data, verifies user data, runs computations over datasets, and encrypts data for oracles.


## Data Service

- **Description**: Manages data requests and handles sealed keys.
- **Components**:
  - **Azure Blob Storage**: Used for storing and managing data requests.

## WASM

- **Description**: WebAssembly (WASM) binaries used for execution within the Execution Enclave.
- **Components**:
  - **WASM Binaries**: Executable binaries for the enclave to run.

## JSON Schema Validator

- **Description**: Vue mixin for validating JSON data against a JSON schema.
- **Components**:
  - **JSON Schema**: Defines the structure and validation rules for the JSON data.

## NTC Smart Contract (Algorand)

- **Description**: Smart contracts deployed on the Algorand blockchain.
- **Components**:
  - **Smart Contracts**: Implemented using PyTeal for various functionalities within the Nautilus Trusted Compute ecosystem.

## Oracle node

- **Description**: Participates as nodes in the blockchain network, verifying execution requests by querying the state of the blockchain and constructing enclave transactions.
- **Functions**:
- Query the state of the blockchain and pass the result to the execution enclave
	- Create unsigned transactions from data received from the execution enclave to then be signed by the signing enclave and later forwarded to the blockchain




