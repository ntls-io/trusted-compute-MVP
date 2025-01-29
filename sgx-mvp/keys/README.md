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
along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->
# SGX Signing Keys

This directory contains the SGX enclave signing key used during the build process.

## Development Setup

To generate a development key:

```bash
cd sgx-mvp
gramine-sgx-gen-private-key keys/enclave-key.pem
chmod 400 keys/enclave-key.pem
```

## Production Usage

For production deployments:
1. Use your organization's production signing key
2. Store the key securely (never commit to version control)
3. Use appropriate key management systems
4. Consider using different keys per environment

## Security Notes

- Keys should have restricted permissions (chmod 400)
- Development keys should be generated locally
- Production keys should be managed through secure key management