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