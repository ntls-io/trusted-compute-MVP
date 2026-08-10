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

//! The redemption commitment carried in the transaction's memo.
//!
//! A redeemer commits to their ephemeral key, their payload, and (for
//! compute) the code they intend to run, by hashing all three into a memo
//! instruction inside the same transaction that burns the DRT. The wallet's
//! transaction signature therefore covers the commitment, which is what lets
//! the enclave verify the request against something the claimant signed
//! without a second signature prompt.
//!
//! Three fixed-size 32-byte fields, so there is no delimiter ambiguity and
//! no canonicalization to keep in sync across languages. Mirrored by
//! ntc-web/lib/redemption.ts; the shared vector in `tests.rs` is pinned
//! byte-for-byte in that suite too.

use sha2::{Digest, Sha256};

/// Memo prefix identifying a v1 relational chain commitment.
pub const MEMO_PREFIX: &str = "rcc1:";

pub fn sha256_hex(data: &[u8]) -> String {
    hex::encode(Sha256::digest(data))
}

pub fn sha256(data: &[u8]) -> [u8; 32] {
    Sha256::digest(data).into()
}

/// Hash of the code identity a compute redemption commits to. Append and
/// pool initialization carry no code reference and commit to `sha256("")`.
pub fn code_digest(code: Option<(&str, &str)>) -> [u8; 32] {
    match code {
        None => sha256(b""),
        Some((github_url, code_hash)) => {
            let mut buf = Vec::with_capacity(github_url.len() + code_hash.len() + 1);
            buf.extend_from_slice(github_url.as_bytes());
            buf.push(0);
            buf.extend_from_slice(code_hash.as_bytes());
            sha256(&buf)
        }
    }
}

/// `sha256(ephemeral_pubkey ‖ sha256(payload) ‖ code_digest)`.
pub fn commitment(
    ephemeral_pubkey: &[u8; 32],
    payload: &[u8],
    code: Option<(&str, &str)>,
) -> [u8; 32] {
    let mut buf = [0u8; 96];
    buf[..32].copy_from_slice(ephemeral_pubkey);
    buf[32..64].copy_from_slice(&sha256(payload));
    buf[64..].copy_from_slice(&code_digest(code));
    sha256(&buf)
}

/// The exact memo string the transaction must carry.
pub fn memo_for(ephemeral_pubkey: &[u8; 32], payload: &[u8], code: Option<(&str, &str)>) -> String {
    format!(
        "{}{}",
        MEMO_PREFIX,
        hex::encode(commitment(ephemeral_pubkey, payload, code))
    )
}
