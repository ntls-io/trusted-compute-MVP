ARG UBUNTU_IMAGE=ubuntu:20.04
FROM ${UBUNTU_IMAGE}

# ARGs cannot be grouped since each FROM in a Dockerfile initiates a new build
# stage, resulting in the loss of ARG values from earlier stages.
ARG UBUNTU_CODENAME=focal

# Base Gramine setup
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y curl gnupg2 binutils

RUN curl -fsSLo /usr/share/keyrings/gramine-keyring.gpg https://packages.gramineproject.io/gramine-keyring.gpg && \
    echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/gramine-keyring.gpg] https://packages.gramineproject.io/ '${UBUNTU_CODENAME}' main' > /etc/apt/sources.list.d/gramine.list

RUN curl -fsSLo /usr/share/keyrings/intel-sgx-deb.key https://download.01.org/intel-sgx/sgx_repo/ubuntu/intel-sgx-deb.key && \
    echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/intel-sgx-deb.key] https://download.01.org/intel-sgx/sgx_repo/ubuntu '${UBUNTU_CODENAME}' main' > /etc/apt/sources.list.d/intel-sgx.list

# Install Gramine and dependencies
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y gramine \
    sgx-aesm-service \
    libsgx-aesm-launch-plugin \
    libsgx-aesm-epid-plugin \
    libsgx-aesm-quote-ex-plugin \
    libsgx-aesm-ecdsa-plugin \
    libsgx-dcap-quote-verify \
    psmisc \
    git \
    make \
    cmake \
    python3.8-dev \
    python3-numpy \
    python3-scipy \
    libffi-dev \
    libssl-dev \
    ca-certificates \
    pkg-config \
    wget \
    software-properties-common \
    clang \
    llvm && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set Clang as the default compiler
ENV CC=clang
ENV CXX=clang++

# Install Azure DCAP client
RUN wget -qO- https://packages.microsoft.com/keys/microsoft.asc | apt-key add - && \
    DEBIAN_FRONTEND=noninteractive add-apt-repository "deb [arch=amd64] https://packages.microsoft.com/ubuntu/20.04/prod focal main" && \
    apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y az-dcap-client && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Clone only the sgx-mvp directory
WORKDIR /app
RUN git config --global core.sparseCheckout true && \
    git clone --depth 1 --filter=blob:none https://github.com/ntls-io/trusted-compute-MVP.git && \
    cd trusted-compute-MVP && \
    git sparse-checkout init --cone && \
    git sparse-checkout set sgx-mvp

# Create necessary library directory
RUN mkdir -p /lib/x86_64-pc-linux-gnu && \
    ln -s /lib/x86_64-linux-gnu/* /lib/x86_64-pc-linux-gnu/

RUN mkdir -p /var/run/aesmd/

# Build the MVP with temporarily mounted key
RUN --mount=type=secret,id=enclave_key,target=/app/trusted-compute-MVP/sgx-mvp/keys/enclave-key.pem \
    cd /app/trusted-compute-MVP/sgx-mvp && \
    make SGX=1 RA_TYPE=dcap

# Verify signing key cleanup
RUN echo "Verifying key cleanup..." && \
    if [ -f /app/trusted-compute-MVP/sgx-mvp/keys/enclave-key.pem ]; then \
        echo "ERROR: Signing key still present!" && \
        ls -l /app/trusted-compute-MVP/sgx-mvp/keys/enclave-key.pem && \
        exit 1; \
    else \
        echo "SUCCESS: Verified that signing key was properly removed." && \
        ls -la /app/trusted-compute-MVP/sgx-mvp/keys/ || echo "keys directory does not exist (expected)"; \
    fi

COPY restart_aesm.sh /restart_aesm.sh

# Expose the server port
EXPOSE 8080
ENV HOST=127.0.0.1
ENV PORT=8080

# Add socat for port forwarding
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y socat && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create a startup script to handle port forwarding
RUN echo '#!/bin/bash\n\
/restart_aesm.sh\n\
socat TCP-LISTEN:8081,fork TCP:127.0.0.1:8080 & \n\
cd /app/trusted-compute-MVP/sgx-mvp && \
gramine-sgx sgx-mvp\n'\
> /start.sh && chmod +x /start.sh

# Set the working directory where the manifest file is located
WORKDIR /app/trusted-compute-MVP/sgx-mvp

ENTRYPOINT ["/bin/sh", "-c"]
CMD ["/start.sh"]