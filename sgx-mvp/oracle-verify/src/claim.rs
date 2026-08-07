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

//! Wallet-signed chain claims: shape validation and in-enclave Ed25519
//! verification. The enclave never trusts oracle assertions alone — every
//! assertion is cross-checked against a claim the claimant's wallet signed
//! (plan.md, "SGX enforcement").

use crate::canonical;
use crate::error::ApiError;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

pub const MAX_GITHUB_URL_LENGTH: usize = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    PoolInitialize,
    Append,
    ExecuteWasm,
    ExecutePython,
}

impl Action {
    pub fn as_str(&self) -> &'static str {
        match self {
            Action::PoolInitialize => "pool_initialize",
            Action::Append => "append",
            Action::ExecuteWasm => "execute_wasm",
            Action::ExecutePython => "execute_python",
        }
    }

    /// The DrtRedeemed execution_type the oracle must have verified.
    pub fn expected_execution_type(&self) -> &'static str {
        match self {
            Action::PoolInitialize => "pool_initialize",
            Action::Append => "append",
            Action::ExecuteWasm => "wasm",
            Action::ExecutePython => "python",
        }
    }

    pub fn is_compute(&self) -> bool {
        matches!(self, Action::ExecuteWasm | Action::ExecutePython)
    }
}

const BASE_FIELDS: [&str; 10] = [
    "version",
    "action",
    "cluster",
    "program",
    "tx",
    "pool",
    "claimant",
    "payload_sha256",
    "nonce",
    "expiry",
];
const COMPUTE_FIELDS: [&str; 2] = ["github_url", "code_hash"];

fn is_lower_hex(value: &str, min: usize, max: usize) -> bool {
    value.len() >= min
        && value.len() <= max
        && value
            .chars()
            .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
}

fn is_base58_of_length(value: &str, length: usize) -> bool {
    bs58::decode(value)
        .into_vec()
        .map(|bytes| bytes.len() == length)
        .unwrap_or(false)
}

pub fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// A validated wallet-signed claim.
#[derive(Debug, Clone)]
pub struct ClaimContext {
    map: BTreeMap<String, String>,
    action: Action,
}

impl ClaimContext {
    /// Validate the claim's shape against the v1 schema and the enclave's
    /// pinned cluster/program. Fails closed on any anomaly.
    pub fn validate(
        map: BTreeMap<String, String>,
        expected_action: Action,
        expected_cluster: &str,
        expected_program: &str,
    ) -> Result<Self, ApiError> {
        let action_field = map
            .get("action")
            .ok_or_else(|| ApiError::invalid_claim("missing action"))?;
        if action_field != expected_action.as_str() {
            return Err(ApiError::invalid_claim(format!(
                "claim action {:?} does not match this endpoint",
                action_field
            )));
        }

        let mut expected_fields: Vec<&str> = BASE_FIELDS.to_vec();
        if expected_action.is_compute() {
            expected_fields.extend(COMPUTE_FIELDS);
        }
        let keys: Vec<&str> = map.keys().map(|k| k.as_str()).collect();
        let mut sorted_expected = expected_fields.clone();
        sorted_expected.sort_unstable();
        if keys != sorted_expected {
            return Err(ApiError::invalid_claim(
                "claim fields do not match the v1 schema",
            ));
        }

        let get = |key: &str| map.get(key).map(|s| s.as_str()).unwrap_or_default();

        if get("version") != "1" {
            return Err(ApiError::invalid_claim("unsupported claim version"));
        }
        if get("cluster") != expected_cluster {
            return Err(ApiError::invalid_claim(
                "claim cluster not bound to this enclave",
            ));
        }
        if get("program") != expected_program {
            return Err(ApiError::invalid_claim(
                "claim program not bound to this enclave",
            ));
        }
        if !is_base58_of_length(get("pool"), 32) {
            return Err(ApiError::invalid_claim("pool is not a valid address"));
        }
        if !is_base58_of_length(get("claimant"), 32) {
            return Err(ApiError::invalid_claim("claimant is not a valid address"));
        }
        if !is_base58_of_length(get("tx"), 64) {
            return Err(ApiError::invalid_claim("tx is not a valid signature"));
        }
        if !is_lower_hex(get("payload_sha256"), 64, 64) {
            return Err(ApiError::invalid_claim(
                "payload_sha256 must be 64 hex chars",
            ));
        }
        if !is_lower_hex(get("nonce"), 16, 64) {
            return Err(ApiError::invalid_claim("nonce must be 16-64 hex chars"));
        }
        let expiry: i64 = get("expiry")
            .parse()
            .map_err(|_| ApiError::invalid_claim("expiry must be a unix timestamp"))?;
        if expiry <= now_unix() {
            return Err(ApiError::new(400, "claim_expired", "claim has expired"));
        }

        if expected_action.is_compute() {
            let url = get("github_url");
            if !url.starts_with("https://github.com/") || url.len() > MAX_GITHUB_URL_LENGTH {
                return Err(ApiError::new(
                    400,
                    "code_metadata_invalid",
                    "github_url must be a https://github.com/ URL",
                ));
            }
            if !is_lower_hex(get("code_hash"), 64, 64) {
                return Err(ApiError::new(
                    400,
                    "code_metadata_invalid",
                    "code_hash must be 64 hex chars",
                ));
            }
        }

        Ok(ClaimContext {
            map,
            action: expected_action,
        })
    }

    pub fn action(&self) -> Action {
        self.action
    }

    pub fn get(&self, key: &str) -> &str {
        self.map.get(key).map(|s| s.as_str()).unwrap_or_default()
    }

    pub fn digest_hex(&self) -> String {
        canonical::digest_hex(&self.map)
    }

    pub fn map(&self) -> &BTreeMap<String, String> {
        &self.map
    }

    /// Verify the claimant's Ed25519 wallet signature over the canonical
    /// claim message, inside the enclave.
    pub fn verify_wallet_signature(&self, signature_b58: &str) -> Result<(), ApiError> {
        let signature_bytes = bs58::decode(signature_b58)
            .into_vec()
            .map_err(|_| ApiError::wallet_signature_invalid("signature is not base58"))?;
        let signature_array: [u8; 64] = signature_bytes
            .try_into()
            .map_err(|_| ApiError::wallet_signature_invalid("signature must be 64 bytes"))?;
        let pubkey_bytes = bs58::decode(self.get("claimant"))
            .into_vec()
            .map_err(|_| ApiError::wallet_signature_invalid("claimant is not base58"))?;
        let pubkey_array: [u8; 32] = pubkey_bytes
            .try_into()
            .map_err(|_| ApiError::wallet_signature_invalid("claimant key must be 32 bytes"))?;
        let verifying_key = VerifyingKey::from_bytes(&pubkey_array)
            .map_err(|_| ApiError::wallet_signature_invalid("claimant key is invalid"))?;
        verifying_key
            .verify(
                &canonical::message_bytes(&self.map),
                &Signature::from_bytes(&signature_array),
            )
            .map_err(|_| ApiError::wallet_signature_invalid("wallet signature does not verify"))
    }

    /// Require the request payload bytes to hash to the wallet-signed value.
    pub fn verify_payload(&self, payload: &str) -> Result<(), ApiError> {
        let actual = canonical::sha256_hex(payload.as_bytes());
        if actual != self.get("payload_sha256") {
            return Err(ApiError::new(
                400,
                "payload_mismatch",
                "request payload does not hash to the wallet-signed payload_sha256",
            ));
        }
        Ok(())
    }
}
