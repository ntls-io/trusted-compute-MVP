#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Relational Network
#
# Periodic health check for the sgx-mvp enclave, driven by health-check.timer.
#
# Restarts the enclave only when it is genuinely unhealthy, and never while a
# deploy is in progress: the CD pipeline drops a /opt/sgx-mvp/.deploying lock
# and stops the timer, but the lock is also checked here in case the timer
# fires between the two.

set -uo pipefail

APP_DIR=/opt/sgx-mvp
DEPLOY_LOCK="${APP_DIR}/.deploying"
HEALTH_URL="https://127.0.0.1:8081/health"
RETRIES=3
RETRY_DELAY=10

log() { echo "[health-check] $*"; }

if [ -f "${DEPLOY_LOCK}" ]; then
    log "deploy in progress (${DEPLOY_LOCK} present) — skipping"
    exit 0
fi

if ! systemctl is-active --quiet enclave; then
    log "enclave.service is not active — leaving it to systemd's Restart policy"
    exit 0
fi

# -k because the enclave serves an RA-TLS self-signed certificate: trust comes
# from remote attestation, not the web PKI.
for attempt in $(seq 1 "${RETRIES}"); do
    if curl -sfk --max-time 10 "${HEALTH_URL}" > /dev/null; then
        log "healthy"
        exit 0
    fi
    log "health check failed (attempt ${attempt}/${RETRIES})"
    [ "${attempt}" -lt "${RETRIES}" ] && sleep "${RETRY_DELAY}"
done

# Re-check the lock: a deploy may have started while we were retrying.
if [ -f "${DEPLOY_LOCK}" ]; then
    log "deploy started during retries — not restarting"
    exit 0
fi

log "unhealthy after ${RETRIES} attempts — restarting enclave.service"
journalctl -u enclave --no-pager -n 50 || true
systemctl restart enclave
exit 1
