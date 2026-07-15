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

# Trusted Compute MVP

A framework for privacy-preserving, verifiable computation over sensitive data, combining Intel SGX enclaves with Solana-based orchestration.

## Architecture

- **Execution Service & Enclave** ([sgx-mvp](sgx-mvp/)): SGX enclave that executes WASM and Python workloads over sealed data, producing attested results.
- **Front-end** ([ntc-web](ntc-web/)): Next.js application for managing data pools, digital rights tokens (DRTs), and enclave jobs.
- **Smart Contract** ([drt-manager](drt-manager/)): Solana program governing DRT issuance and trusted compute orchestration.
- **Oracle Node**: TBD.

## Documentation

- [Full Documentation](https://relational-network.github.io/trusted-compute-MVP/)
- [SGX Server Setup](https://relational-network.github.io/trusted-compute-MVP/installation/sgx-mvp/)
- [Attestation Client Guide](https://relational-network.io/trusted-compute-MVP/attestation/client-setup/)
- [API Documentation](https://relational-network.github.io/trusted-compute-MVP/api/overview/)

## License Compliance

All files must carry a license header, enforced via CI. To add headers locally:

```bash
./add-license.sh
```

To check only changed files before pushing:

```bash
git diff --name-only | xargs ./add-license.sh
```