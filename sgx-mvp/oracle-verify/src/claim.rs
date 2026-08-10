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

//! In-enclave verification of a redemption request against the claimant's
//! own signed transaction.
//!
//! The enclave never trusts oracle assertions alone. Before the oracle is
//! contacted at all, the request must be shown to match a commitment the
//! claimant's wallet signed as part of the burn transaction (paper Appendix
//! C1, "checked against authenticated ledger state rather than trusted as
//! oracle assertions").

use crate::canonical;
use crate::error::ApiError;
use crate::soltx::{self, ParsedTransaction};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use std::time::{SystemTime, UNIX_EPOCH};

pub const MAX_GITHUB_URL_LENGTH: usize = 200;

/// Domain separation for the ephemeral key's proof of possession, so the
/// signature cannot be replayed into any other protocol.
pub const POSSESSION_PREFIX: &[u8] = b"relational-possession:v1\n";

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

pub fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn is_lower_hex(value: &str, len: usize) -> bool {
    value.len() == len
        && value
            .chars()
            .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
}

fn decode_key(value: &str) -> Result<[u8; 32], ApiError> {
    bs58::decode(value)
        .into_vec()
        .ok()
        .and_then(|bytes| <[u8; 32]>::try_from(bytes).ok())
        .ok_or_else(|| ApiError::invalid_claim("expected a base58 32-byte public key"))
}

/// A redemption request whose commitment has been verified against the
/// claimant's signed transaction.
#[derive(Debug, Clone)]
pub struct RedemptionRequest {
    pub action: Action,
    pub tx: ParsedTransaction,
    pub ephemeral_pubkey: [u8; 32],
    pub github_url: Option<String>,
    pub code_hash: Option<String>,
}

impl RedemptionRequest {
    /// Verify the transaction signature, the memo commitment, and the
    /// ephemeral key's proof of possession. Nothing here touches the network.
    #[allow(clippy::too_many_arguments)]
    pub fn verify(
        action: Action,
        signed_transaction_b64: &str,
        payload: &str,
        github_url: Option<&str>,
        code_hash: Option<&str>,
        ephemeral_pubkey_b58: &str,
        ephemeral_signature_b58: &str,
        expected_program: &str,
    ) -> Result<Self, ApiError> {
        // 1. The claimant's own signed transaction.
        let raw = BASE64
            .decode(signed_transaction_b64)
            .map_err(|_| ApiError::invalid_claim("signed_transaction is not valid base64"))?;
        let tx = soltx::parse_and_verify(&raw)?;

        // 2. It must actually invoke the program this enclave is bound to.
        let program_key = decode_key(expected_program)
            .map_err(|_| ApiError::internal("configured program id is not a valid address"))?;
        if !tx.has_account(&program_key) {
            return Err(ApiError::invalid_claim(
                "transaction does not reference the DRT program this enclave is bound to",
            ));
        }

        // 3. Code metadata: required and well-formed for compute, absent
        //    otherwise. Checked before it enters the commitment so a
        //    malformed value fails closed rather than simply mismatching.
        let (github_url, code_hash) = if action.is_compute() {
            let url = github_url.unwrap_or_default();
            let hash = code_hash.unwrap_or_default();
            if !url.starts_with("https://github.com/") || url.len() > MAX_GITHUB_URL_LENGTH {
                return Err(ApiError::new(
                    400,
                    "code_metadata_invalid",
                    "github_url must be a https://github.com/ URL",
                ));
            }
            if !is_lower_hex(hash, 64) {
                return Err(ApiError::new(
                    400,
                    "code_metadata_invalid",
                    "code_hash must be 64 lowercase hex chars",
                ));
            }
            (Some(url.to_string()), Some(hash.to_string()))
        } else {
            if github_url.is_some() || code_hash.is_some() {
                return Err(ApiError::invalid_claim(
                    "code metadata is only accepted for compute actions",
                ));
            }
            (None, None)
        };

        // 4. The memo must equal the commitment over exactly what was sent.
        let ephemeral_pubkey = decode_key(ephemeral_pubkey_b58)?;
        let code = match (github_url.as_deref(), code_hash.as_deref()) {
            (Some(url), Some(hash)) => Some((url, hash)),
            _ => None,
        };
        let expected_memo = canonical::memo_for(&ephemeral_pubkey, payload.as_bytes(), code);
        if tx.memo_str()? != expected_memo {
            return Err(ApiError::new(
                400,
                "commitment_mismatch",
                "the memo committed on-chain does not cover this payload, code reference, and ephemeral key",
            ));
        }

        // 5. Proof that the caller holds the committed ephemeral key, so a
        //    bystander who saw the finalized redemption cannot claim it.
        let signature_bytes = bs58::decode(ephemeral_signature_b58)
            .into_vec()
            .ok()
            .and_then(|bytes| <[u8; 64]>::try_from(bytes).ok())
            .ok_or_else(|| {
                ApiError::new(
                    400,
                    "possession_proof_invalid",
                    "ephemeral_signature must be a base58 64-byte signature",
                )
            })?;
        let mut message = POSSESSION_PREFIX.to_vec();
        message.extend_from_slice(&tx.signature);
        VerifyingKey::from_bytes(&ephemeral_pubkey)
            .map_err(|_| {
                ApiError::new(
                    400,
                    "possession_proof_invalid",
                    "ephemeral_pubkey is not a valid Ed25519 public key",
                )
            })?
            .verify(&message, &Signature::from_bytes(&signature_bytes))
            .map_err(|_| {
                ApiError::new(
                    400,
                    "possession_proof_invalid",
                    "ephemeral key possession proof does not verify",
                )
            })?;

        Ok(RedemptionRequest {
            action,
            tx,
            ephemeral_pubkey,
            github_url,
            code_hash,
        })
    }

    /// Base58 transaction signature: the oracle's lookup key and the replay
    /// ledger's identity for this redemption.
    pub fn tx_signature(&self) -> &str {
        &self.tx.signature_b58
    }

    /// The redeeming wallet, taken from the signature we verified.
    pub fn claimant(&self) -> String {
        bs58::encode(self.tx.fee_payer).into_string()
    }
}
