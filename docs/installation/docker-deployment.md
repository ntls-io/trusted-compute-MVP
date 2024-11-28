# **Docker Deployment Guide**

This guide explains how to build and run the Nautilus SGX MVP using Docker containers.

## Prerequisites

Before deploying the Nautilus MVP with Docker, ensure your system meets the following requirements:

### System Requirements

* Ubuntu 20.04
* Intel CPU with SGX support
* Docker installed
* Support for DCAP attestation

### Required Components

1. **Docker Environment**
    - Docker Engine
    - SGX device drivers mounted

    ```sh
    # Verify Docker installation
    docker --version
    
    # Check SGX devices
    ls /dev/sgx*
    ```

2. **Signing Key Setup**

    Generate a development signing key:

    ```sh
    gramine-sgx-gen-private-key /keys/enclave-key.pem
    chmod 400 /keys/enclave-key.pem
    ```

    !!! warning "Production Environment"
        For production environments, use your production signing key instead of generating a new one.


### Build Instructions

1. **Navigate to Docker Directory**

    ```sh
    cd sgx-mvp/docker
    ```

2. **Build Docker Image**

    For Ubuntu 20.04:
    ```sh
    sudo ./build.sh ubuntu20
    ```

3. **Run Container**

    ```sh
    sudo docker run -p 8080:8081 \
        --device=/dev/sgx_enclave \
        --device=/dev/sgx_provision \
        sgx-mvp:stable-focal
    ```

### Verification Steps

1. **Check Container Status**

    ```sh
    docker ps
    ```

2. **Verify Service Health**

    ```sh
    curl -k https://localhost:8080/health ; echo
    ```

3. **AESM Service**

    The container automatically handles the AESM service startup through the `/restart_aesm.sh` script, so no manual verification is needed.


## Configuration

### Environment Variables

* `HOST`: Service host address (default: 127.0.0.1)
* `PORT`: Internal service port (default: 8080)

### Port Mappings

* Internal port: 8080
* External port: 8081 (configurable via Docker run command)