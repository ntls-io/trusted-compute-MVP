<!--
Nautilus Trusted Compute  
Copyright (C) 2025 Nautilus  

This program is free software: you can redistribute it and/or modify  
it under the terms of the GNU Affero General Public License as published  
by the Free Software Foundation, either version 3 of the License, or  
(at your option) any later version.  

This program is distributed in the hope that it will be useful,  
but WITHOUT ANY WARRANTY; without even the implied warranty of  
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the  
GNU Affero General Public License for more details.  

You should have received a copy of the GNU Affero General Public License  
along with this program. If not, see <https://www.gnu.org/licenses/>.  
-->

# **Remote Attestation Guide**

This guide explains the Remote Attestation (RA) process in the Nautilus MVP using Intel SGX and Azure DCAP.

## Overview

Remote Attestation allows a remote party to verify that:

1. The application is running in a genuine Intel SGX enclave
2. The code hasn't been tampered with
3. The platform can be trusted

## Key Components

1. **SGX Quote**
    - Contains enclave measurements (MRENCLAVE, MRSIGNER)
    - Platform security version numbers

2. **Azure DCAP**
    - Provides attestation collateral
    - Verifies platform TCB status
    - Manages quote generation

3. **Measurements**
    - MRENCLAVE: Unique identity of code and data
    - MRSIGNER: Identity of enclave signer
    - ISV_PROD_ID: Product ID
    - ISV_SVN: Security version number