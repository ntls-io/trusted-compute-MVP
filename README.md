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
- **Oracle Node**: an on-demand chain-claim verifier, implemented as a self-contained router
  inside the sibling `devops-acr` service. It verifies finalized Solana events and returns a
  short-lived signed assertion; the enclave pins its public key by measurement. See
  [Keys and Secrets](docs/deployment/keys-and-secrets.md).

## Deployment configuration and redacted endpoints

This is a research MVP running against a real Azure subscription and Solana devnet. Two configuration values
are deliberately **not committed**:

| Value | Where it lives |
|---|---|
| `ORACLE_URL` — the devops-acr endpoint hosting the oracle | `sgx-mvp/deploy.local.mk` (gitignored) and CI secrets |
| `ORACLE_PUBKEY_HEX` — the oracle's Ed25519 public key | same |

**Why.** Neither is cryptographically secret — both are readable from any built enclave image
(`docker run --rm --entrypoint cat <image> /app/sgx-mvp.manifest`) and the public key is served by the live
`/oracle/v1/health` endpoint. They are withheld because the service has an open ingress on a real
subscription: publishing the hostname invites scraping and abuse traffic that we get billed for. This is
resource protection, not confidentiality.

**What that costs.** Both values are measured into the enclave's `MRENCLAVE`, so a third party cannot
reproduce the pinned measurement in [`sgx-mvp/measurements.toml`](sgx-mvp/measurements.toml) from the commit
alone — verifying a build requires obtaining them out of band. That is an accepted MVP trade-off; a
production deployment should publish the endpoint and let anyone reproduce the measurement.

**Placeholders are not an option.** `sgx-mvp/deploy.mk` ships these empty rather than with stand-in values.
A placeholder is still non-empty, so it passes the Makefile guard and produces a properly signed enclave
measured against a host that does not resolve — every protected request then fails as an oracle timeout, far
from the cause. Empty makes the build refuse outright. See
[`docs/deployment/keys-and-secrets.md`](docs/deployment/keys-and-secrets.md).

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