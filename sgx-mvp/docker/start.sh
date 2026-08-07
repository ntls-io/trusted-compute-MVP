#!/bin/sh
# Nautilus Trusted Compute
# Copyright (C) 2026 Relational Network
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

# Start script for the SGX container with DCAP RA-TLS attestation.
#
# 1. Starts AESM as root for SGX attestation support
# 2. Prepares SGX device groups and the persistent /data mount
# 3. Forwards 8081 -> 127.0.0.1:8080 (the Rust server binds loopback only)
# 4. Drops privileges to the fixed service user before launching gramine-sgx
#
# NOTE: The enclave is signed at docker build time. No signing key is needed at
# runtime. MRENCLAVE and MRSIGNER are fixed for every container started from
# the same image.

set -eu

APP_USER=relational
DATA_DIR=/data
LISTEN_PORT=8081
ENCLAVE_PORT=8080
STARTUP_UMASK=${SGX_MVP_STARTUP_UMASK:-027}

log() {
    printf '%s\n' "$*"
}

warn() {
    printf 'warning: %s\n' "$*" >&2
}

fatal() {
    printf 'FATAL: %s\n' "$*" >&2
    exit 1
}

app_uid() {
    id -u "${APP_USER}"
}

app_gid() {
    id -g "${APP_USER}"
}

user_in_group() {
    _user=$1
    _group=$2
    id -nG "${_user}" | tr ' ' '\n' | grep -Fx "${_group}" >/dev/null 2>&1
}

run_as_app() {
    if command -v runuser >/dev/null 2>&1; then
        runuser -u "${APP_USER}" -- "$@"
        return
    fi

    if command -v setpriv >/dev/null 2>&1; then
        setpriv --reuid "$(app_uid)" --regid "$(app_gid)" --init-groups "$@"
        return
    fi

    if command -v su >/dev/null 2>&1; then
        su -s /bin/sh "${APP_USER}" -c 'exec "$@"' sh "$@"
        return
    fi

    fatal "No supported privilege drop helper found (expected one of: runuser, setpriv, su)."
}

exec_as_app() {
    if command -v setpriv >/dev/null 2>&1; then
        exec setpriv --reuid "$(app_uid)" --regid "$(app_gid)" --init-groups "$@"
    fi

    if command -v runuser >/dev/null 2>&1; then
        exec runuser -u "${APP_USER}" -- "$@"
    fi

    if command -v su >/dev/null 2>&1; then
        exec su -s /bin/sh "${APP_USER}" -c 'exec "$@"' sh "$@"
    fi

    fatal "No supported privilege drop helper found (expected one of: setpriv, runuser, su)."
}

device_accessible_as_app() {
    _device=$1
    run_as_app test -r "${_device}" && run_as_app test -w "${_device}"
}

ensure_runtime_group() {
    _gid=$1
    _device=$2

    if [ "${_gid}" = "0" ]; then
        if ! device_accessible_as_app "${_device}"; then
            warn "${_device} is owned by GID 0 and is not accessible to ${APP_USER}. Non-root SGX access may require host-side device permission changes."
        fi
        return 0
    fi

    _group_name=$(getent group "${_gid}" | cut -d: -f1 || true)
    if [ -z "${_group_name}" ]; then
        _group_name="sgx-mvp-${_gid}"
        groupadd --gid "${_gid}" "${_group_name}"
    fi

    if user_in_group "${APP_USER}" "${_group_name}"; then
        return 0
    fi

    usermod -a -G "${_group_name}" "${APP_USER}"
}

configure_sgx_access() {
    _seen_gids=" "

    # Both the /dev/sgx/* and legacy /dev/sgx_* device naming schemes are in use
    # depending on the driver and Azure VM image.
    for _device in /dev/sgx/enclave /dev/sgx/provision /dev/sgx_enclave /dev/sgx_provision; do
        if [ ! -e "${_device}" ]; then
            continue
        fi

        _gid=$(stat -c '%g' "${_device}")
        case " ${_seen_gids} " in
            *" ${_gid} "*) continue ;;
        esac
        _seen_gids="${_seen_gids}${_gid} "

        ensure_runtime_group "${_gid}" "${_device}"
    done
}

validate_sgx_access() {
    _found=0

    for _device in /dev/sgx/enclave /dev/sgx/provision /dev/sgx_enclave /dev/sgx_provision; do
        if [ ! -e "${_device}" ]; then
            continue
        fi
        _found=1

        if ! device_accessible_as_app "${_device}"; then
            fatal "${_device} is not accessible to ${APP_USER}. Fix the host device permissions or container group mapping before starting the server."
        fi
    done

    if [ "${_found}" -eq 0 ]; then
        fatal "No SGX device found. Pass them through with --device=/dev/sgx_enclave --device=/dev/sgx_provision."
    fi
}

prepare_data_dir() {
    if [ -e "${DATA_DIR}" ] && [ ! -d "${DATA_DIR}" ]; then
        fatal "${DATA_DIR} exists but is not a directory."
    fi

    mkdir -p "${DATA_DIR}"

    # Auto-fix ownership so the non-root service user can write. Runs as root
    # before privilege drop, so it works whether the host bind-mount was
    # pre-created or auto-created by Docker as root:root.
    chown -R "$(app_uid):$(app_gid)" "${DATA_DIR}"
    chmod 0750 "${DATA_DIR}"

    if ! run_as_app test -w "${DATA_DIR}"; then
        fatal "${DATA_DIR} is not writable by ${APP_USER} after chown. Check that the bind mount allows ownership changes."
    fi
}

if [ "$(id -u)" -ne 0 ]; then
    fatal "This container must start as root so it can bootstrap AESM and then drop to ${APP_USER}."
fi

if ! id "${APP_USER}" >/dev/null 2>&1; then
    fatal "Required runtime user ${APP_USER} is missing from the image."
fi

umask "${STARTUP_UMASK}"

/restart_aesm.sh

if [ ! -f /app/sgx-mvp.manifest.sgx ]; then
    fatal "/app/sgx-mvp.manifest.sgx not found. Rebuild the image with: --secret id=sgx-key,src=/path/to/enclave-key.pem"
fi

configure_sgx_access
validate_sgx_access
prepare_data_dir

# The Rust server binds 127.0.0.1:8080 (src/main.rs), so expose it externally.
socat "TCP-LISTEN:${LISTEN_PORT},fork,reuseaddr" "TCP:127.0.0.1:${ENCLAVE_PORT}" &

log "Enclave measurements:"
gramine-sgx-sigstruct-view /app/sgx-mvp.sig \
    | grep -E "mr_enclave|mr_signer|isv_prod_id|isv_svn|debug_enclave"

log "Starting sgx-mvp with DCAP RA-TLS attestation as ${APP_USER}..."
log "Server will be available at https://0.0.0.0:${LISTEN_PORT}"

# gramine-sgx executes the manifest, whose entrypoint is gramine-ratls. That
# generates the TLS cert/key with DCAP attestation evidence, then execs the
# Rust server binary inside the enclave.
exec_as_app gramine-sgx sgx-mvp
