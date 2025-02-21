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

# **Attestation Client Setup**

This guide covers the setup and configuration of the attestation client for verifying SGX enclaves.

## Environment Setup

1. **Azure DCAP Configuration**

    ```sh
    # Set DCAP version
    export AZDCAP_COLLATERAL_VERSION=v4

    # Set log level
    export AZDCAP_DEBUG_LOG_LEVEL=ERROR

    # Development flags, see Gramine documentation for more information
    export RA_TLS_ALLOW_DEBUG_ENCLAVE_INSECURE=1
    export RA_TLS_ALLOW_OUTDATED_TCB_INSECURE=1
    export RA_TLS_ALLOW_HW_CONFIG_NEEDED=1
    export RA_TLS_ALLOW_SW_HARDENING_NEEDED=1
    ```

2. **AESM Service**

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

1. **Quote Generation**
    ```sh
    # Extract enclave measurements
    gramine-sgx-sigstruct-view sgx-mvp.sig
    ```

2. **Measurement Verification**
    ```sh
    # Check specific measurements
    [APPLICATION_PORT=... APPLICATION_HOST=...] ./attest dcap <mrenclave> <mrsigner> <isv_prod_id> <isv_svn>
    ```

3. **Example Verification**

    ```sh
    APPLICATION_HOST=127.0.0.1 APPLICATION_PORT=8080 ./attest dcap b6b4ed529d21daad3180cde2759bf7f6b0533b4b78f02ffdf48158e80b48c421 0d75a9bcadf105daec4c45f7cde9ebbf6af1aea9436d5ca259fb84efd51460ac 0 0
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


## Docker Container Attestation

1. **Build Container and Get Signature**

    Check [Docker Deployment Guide](../installation/docker-deployment.md) for complete instructions on building and setting up the Docker environment.

    ```sh
    cd sgx-mvp/docker
    # Build container - this will also create docker-sgx-mvp.sig
    ./build.sh ubuntu20
    ```

2. **View Container Measurements**

    ```sh
    # View signature details
    gramine-sgx-sigstruct-view docker-sgx-mvp.sig
    ```

3. **Verify Container**

    ```sh
    # Using measurements from docker container
    ./attest dcap <mrenclave> <mrsigner> <isv_prod_id> <isv_svn>
    ```