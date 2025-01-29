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

# Nautilus Trusted Compute MVP

This repository is organized into several sub-directories containing components of the Nautilus Trusted Compute MVP.

## Quick Links

- [Full Documentation](https://ntls-io.github.io/trusted-compute-MVP/)
- [SGX Server Setup](https://ntls-io.github.io/trusted-compute-MVP/installation/sgx-mvp/)
- [Attestation Client Guide](https://ntls-io.github.io/trusted-compute-MVP/attestation/client-setup/)
- [API Documentation](https://ntls-io.github.io/trusted-compute-MVP/api/overview/)

## Core Components

### Execution Service & Enclave (/SGX-MVP)
Secure WASM binary execution environment with data sealing/unsealing capabilities and oracle integration.

### Front-end Next.js (/NTC-WEB)
Next.js-based front-end for managing and interacting with Nautilus Trusted Compute.

### Smart Contracts (/TBD)
TBD blockchain integration for trusted compute verification and orchestration.

### Oracle Node (/TBD)
Blockchain network validator that validates the state of the blockchain.

For detailed component documentation, implementation details, and setup instructions, please visit our [documentation site](https://ntls-io.github.io/trusted-compute-MVP/).

## 🔹 License Compliance & Automation

To ensure all files in the repository include the required license header, we provide a script to **automate license insertion**.

### **Adding License Headers Locally**
Run the following script to **automatically add the Nautilus AGPL license** to all supported files:

```bash
./add-license.sh
```

This will: ✅ Add license headers to all source code files (`.ts`, `.js`, `.py`, `.rs`, etc.)

* Add an HTML comment license block to .md files
* Skip unnecessary directories (node_modules, target, dist, etc.)

### GitHub License Check

We also enforce license compliance via GitHub Actions. On every PR, a CI check will fail if files are missing a license header.

To manually validate changed files before pushing, run:

```bash
git diff --name-only | xargs ./add-license.sh
```