# Remote Attestation Guide

This guide explains the Remote Attestation (RA) process in the Nautilus MVP using Intel SGX and Azure DCAP.

## Overview

Remote Attestation allows a remote party to verify that:

1. The application is running in a genuine Intel SGX enclave
2. The code hasn't been tampered with
3. The platform can be trusted

## Key Components

### 1. **SGX Quote**
   - Contains enclave measurements (MRENCLAVE, MRSIGNER)
   - Platform security version numbers

### 2. **Azure DCAP**
   - Provides attestation collateral
   - Verifies platform TCB status
   - Manages quote generation

### 3. **Measurements**
   - MRENCLAVE: Unique identity of code and data
   - MRSIGNER: Identity of enclave signer
   - ISV_PROD_ID: Product ID
   - ISV_SVN: Security version number