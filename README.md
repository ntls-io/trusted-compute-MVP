<!--
Nautilus Trusted Compute
Copyright (C) 2026 Relational Network

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

# Verifiable Computation with Trusted Execution Environments and On-Chain Digital Rights Tokens

A research prototype for privacy-preserving, verifiable computation over sensitive data,
combining Intel SGX enclaves with Solana-based orchestration. Digital rights tokens (DRTs)
are redeemed on-chain to authorise a specific computation over sealed data inside an
attested enclave.

## Architecture

| Component | Path | Role |
|---|---|---|
| Execution enclave | [sgx-mvp](sgx-mvp/) | Runs WASM and Python workloads over sealed data, producing attested results |
| Front-end | [ntc-web](ntc-web/) | Next.js app for managing data pools, DRTs, and enclave jobs |
| Smart contract | [drt-manager](drt-manager/) | Solana program governing DRT issuance and redemption |

## Deployment service and oracle

[Relational-Network/devops-acr](https://github.com/Relational-Network/devops-acr) — provisions a
new enclave per data pool, and hosts the oracle that verifies on-chain DRT redemptions.

## Links

- [Documentation](https://relational-network.github.io/trusted-compute-MVP/)

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE)