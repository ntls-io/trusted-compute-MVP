# Attestation Client Setup

This guide covers the setup and configuration of the attestation client for verifying SGX enclaves.

## Environment Setup

### 1. Azure DCAP Configuration

```sh
# Set DCAP version
export AZDCAP_COLLATERAL_VERSION=v4

# Set log level
export AZDCAP_DEBUG_LOG_LEVEL=INFO

# Development flags, see Gramine documentation for more information
export RA_TLS_ALLOW_DEBUG_ENCLAVE_INSECURE=1
export RA_TLS_ALLOW_OUTDATED_TCB_INSECURE=1
export RA_TLS_ALLOW_HW_CONFIG_NEEDED=1
export RA_TLS_ALLOW_SW_HARDENING_NEEDED=1
```

### 2. AESM Service

```sh
# Check service status
sudo systemctl status aesmd.service

# Restart service if needed
sudo systemctl restart aesmd.service
```

## Building the Client

```sh
make attest
```


## Client Usage

### Verification Process

#### 1. **Quote Generation**
   ```sh
   # Extract enclave measurements
   gramine-sgx-sigstruct-view sgx-mvp.sig
   ```

#### 2. **Measurement Verification**
   ```sh
   # Check specific measurements
   ./attest dcap <mrenclave> <mrsigner> <isv_prod_id> <isv_svn>
   ```

#### 3. **Example Verification**

```sh
./attest dcap c5e34826d42766363286055750373441545bc601df37fab07231bca4324db319 eb33db710373cbf7c6bfa26e6e9d40e261cfd1f5adc38db6599bfe764e9180cc 0 0
```

Expected Output:

```text
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