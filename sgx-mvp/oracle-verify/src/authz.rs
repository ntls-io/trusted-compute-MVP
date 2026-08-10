// Nautilus Trusted Compute
// Copyright (C) 2026 Relational Network
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

//! End-to-end authorization of a protected request: local verification of
//! the claimant's signed transaction, oracle round-trip, pinned-key JWS
//! verification, and assertion cross-check. Pure over its inputs so unit
//! tests can drive it with a mock oracle transport.

use crate::claim::{Action, RedemptionRequest};
use crate::error::ApiError;
use crate::oracle_client::{cross_check, verify_jws, OracleAssertion, OracleTransport};
use std::time::Duration;

/// Enclave trust anchors. In production these come from the Gramine
/// manifest (measured into MRENCLAVE); tests construct them directly.
#[derive(Debug, Clone)]
pub struct EnclaveConfig {
    pub cluster: String,
    pub program: String,
    pub oracle_url: String,
    pub oracle_pubkey: [u8; 32],
    pub oracle_timeout: Duration,
}

impl EnclaveConfig {
    pub fn from_env() -> Result<Self, ApiError> {
        let pubkey_hex = std::env::var("ORACLE_ED25519_PUBKEY_HEX").map_err(|_| {
            ApiError::new(
                503,
                "enclave_unconfigured",
                "ORACLE_ED25519_PUBKEY_HEX not set",
            )
        })?;
        let pubkey_bytes = hex::decode(&pubkey_hex)
            .map_err(|_| ApiError::new(503, "enclave_unconfigured", "oracle pubkey is not hex"))?;
        let oracle_pubkey: [u8; 32] = pubkey_bytes.try_into().map_err(|_| {
            ApiError::new(
                503,
                "enclave_unconfigured",
                "oracle pubkey must be 32 bytes",
            )
        })?;
        Ok(EnclaveConfig {
            cluster: std::env::var("EXPECTED_CLUSTER").unwrap_or_else(|_| "devnet".to_string()),
            program: std::env::var("EXPECTED_PROGRAM_ID")
                .unwrap_or_else(|_| "CME2Dg7UEW82Hf99rQetEi7Hc5Db9JQPx6Azmx1eWbEE".to_string()),
            oracle_url: std::env::var("ORACLE_URL")
                .map_err(|_| ApiError::new(503, "enclave_unconfigured", "ORACLE_URL not set"))?,
            oracle_pubkey,
            oracle_timeout: Duration::from_secs(
                std::env::var("ORACLE_TIMEOUT_SECONDS")
                    .ok()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(15),
            ),
        })
    }
}

/// Verify the request against the claimant's signed transaction, without
/// contacting the oracle. Used for both the full authorization path and the
/// cached-retry fast path.
#[allow(clippy::too_many_arguments)]
pub fn validate_locally(
    action: Action,
    signed_transaction_b64: &str,
    payload: &str,
    github_url: Option<&str>,
    code_hash: Option<&str>,
    ephemeral_pubkey: &str,
    ephemeral_signature: &str,
    config: &EnclaveConfig,
) -> Result<RedemptionRequest, ApiError> {
    RedemptionRequest::verify(
        action,
        signed_transaction_b64,
        payload,
        github_url,
        code_hash,
        ephemeral_pubkey,
        ephemeral_signature,
        &config.program,
    )
}

/// Full authorization: the oracle round-trip with local JWS verification
/// against the pinned key and a cross-check against the verified transaction.
pub fn authorize(
    request: &RedemptionRequest,
    transport: &dyn OracleTransport,
    config: &EnclaveConfig,
) -> Result<OracleAssertion, ApiError> {
    let jws = transport.verify_transaction(request.tx_signature())?;
    let assertion = verify_jws(&jws, &config.oracle_pubkey)?;
    cross_check(&assertion, request, &config.cluster, &config.program)?;
    Ok(assertion)
}
