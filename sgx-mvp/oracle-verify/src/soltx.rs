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

//! Minimal legacy Solana transaction deserializer.
//!
//! This is the enclave's only piece of chain-format knowledge, and it is
//! deliberately the smallest thing that works: it splits signatures from the
//! message, verifies the fee payer's Ed25519 signature over the message
//! bytes, and extracts the SPL Memo instruction's data. It performs **no**
//! RPC, no consensus checks, and no ledger verification — those remain the
//! oracle's job (paper Appendix C1, "the enclave should remain minimal and
//! only verify the smallest necessary evidence").
//!
//! It exists because the enclave must verify *something the claimant signed*.
//! Without it a compromised oracle could assert redemptions for transactions
//! that never happened, which is a safety failure rather than the liveness
//! failure C1 permits.
//!
//! Every input is untrusted and attacker-controlled. The parser never
//! panics, never indexes without a bounds check, and never allocates on an
//! attacker-supplied length: the whole buffer is capped at Solana's packet
//! size before parsing begins.

use crate::error::ApiError;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};

/// Solana's maximum transaction size. Bounding the input up front is what
/// keeps every length inside the parser trivially safe.
pub const MAX_TRANSACTION_LEN: usize = 1232;

/// SPL Memo v2: `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`.
pub const MEMO_PROGRAM_ID: [u8; 32] = [
    5, 74, 83, 90, 153, 41, 33, 6, 77, 36, 232, 113, 96, 218, 56, 124, 124, 53, 181, 221, 188, 146,
    187, 129, 228, 31, 168, 64, 65, 5, 68, 141,
];

fn malformed(detail: &'static str) -> ApiError {
    ApiError::new(400, "transaction_malformed", detail)
}

/// A verified legacy transaction, reduced to the fields the enclave needs.
#[derive(Debug, Clone)]
pub struct ParsedTransaction {
    /// The first signature — the transaction id.
    pub signature: [u8; 64],
    /// Base58 of `signature`, as the oracle and explorers spell it.
    pub signature_b58: String,
    /// `account_keys[0]`: fee payer, and the claimant for our purposes.
    pub fee_payer: [u8; 32],
    pub account_keys: Vec<[u8; 32]>,
    /// Data of the single SPL Memo instruction.
    pub memo: Vec<u8>,
}

impl ParsedTransaction {
    pub fn memo_str(&self) -> Result<&str, ApiError> {
        std::str::from_utf8(&self.memo).map_err(|_| malformed("memo is not valid UTF-8"))
    }

    pub fn has_account(&self, key: &[u8; 32]) -> bool {
        self.account_keys.iter().any(|k| k == key)
    }
}

struct Cursor<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> Cursor<'a> {
    fn new(data: &'a [u8]) -> Self {
        Cursor { data, pos: 0 }
    }

    fn take(&mut self, n: usize) -> Result<&'a [u8], ApiError> {
        let end = self
            .pos
            .checked_add(n)
            .ok_or_else(|| malformed("length overflow"))?;
        let slice = self
            .data
            .get(self.pos..end)
            .ok_or_else(|| malformed("truncated transaction"))?;
        self.pos = end;
        Ok(slice)
    }

    fn u8(&mut self) -> Result<u8, ApiError> {
        Ok(self.take(1)?[0])
    }

    /// compact-u16 ("shortvec"): 7 bits per byte, little-endian groups,
    /// 0x80 continuation. Rejects non-canonical encodings so a given length
    /// has exactly one valid representation.
    fn shortvec_len(&mut self) -> Result<usize, ApiError> {
        let mut len: usize = 0;
        let mut group = 0;
        loop {
            let byte = self.u8()?;
            if group > 0 && byte == 0 {
                return Err(malformed("non-canonical shortvec length"));
            }
            len |= ((byte & 0x7f) as usize) << (group * 7);
            group += 1;
            if byte & 0x80 == 0 {
                break;
            }
            if group >= 3 {
                return Err(malformed("shortvec length too long"));
            }
        }
        // Nothing inside a transaction can exceed the packet size.
        if len > MAX_TRANSACTION_LEN {
            return Err(malformed("shortvec length exceeds transaction size"));
        }
        Ok(len)
    }
}

/// Parse a serialized legacy transaction and verify the fee payer's
/// signature over the message. Returns the fields the enclave needs.
///
/// Rejects: versioned (v0+) transactions, since their address lookup tables
/// mean `account_keys` is incomplete and a memo instruction could reference
/// a program id that is not present in the serialized message.
pub fn parse_and_verify(bytes: &[u8]) -> Result<ParsedTransaction, ApiError> {
    if bytes.is_empty() {
        return Err(malformed("empty transaction"));
    }
    if bytes.len() > MAX_TRANSACTION_LEN {
        return Err(malformed("transaction exceeds the maximum packet size"));
    }

    let mut cursor = Cursor::new(bytes);
    let num_signatures = cursor.shortvec_len()?;
    if num_signatures == 0 {
        return Err(malformed("transaction carries no signatures"));
    }
    let signature_bytes = cursor.take(
        num_signatures
            .checked_mul(64)
            .ok_or_else(|| malformed("length overflow"))?,
    )?;
    let signature: [u8; 64] = signature_bytes[..64]
        .try_into()
        .map_err(|_| malformed("signature must be 64 bytes"))?;

    let message = bytes
        .get(cursor.pos..)
        .ok_or_else(|| malformed("truncated transaction"))?;
    if message.is_empty() {
        return Err(malformed("transaction carries no message"));
    }
    // The version prefix sets the high bit; legacy messages start with the
    // header's num_required_signatures, which cannot.
    if message[0] & 0x80 != 0 {
        return Err(malformed(
            "versioned transactions are not supported; use a legacy transaction",
        ));
    }

    let mut m = Cursor::new(message);
    let num_required_signatures = m.u8()?;
    let _num_readonly_signed = m.u8()?;
    let _num_readonly_unsigned = m.u8()?;
    if num_required_signatures as usize != num_signatures {
        return Err(malformed(
            "signature count does not match the message header",
        ));
    }

    let num_keys = m.shortvec_len()?;
    if num_keys == 0 {
        return Err(malformed("transaction has no account keys"));
    }
    let key_bytes = m.take(
        num_keys
            .checked_mul(32)
            .ok_or_else(|| malformed("length overflow"))?,
    )?;
    let account_keys: Vec<[u8; 32]> = key_bytes
        .chunks_exact(32)
        .map(|chunk| {
            let mut key = [0u8; 32];
            key.copy_from_slice(chunk);
            key
        })
        .collect();

    let _recent_blockhash = m.take(32)?;

    let num_instructions = m.shortvec_len()?;
    let mut memo: Option<Vec<u8>> = None;
    for _ in 0..num_instructions {
        let program_id_index = m.u8()? as usize;
        let num_accounts = m.shortvec_len()?;
        m.take(num_accounts)?;
        let data_len = m.shortvec_len()?;
        let data = m.take(data_len)?;

        let program_id = account_keys
            .get(program_id_index)
            .ok_or_else(|| malformed("instruction program id index out of range"))?;
        if program_id == &MEMO_PROGRAM_ID {
            if memo.is_some() {
                return Err(malformed("transaction carries more than one memo"));
            }
            memo = Some(data.to_vec());
        }
    }
    if m.pos != message.len() {
        return Err(malformed("trailing bytes after the instruction list"));
    }

    let memo = memo.ok_or_else(|| {
        ApiError::new(
            400,
            "memo_missing",
            "transaction carries no memo instruction; nothing binds it to this request",
        )
    })?;

    let fee_payer = account_keys[0];
    let verifying_key = VerifyingKey::from_bytes(&fee_payer)
        .map_err(|_| malformed("fee payer is not a valid Ed25519 public key"))?;
    verifying_key
        .verify(message, &Signature::from_bytes(&signature))
        .map_err(|_| {
            ApiError::new(
                400,
                "tx_signature_invalid",
                "transaction signature does not verify against the fee payer",
            )
        })?;

    Ok(ParsedTransaction {
        signature,
        signature_b58: bs58::encode(signature).into_string(),
        fee_payer,
        account_keys,
        memo,
    })
}
