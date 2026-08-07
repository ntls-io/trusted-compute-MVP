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

//! Canonical claim encoding shared with the frontend and the oracle.
//!
//! A claim is a flat map of string keys to string values, serialized as JCS
//! (RFC 8785) restricted to that subset: keys sorted lexicographically,
//! minimal separators, standard JSON escaping. The signed message is the
//! UTF-8 bytes of `relational-chain-claim:v1\n` followed by the canonical
//! JSON. Mirrors devops-acr/oracle/canonical.py and
//! ntc-web/lib/enclaveClaim.ts; changes must keep the shared test vector
//! passing in all three suites.

use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

pub const DOMAIN_PREFIX: &str = "relational-chain-claim:v1\n";

fn escape_json_string(value: &str, out: &mut String) {
    out.push('"');
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{0008}' => out.push_str("\\b"),
            '\u{000C}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                out.push_str(&format!("\\u{:04x}", c as u32));
            }
            c => out.push(c),
        }
    }
    out.push('"');
}

/// Canonical JSON for a flat string-valued claim (BTreeMap iterates sorted).
pub fn canonical_json(claim: &BTreeMap<String, String>) -> String {
    let mut out = String::from("{");
    for (i, (key, value)) in claim.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        escape_json_string(key, &mut out);
        out.push(':');
        escape_json_string(value, &mut out);
    }
    out.push('}');
    out
}

/// The exact bytes the wallet signs.
pub fn message_bytes(claim: &BTreeMap<String, String>) -> Vec<u8> {
    let mut bytes = DOMAIN_PREFIX.as_bytes().to_vec();
    bytes.extend_from_slice(canonical_json(claim).as_bytes());
    bytes
}

/// SHA-256 of the signed message, hex (the oracle's `claim_digest`).
pub fn digest_hex(claim: &BTreeMap<String, String>) -> String {
    hex::encode(Sha256::digest(message_bytes(claim)))
}

pub fn sha256_hex(data: &[u8]) -> String {
    hex::encode(Sha256::digest(data))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Cross-language canonicalization vector, pinned identically in
    /// devops-acr/tests/test_oracle.py and ntc-web/tests/enclaveClaim.test.ts.
    #[test]
    fn canonical_vector_digest() {
        let mut claim = BTreeMap::new();
        let entries = [
            ("version", "1".to_string()),
            ("action", "execute_python".to_string()),
            ("cluster", "devnet".to_string()),
            (
                "program",
                "CME2Dg7UEW82Hf99rQetEi7Hc5Db9JQPx6Azmx1eWbEE".to_string(),
            ),
            ("tx", bs58::encode(vec![2u8; 64]).into_string()),
            ("pool", bs58::encode(vec![1u8; 32]).into_string()),
            ("claimant", bs58::encode(vec![3u8; 32]).into_string()),
            (
                "payload_sha256",
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".to_string(),
            ),
            ("nonce", "00112233445566778899aabbccddeeff".to_string()),
            ("expiry", "1767225600".to_string()),
            (
                "github_url",
                "https://github.com/nautilus-project/py_compute_median/blob/main/script.py"
                    .to_string(),
            ),
            ("code_hash", "a".repeat(64)),
        ];
        for (key, value) in entries {
            claim.insert(key.to_string(), value);
        }
        assert_eq!(
            digest_hex(&claim),
            "600528edcf47bf38a4ced6da3b9565d0e43e8d408073ad38aa1eb4ee38098628"
        );
    }
}
