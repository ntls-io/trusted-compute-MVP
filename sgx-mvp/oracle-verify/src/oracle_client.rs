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

//! Outbound oracle client and local JWS verification.
//!
//! The enclave never trusts the host, DNS, or an unsigned response: every
//! assertion is a compact JWS verified against the Ed25519 oracle public key
//! pinned into the measured enclave image (ORACLE_ED25519_PUBKEY_HEX in the
//! Gramine manifest), then cross-checked field-by-field against the
//! wallet-signed claim.

use crate::claim::{now_unix, ClaimContext};
use crate::error::ApiError;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::Deserialize;
use std::collections::BTreeMap;
use std::time::Duration;

#[derive(Debug, Clone, Deserialize)]
pub struct OracleAssertion {
    pub iss: String,
    pub iat: i64,
    pub exp: i64,
    pub cluster: String,
    pub program: String,
    pub tx: String,
    pub slot: Option<u64>,
    pub action: String,
    pub pool: String,
    pub claimant: String,
    pub drt_type: Option<String>,
    pub execution_type: String,
    pub github_url: Option<String>,
    pub code_hash: Option<String>,
    pub payload_sha256: String,
    pub claim_digest: String,
}

/// Transport to the oracle; a trait so unit tests can mock outages,
/// timeouts, and forged responses without a network.
pub trait OracleTransport: Send + Sync {
    /// Submit the claim + wallet signature, returning the raw compact JWS.
    fn verify_chain_claim(
        &self,
        claim: &BTreeMap<String, String>,
        wallet_signature: &str,
    ) -> Result<String, ApiError>;
}

pub struct HttpOracleTransport {
    pub base_url: String,
    pub timeout: Duration,
}

impl OracleTransport for HttpOracleTransport {
    fn verify_chain_claim(
        &self,
        claim: &BTreeMap<String, String>,
        wallet_signature: &str,
    ) -> Result<String, ApiError> {
        let client = reqwest::blocking::Client::builder()
            .use_rustls_tls()
            .timeout(self.timeout)
            .build()
            .map_err(|e| ApiError::oracle_unavailable(format!("oracle client init: {e}")))?;
        let url = format!(
            "{}/oracle/v1/verify-chain-claim",
            self.base_url.trim_end_matches('/')
        );
        let response = client
            .post(url)
            .json(&serde_json::json!({
                "claim": claim,
                "wallet_signature": wallet_signature,
            }))
            .send()
            .map_err(|e| ApiError::oracle_unavailable(format!("oracle unreachable: {e}")))?;

        let status = response.status();
        let body: serde_json::Value = response.json().map_err(|e| {
            ApiError::oracle_unavailable(format!("oracle response unreadable: {e}"))
        })?;
        if !status.is_success() {
            // Surface the oracle's structured rejection distinctly; the
            // response is untrusted, so only the error text is relayed.
            let detail = body
                .get("detail")
                .map(|d| d.to_string())
                .unwrap_or_else(|| body.to_string());
            return Err(ApiError::oracle_rejected(
                409,
                "oracle_rejected",
                format!("oracle refused claim ({}): {}", status.as_u16(), detail),
            ));
        }
        body.get("assertion")
            .and_then(|a| a.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| ApiError::oracle_unavailable("oracle response missing assertion"))
    }
}

/// Verify a compact JWS (EdDSA) against the pinned oracle key and return
/// its payload. Rejects unexpected algorithms and malformed structure.
pub fn verify_jws(token: &str, oracle_pubkey: &[u8; 32]) -> Result<OracleAssertion, ApiError> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err(ApiError::assertion_invalid("malformed JWS"));
    }
    let header_bytes = URL_SAFE_NO_PAD
        .decode(parts[0])
        .map_err(|_| ApiError::assertion_invalid("bad JWS header encoding"))?;
    let header: serde_json::Value = serde_json::from_slice(&header_bytes)
        .map_err(|_| ApiError::assertion_invalid("bad JWS header"))?;
    if header.get("alg").and_then(|a| a.as_str()) != Some("EdDSA") {
        return Err(ApiError::assertion_invalid("unexpected JWS alg"));
    }

    let signature_bytes = URL_SAFE_NO_PAD
        .decode(parts[2])
        .map_err(|_| ApiError::assertion_invalid("bad JWS signature encoding"))?;
    let signature_array: [u8; 64] = signature_bytes
        .try_into()
        .map_err(|_| ApiError::assertion_invalid("JWS signature must be 64 bytes"))?;
    let verifying_key = VerifyingKey::from_bytes(oracle_pubkey)
        .map_err(|_| ApiError::internal("pinned oracle key is invalid"))?;
    let signing_input = format!("{}.{}", parts[0], parts[1]);
    verifying_key
        .verify(
            signing_input.as_bytes(),
            &Signature::from_bytes(&signature_array),
        )
        .map_err(|_| ApiError::assertion_invalid("JWS signature does not verify"))?;

    let payload_bytes = URL_SAFE_NO_PAD
        .decode(parts[1])
        .map_err(|_| ApiError::assertion_invalid("bad JWS payload encoding"))?;
    serde_json::from_slice(&payload_bytes)
        .map_err(|e| ApiError::assertion_invalid(format!("bad JWS payload: {e}")))
}

/// Require every assertion field to match the wallet-signed claim. The
/// oracle can only approve or deny what the claimant signed for; it cannot
/// substitute code, pools, or payloads.
pub fn cross_check(assertion: &OracleAssertion, claim: &ClaimContext) -> Result<(), ApiError> {
    if assertion.exp <= now_unix() {
        return Err(ApiError::assertion_invalid("oracle assertion has expired"));
    }
    if assertion.claim_digest != claim.digest_hex() {
        return Err(ApiError::assertion_invalid(
            "assertion digest does not match the wallet-signed claim",
        ));
    }
    let mismatch = |field: &str| {
        Err(ApiError::assertion_invalid(format!(
            "assertion {field} does not match the wallet-signed claim"
        )))
    };
    if assertion.cluster != claim.get("cluster") {
        return mismatch("cluster");
    }
    if assertion.program != claim.get("program") {
        return mismatch("program");
    }
    if assertion.tx != claim.get("tx") {
        return mismatch("tx");
    }
    if assertion.action != claim.action().as_str() {
        return mismatch("action");
    }
    if assertion.pool != claim.get("pool") {
        return mismatch("pool");
    }
    if assertion.claimant != claim.get("claimant") {
        return mismatch("claimant");
    }
    if assertion.payload_sha256 != claim.get("payload_sha256") {
        return mismatch("payload_sha256");
    }
    if assertion.execution_type != claim.action().expected_execution_type() {
        return mismatch("execution_type");
    }
    if claim.action().is_compute() {
        if assertion.github_url.as_deref() != Some(claim.get("github_url")) {
            return mismatch("github_url");
        }
        if assertion.code_hash.as_deref() != Some(claim.get("code_hash")) {
            return mismatch("code_hash");
        }
    }
    Ok(())
}
