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

//! End-to-end authorization of a protected request: local claim checks,
//! oracle round-trip, pinned-key JWS verification, and claim/assertion
//! cross-check. Pure over its inputs so unit tests can drive it with a mock
//! oracle transport.

use crate::claim::{Action, ClaimContext};
use crate::error::ApiError;
use crate::oracle_client::{cross_check, verify_jws, OracleAssertion, OracleTransport};
use std::collections::BTreeMap;
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

/// Validate the claim locally (shape, payload hash, wallet signature)
/// without contacting the oracle. Used for both the full authorization path
/// and the cached-retry fast path.
pub fn validate_locally(
    action: Action,
    claim_map: BTreeMap<String, String>,
    wallet_signature: &str,
    payload: &str,
    config: &EnclaveConfig,
) -> Result<ClaimContext, ApiError> {
    let claim = ClaimContext::validate(claim_map, action, &config.cluster, &config.program)?;
    claim.verify_payload(payload)?;
    claim.verify_wallet_signature(wallet_signature)?;
    Ok(claim)
}

/// Full authorization: local checks, then the oracle round-trip with local
/// JWS verification against the pinned key and field-by-field cross-check.
pub fn authorize(
    claim: &ClaimContext,
    wallet_signature: &str,
    transport: &dyn OracleTransport,
    config: &EnclaveConfig,
) -> Result<OracleAssertion, ApiError> {
    let jws = transport.verify_chain_claim(claim.map(), wallet_signature)?;
    let assertion = verify_jws(&jws, &config.oracle_pubkey)?;
    cross_check(&assertion, claim)?;
    Ok(assertion)
}
