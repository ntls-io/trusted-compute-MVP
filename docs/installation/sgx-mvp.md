# SGX MVP Installation Guide

## Prerequisites

Before installing the Nautilus MVP, ensure your system meets the following requirements:

### System Requirements

* Ubuntu 20.04
* Intel CPU with SGX support
* Support for DCAP attestation (e.g. Azure)

### Required Software

#### 1. Python Environment

* Python 3.8
* Python development packages

```sh
sudo apt-get update
sudo apt-get install libffi-dev
sudo apt-get install python3.8-dev
sudo apt-get install python3-numpy python3-scipy
```

#### 2. Gramine

Follow the instructions in the [Gramine Installation Guide](https://gramine.readthedocs.io/en/stable/installation.html#install-gramine-packages-1) under "Install Gramine packages" and [Prepare a signing key](https://gramine.readthedocs.io/en/stable/quickstart.html#prepare-a-signing-key).

#### 3. Rust Environment

```sh
# Install Rust using rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

#### 4. General Dependencies

```sh
sudo apt-get update
sudo apt-get install -y libssl-dev ca-certificates
```

#### 5. Install Azure DCAP Attestation dependancies

```sh
wget -qO- https://packages.microsoft.com/keys/microsoft.asc | sudo apt-key add
sudo add-apt-repository "deb [arch=amd64] https://packages.microsoft.com/ubuntu/`lsb_release -rs`/prod `lsb_release -cs` main"
sudo apt install az-dcap-client

sudo apt update
sudo apt-get install pkg-config
sudo apt install sgx-aesm-service libsgx-aesm-ecdsa-plugin libsgx-aesm-quote-ex-plugin
```

The AESM service should be up and running. To confirm that, use:

```sh
sudo systemctl status aesmd.service
```

Setup Azure DCAP

```sh
export AZDCAP_COLLATERAL_VERSION=v4
export AZDCAP_DEBUG_LOG_LEVEL=Info
export RA_TLS_ALLOW_DEBUG_ENCLAVE_INSECURE=1
export RA_TLS_ALLOW_OUTDATED_TCB_INSECURE=1
export RA_TLS_ALLOW_HW_CONFIG_NEEDED=1
export RA_TLS_ALLOW_SW_HARDENING_NEEDED=1
```

Make sure to always restart the `aesmd.service` after updating the configuration, via:

```sh
sudo systemctl restart aesmd.service
```

### Verification Steps

#### 1. Check Python Version

```sh
python3 --version  # Should show 3.8.x
```

#### 2. Verify Rust installation

```sh
rustc --version
cargo --version
```

#### 3. Check SGX compatibility (Gramine)

[Gramine docs](https://gramine.readthedocs.io/en/stable/manpages/is-sgx-available.html#cmdoption-is-sgx-available-quiet)

```sh
is-sgx-available
```

## SGX Setup

Ensure you have a [Gramine signing key](https://gramine.readthedocs.io/en/stable/quickstart.html#prepare-a-signing-key)

#### 1. Manifest Configuration

Check the paths in `sgx-mvp.manifest.template` and modify if necessary.

#### 2. Build Instructions

```sh
make SGX=1 mvp RA_TYPE=dcap
```

#### 3. Run NTLS MVP

```sh
gramine-sgx sgx-mvp
```
