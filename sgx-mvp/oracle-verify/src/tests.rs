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

//! SGX-side unit tests with a mock oracle. Runs outside SGX: everything
//! under test is pure over env/config/files.
//!
//! The transactions here are built by hand rather than with the Solana SDK,
//! which the enclave deliberately does not depend on. That means these tests
//! also serve as an independent check that the wire format the enclave
//! accepts is the one the chain actually uses.

use crate::authz::{authorize, validate_locally, EnclaveConfig};
use crate::canonical;
use crate::claim::{Action, RedemptionRequest, POSSESSION_PREFIX};
use crate::error::ApiError;
use crate::oracle_client::{verify_jws, OracleTransport};
use crate::soltx::{self, MAX_TRANSACTION_LEN};
use crate::state::{replay_key, EntryStatus, ReplayLedger};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use ed25519_dalek::{Signer, SigningKey};
use serde_json::json;
use std::sync::Mutex;
use std::time::Duration;

static ENV_LOCK: Mutex<()> = Mutex::new(());

const CLUSTER: &str = "devnet";
const PROGRAM: &str = "CME2Dg7UEW82Hf99rQetEi7Hc5Db9JQPx6Azmx1eWbEE";
const GITHUB_URL: &str =
    "https://github.com/nautilus-project/py_compute_median/blob/main/script.py";
const POOL: &str = "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi";

fn wallet_key() -> SigningKey {
    SigningKey::from_bytes(&[7u8; 32])
}

fn ephemeral_key() -> SigningKey {
    SigningKey::from_bytes(&[21u8; 32])
}

fn oracle_key() -> SigningKey {
    SigningKey::from_bytes(&[11u8; 32])
}

fn config() -> EnclaveConfig {
    EnclaveConfig {
        cluster: CLUSTER.to_string(),
        program: PROGRAM.to_string(),
        oracle_url: "http://localhost:0".to_string(),
        oracle_pubkey: oracle_key().verifying_key().to_bytes(),
        oracle_timeout: Duration::from_secs(1),
    }
}

fn claimant() -> String {
    bs58::encode(wallet_key().verifying_key().to_bytes()).into_string()
}

fn program_key() -> [u8; 32] {
    bs58::decode(PROGRAM)
        .into_vec()
        .unwrap()
        .try_into()
        .unwrap()
}

fn code_for(action: Action) -> Option<(&'static str, &'static str)> {
    if action.is_compute() {
        Some((GITHUB_URL, CODE_HASH))
    } else {
        None
    }
}

const CODE_HASH: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

// ---------------------------------------------------------------------------
// Legacy transaction construction
// ---------------------------------------------------------------------------

fn push_shortvec(mut n: usize, out: &mut Vec<u8>) {
    loop {
        let mut byte = (n & 0x7f) as u8;
        n >>= 7;
        if n != 0 {
            byte |= 0x80;
        }
        out.push(byte);
        if n == 0 {
            break;
        }
    }
}

struct TxSpec {
    /// Key placed at account_keys[0].
    fee_payer: SigningKey,
    /// Key that actually signs; differs from `fee_payer` to forge.
    signer: SigningKey,
    memos: Vec<String>,
    include_program: bool,
    versioned: bool,
    filler_bytes: usize,
}

impl Default for TxSpec {
    fn default() -> Self {
        TxSpec {
            fee_payer: wallet_key(),
            signer: wallet_key(),
            memos: Vec::new(),
            include_program: true,
            versioned: false,
            filler_bytes: 0,
        }
    }
}

/// Serialize and sign a legacy transaction. Returns (bytes, signature).
fn build_tx(spec: &TxSpec) -> (Vec<u8>, [u8; 64]) {
    let mut keys: Vec<[u8; 32]> = vec![spec.fee_payer.verifying_key().to_bytes()];
    let program_index = if spec.include_program {
        keys.push(program_key());
        Some((keys.len() - 1) as u8)
    } else {
        None
    };
    keys.push(soltx::MEMO_PROGRAM_ID);
    let memo_index = (keys.len() - 1) as u8;

    let mut message = Vec::new();
    if spec.versioned {
        message.push(0x80);
    }
    message.push(1); // num_required_signatures
    message.push(0); // num_readonly_signed
    message.push((keys.len() - 1) as u8); // num_readonly_unsigned
    push_shortvec(keys.len(), &mut message);
    for key in &keys {
        message.extend_from_slice(key);
    }
    message.extend_from_slice(&[9u8; 32]); // recent blockhash

    let mut instructions: Vec<(u8, Vec<u8>)> = Vec::new();
    if let Some(index) = program_index {
        let mut data = b"redeem_drt".to_vec();
        data.resize(data.len() + spec.filler_bytes, 0u8);
        instructions.push((index, data));
    }
    for memo in &spec.memos {
        instructions.push((memo_index, memo.as_bytes().to_vec()));
    }
    push_shortvec(instructions.len(), &mut message);
    for (index, data) in instructions {
        message.push(index);
        push_shortvec(0, &mut message); // no accounts
        push_shortvec(data.len(), &mut message);
        message.extend_from_slice(&data);
    }

    let signature = spec.signer.sign(&message).to_bytes();
    let mut tx = Vec::new();
    push_shortvec(1, &mut tx);
    tx.extend_from_slice(&signature);
    tx.extend_from_slice(&message);
    (tx, signature)
}

struct Built {
    signed_transaction: String,
    ephemeral_pubkey: String,
    ephemeral_signature: String,
    tx_signature: String,
}

/// A well-formed request for `action` committing to `payload` and the
/// action's code identity. Tests drive mismatches by passing *different*
/// values to `verify_request` than the ones committed here.
fn build_request(action: Action, payload: &str) -> Built {
    build_committed(payload, code_for(action))
}

fn build_committed(committed_payload: &str, committed_code: Option<(&str, &str)>) -> Built {
    let eph = ephemeral_key();
    let eph_pubkey = eph.verifying_key().to_bytes();
    let memo = canonical::memo_for(&eph_pubkey, committed_payload.as_bytes(), committed_code);
    let (tx, signature) = build_tx(&TxSpec {
        memos: vec![memo],
        ..Default::default()
    });
    let mut possession_message = POSSESSION_PREFIX.to_vec();
    possession_message.extend_from_slice(&signature);
    Built {
        signed_transaction: BASE64.encode(&tx),
        ephemeral_pubkey: bs58::encode(eph_pubkey).into_string(),
        ephemeral_signature: bs58::encode(eph.sign(&possession_message).to_bytes()).into_string(),
        tx_signature: bs58::encode(signature).into_string(),
    }
}

fn verify_request(
    action: Action,
    built: &Built,
    payload: &str,
    code: Option<(&str, &str)>,
) -> Result<RedemptionRequest, ApiError> {
    validate_locally(
        action,
        &built.signed_transaction,
        payload,
        code.map(|c| c.0),
        code.map(|c| c.1),
        &built.ephemeral_pubkey,
        &built.ephemeral_signature,
        &config(),
    )
}

/// The common case: build and verify a consistent request.
fn valid_request(action: Action, payload: &str) -> RedemptionRequest {
    let built = build_request(action, payload);
    verify_request(action, &built, payload, code_for(action)).expect("request should verify")
}

// ---------------------------------------------------------------------------
// Commitment vector, pinned identically in ntc-web/tests/redemption.test.ts
// ---------------------------------------------------------------------------

#[test]
fn commitment_vector() {
    let eph = [3u8; 32];
    assert_eq!(
        canonical::memo_for(&eph, b"", Some((GITHUB_URL, CODE_HASH))),
        "rcc1:a62f64638528d12d6b6e20f785527768ea6d8d5dbe4c3b0fd8e0b9196ced408c"
    );
    assert_eq!(
        canonical::memo_for(&eph, br#"{"a":1}"#, None),
        "rcc1:14952fb6c44231bde18f203a7cde30edbc3ae553bca48dea64dc651905f35c0c"
    );
}

// ---------------------------------------------------------------------------
// Transaction parsing and the memo commitment
// ---------------------------------------------------------------------------

#[test]
fn valid_request_passes() {
    let request = valid_request(Action::ExecutePython, "");
    assert_eq!(request.claimant(), claimant());
    assert_eq!(request.github_url.as_deref(), Some(GITHUB_URL));
}

#[test]
fn append_request_binds_its_payload() {
    let payload = r#"{"records":[{"x":1}]}"#;
    let request = valid_request(Action::Append, payload);
    assert_eq!(request.action, Action::Append);
}

#[test]
fn tampered_message_rejected() {
    let built = build_request(Action::Append, "{}");
    let mut raw = BASE64.decode(&built.signed_transaction).unwrap();
    // Flip a bit in the recent blockhash, well inside the signed message.
    let index = 1 + 64 + 3 + 1 + 32 * 3 + 4;
    raw[index] ^= 0x01;
    let built = Built {
        signed_transaction: BASE64.encode(&raw),
        ..built
    };
    let err = verify_request(Action::Append, &built, "{}", None).unwrap_err();
    assert_eq!(err.code, "tx_signature_invalid");
}

#[test]
fn transaction_signed_by_another_key_rejected() {
    let eph = ephemeral_key();
    let memo = canonical::memo_for(&eph.verifying_key().to_bytes(), b"", None);
    let (tx, signature) = build_tx(&TxSpec {
        signer: SigningKey::from_bytes(&[99u8; 32]),
        memos: vec![memo],
        ..Default::default()
    });
    let mut possession = POSSESSION_PREFIX.to_vec();
    possession.extend_from_slice(&signature);
    let built = Built {
        signed_transaction: BASE64.encode(&tx),
        ephemeral_pubkey: bs58::encode(eph.verifying_key().to_bytes()).into_string(),
        ephemeral_signature: bs58::encode(eph.sign(&possession).to_bytes()).into_string(),
        tx_signature: bs58::encode(signature).into_string(),
    };
    let err = verify_request(Action::Append, &built, "", None).unwrap_err();
    assert_eq!(err.code, "tx_signature_invalid");
}

#[test]
fn transaction_without_memo_rejected() {
    let (tx, _) = build_tx(&TxSpec::default());
    let built = Built {
        signed_transaction: BASE64.encode(&tx),
        ephemeral_pubkey: bs58::encode(ephemeral_key().verifying_key().to_bytes()).into_string(),
        ephemeral_signature: bs58::encode([0u8; 64]).into_string(),
        tx_signature: String::new(),
    };
    let err = verify_request(Action::Append, &built, "", None).unwrap_err();
    assert_eq!(err.code, "memo_missing");
}

#[test]
fn transaction_with_two_memos_rejected() {
    let eph = ephemeral_key().verifying_key().to_bytes();
    let memo = canonical::memo_for(&eph, b"", None);
    let (tx, _) = build_tx(&TxSpec {
        memos: vec![memo.clone(), memo],
        ..Default::default()
    });
    let built = Built {
        signed_transaction: BASE64.encode(&tx),
        ephemeral_pubkey: bs58::encode(eph).into_string(),
        ephemeral_signature: bs58::encode([0u8; 64]).into_string(),
        tx_signature: String::new(),
    };
    let err = verify_request(Action::Append, &built, "", None).unwrap_err();
    assert_eq!(err.code, "transaction_malformed");
    assert!(err.detail.contains("more than one memo"));
}

#[test]
fn payload_not_covered_by_the_commitment_rejected() {
    // The memo commits to sha256(""), but a payload is supplied.
    let built = build_request(Action::Append, "");
    let err = verify_request(Action::Append, &built, r#"{"x":1}"#, None).unwrap_err();
    assert_eq!(err.code, "commitment_mismatch");
}

#[test]
fn substituted_code_reference_rejected() {
    // The heart of the design: the redeemer committed to one program
    // on-chain, so no other program can be smuggled into the request.
    let built = build_request(Action::ExecutePython, "");
    let evil = ("https://github.com/evil/repo/blob/main/x.py", CODE_HASH);
    let err = verify_request(Action::ExecutePython, &built, "", Some(evil)).unwrap_err();
    assert_eq!(err.code, "commitment_mismatch");
}

#[test]
fn substituted_code_hash_rejected() {
    let built = build_request(Action::ExecutePython, "");
    let evil = (
        GITHUB_URL,
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );
    let err = verify_request(Action::ExecutePython, &built, "", Some(evil)).unwrap_err();
    assert_eq!(err.code, "commitment_mismatch");
}

#[test]
fn foreign_ephemeral_key_cannot_claim_the_redemption() {
    // A bystander who saw the finalized transaction supplies their own key.
    let built = build_request(Action::ExecutePython, "");
    let intruder = SigningKey::from_bytes(&[77u8; 32]);
    let hijacked = Built {
        ephemeral_pubkey: bs58::encode(intruder.verifying_key().to_bytes()).into_string(),
        ..built
    };
    let err = verify_request(
        Action::ExecutePython,
        &hijacked,
        "",
        code_for(Action::ExecutePython),
    )
    .unwrap_err();
    assert_eq!(err.code, "commitment_mismatch");
}

#[test]
fn bad_possession_proof_rejected() {
    let built = build_request(Action::ExecutePython, "");
    let intruder = SigningKey::from_bytes(&[77u8; 32]);
    let mut possession = POSSESSION_PREFIX.to_vec();
    possession.extend_from_slice(&bs58::decode(&built.tx_signature).into_vec().unwrap());
    let forged = Built {
        ephemeral_signature: bs58::encode(intruder.sign(&possession).to_bytes()).into_string(),
        ..built
    };
    let err = verify_request(
        Action::ExecutePython,
        &forged,
        "",
        code_for(Action::ExecutePython),
    )
    .unwrap_err();
    assert_eq!(err.code, "possession_proof_invalid");
}

#[test]
fn possession_proof_for_another_transaction_rejected() {
    let built = build_request(Action::ExecutePython, "");
    let mut possession = POSSESSION_PREFIX.to_vec();
    possession.extend_from_slice(&[4u8; 64]); // some other transaction
    let replayed = Built {
        ephemeral_signature: bs58::encode(ephemeral_key().sign(&possession).to_bytes())
            .into_string(),
        ..built
    };
    let err = verify_request(
        Action::ExecutePython,
        &replayed,
        "",
        code_for(Action::ExecutePython),
    )
    .unwrap_err();
    assert_eq!(err.code, "possession_proof_invalid");
}

#[test]
fn versioned_transaction_rejected() {
    let eph = ephemeral_key().verifying_key().to_bytes();
    let (tx, _) = build_tx(&TxSpec {
        memos: vec![canonical::memo_for(&eph, b"", None)],
        versioned: true,
        ..Default::default()
    });
    let err = soltx::parse_and_verify(&tx).unwrap_err();
    assert_eq!(err.code, "transaction_malformed");
    assert!(err.detail.contains("versioned"));
}

#[test]
fn transaction_not_touching_the_drt_program_rejected() {
    let eph = ephemeral_key();
    let eph_pubkey = eph.verifying_key().to_bytes();
    let (tx, signature) = build_tx(&TxSpec {
        memos: vec![canonical::memo_for(&eph_pubkey, b"", None)],
        include_program: false,
        ..Default::default()
    });
    let mut possession = POSSESSION_PREFIX.to_vec();
    possession.extend_from_slice(&signature);
    let built = Built {
        signed_transaction: BASE64.encode(&tx),
        ephemeral_pubkey: bs58::encode(eph_pubkey).into_string(),
        ephemeral_signature: bs58::encode(eph.sign(&possession).to_bytes()).into_string(),
        tx_signature: bs58::encode(signature).into_string(),
    };
    let err = verify_request(Action::Append, &built, "", None).unwrap_err();
    assert_eq!(err.code, "invalid_claim");
    assert!(err.detail.contains("DRT program"));
}

#[test]
fn malformed_code_metadata_rejected() {
    let built = build_request(Action::ExecutePython, "");
    let err = verify_request(
        Action::ExecutePython,
        &built,
        "",
        Some(("https://example.com/x.py", CODE_HASH)),
    )
    .unwrap_err();
    assert_eq!(err.code, "code_metadata_invalid");

    let err = verify_request(
        Action::ExecutePython,
        &built,
        "",
        Some((GITHUB_URL, "not-a-hash")),
    )
    .unwrap_err();
    assert_eq!(err.code, "code_metadata_invalid");
}

#[test]
fn compute_without_code_metadata_rejected() {
    let built = build_request(Action::ExecutePython, "");
    let err = verify_request(Action::ExecutePython, &built, "", None).unwrap_err();
    assert_eq!(err.code, "code_metadata_invalid");
}

#[test]
fn code_metadata_on_append_rejected() {
    let built = build_request(Action::Append, "{}");
    let err =
        verify_request(Action::Append, &built, "{}", Some((GITHUB_URL, CODE_HASH))).unwrap_err();
    assert_eq!(err.code, "invalid_claim");
}

#[test]
fn oversized_transaction_rejected() {
    let err = soltx::parse_and_verify(&vec![0u8; MAX_TRANSACTION_LEN + 1]).unwrap_err();
    assert_eq!(err.code, "transaction_malformed");
    assert!(err.detail.contains("maximum packet size"));
}

#[test]
fn truncated_transaction_rejected() {
    let eph = ephemeral_key().verifying_key().to_bytes();
    let (tx, _) = build_tx(&TxSpec {
        memos: vec![canonical::memo_for(&eph, b"", None)],
        ..Default::default()
    });
    for cut in [1usize, 10, 60, 70, 100, 150] {
        if cut >= tx.len() {
            continue;
        }
        let err = soltx::parse_and_verify(&tx[..cut]).unwrap_err();
        assert_eq!(err.code, "transaction_malformed", "cut at {cut}");
    }
}

#[test]
fn trailing_bytes_rejected() {
    let eph = ephemeral_key().verifying_key().to_bytes();
    let (mut tx, _) = build_tx(&TxSpec {
        memos: vec![canonical::memo_for(&eph, b"", None)],
        ..Default::default()
    });
    tx.push(0);
    let err = soltx::parse_and_verify(&tx).unwrap_err();
    assert_eq!(err.code, "transaction_malformed");
    assert!(err.detail.contains("trailing"));
}

#[test]
fn non_canonical_shortvec_rejected() {
    // 0x80 0x00 encodes zero in two groups; only the one-byte form is valid.
    let err = soltx::parse_and_verify(&[0x80, 0x00]).unwrap_err();
    assert_eq!(err.code, "transaction_malformed");
    assert!(err.detail.contains("non-canonical"));
}

/// The parser is the only attacker-reachable deserializer in the TCB, so it
/// must terminate with an error rather than panic on anything at all. A
/// deterministic LCG keeps this reproducible in CI; `cargo fuzz` covers the
/// same entry point more thoroughly.
#[test]
fn parser_never_panics_on_arbitrary_input() {
    let mut state: u64 = 0x2545F4914F6CDD1D;
    let mut next = move || {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        state
    };

    for _ in 0..2000 {
        let len = (next() % (MAX_TRANSACTION_LEN as u64 + 8)) as usize;
        let bytes: Vec<u8> = (0..len).map(|_| (next() & 0xff) as u8).collect();
        let _ = soltx::parse_and_verify(&bytes);
    }

    // Mutations of a well-formed transaction reach much deeper into the
    // parser than random bytes ever will.
    let eph = ephemeral_key().verifying_key().to_bytes();
    let (valid, _) = build_tx(&TxSpec {
        memos: vec![canonical::memo_for(&eph, b"", None)],
        ..Default::default()
    });
    for _ in 0..4000 {
        let mut mutated = valid.clone();
        let flips = 1 + (next() % 4);
        for _ in 0..flips {
            let index = (next() as usize) % mutated.len();
            mutated[index] = (next() & 0xff) as u8;
        }
        if next() % 4 == 0 {
            mutated.truncate((next() as usize) % mutated.len().max(1));
        }
        let _ = soltx::parse_and_verify(&mutated);
    }
}

// ---------------------------------------------------------------------------
// JWS verification and assertion cross-checks
// ---------------------------------------------------------------------------

fn sign_jws_with(key: &SigningKey, payload: &serde_json::Value) -> String {
    let header = URL_SAFE_NO_PAD.encode(br#"{"alg":"EdDSA","typ":"JWT","kid":"oracle-1"}"#);
    let body = URL_SAFE_NO_PAD.encode(serde_json::to_vec(payload).unwrap());
    let signing_input = format!("{header}.{body}");
    let signature = key.sign(signing_input.as_bytes());
    format!(
        "{signing_input}.{}",
        URL_SAFE_NO_PAD.encode(signature.to_bytes())
    )
}

fn assertion_payload(request: &RedemptionRequest) -> serde_json::Value {
    let now = crate::claim::now_unix();
    let compute = request.action.is_compute();
    json!({
        "iss": "relational-oracle-1",
        "iat": now,
        "exp": now + 300,
        "cluster": CLUSTER,
        "program": PROGRAM,
        "tx": request.tx_signature(),
        "slot": 1234,
        "pool": POOL,
        "claimant": request.claimant(),
        "drt_type": if compute { json!("py_compute_median") } else { json!(null) },
        "execution_type": request.action.expected_execution_type(),
        "github_url": if compute { json!(request.github_url) } else { json!(null) },
        "code_hash": if compute { json!(request.code_hash) } else { json!(null) },
    })
}

struct MockOracle {
    response: Result<String, ApiError>,
}

impl OracleTransport for MockOracle {
    fn verify_transaction(&self, _tx_signature: &str) -> Result<String, ApiError> {
        self.response.clone()
    }
}

fn authorize_with(request: &RedemptionRequest, jws: String) -> Result<(), ApiError> {
    let transport = MockOracle { response: Ok(jws) };
    authorize(request, &transport, &config()).map(|_| ())
}

#[test]
fn valid_oracle_assertion_accepted() {
    let request = valid_request(Action::ExecutePython, "");
    let jws = sign_jws_with(&oracle_key(), &assertion_payload(&request));
    assert!(authorize_with(&request, jws).is_ok());
}

#[test]
fn jws_signed_with_wrong_key_rejected() {
    let request = valid_request(Action::ExecutePython, "");
    let wrong_key = SigningKey::from_bytes(&[13u8; 32]);
    let jws = sign_jws_with(&wrong_key, &assertion_payload(&request));
    let err = authorize_with(&request, jws).unwrap_err();
    assert_eq!(err.code, "assertion_invalid");
}

#[test]
fn tampered_jws_payload_rejected() {
    let request = valid_request(Action::ExecutePython, "");
    let jws = sign_jws_with(&oracle_key(), &assertion_payload(&request));
    let mut parts: Vec<String> = jws.split('.').map(String::from).collect();
    let mut payload = assertion_payload(&request);
    payload["code_hash"] = json!("b".repeat(64));
    parts[1] = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&payload).unwrap());
    let err = authorize_with(&request, parts.join(".")).unwrap_err();
    assert_eq!(err.code, "assertion_invalid");
}

#[test]
fn assertion_for_another_transaction_rejected() {
    let request = valid_request(Action::ExecutePython, "");
    let mut payload = assertion_payload(&request);
    payload["tx"] = json!(bs58::encode(vec![8u8; 64]).into_string());
    let jws = sign_jws_with(&oracle_key(), &payload);
    let err = authorize_with(&request, jws).unwrap_err();
    assert_eq!(err.code, "assertion_invalid");
    assert!(err.detail.contains("tx"));
}

#[test]
fn assertion_naming_another_redeemer_rejected() {
    let request = valid_request(Action::ExecutePython, "");
    let mut payload = assertion_payload(&request);
    payload["claimant"] = json!(bs58::encode(vec![6u8; 32]).into_string());
    let jws = sign_jws_with(&oracle_key(), &payload);
    let err = authorize_with(&request, jws).unwrap_err();
    assert_eq!(err.code, "assertion_invalid");
    assert!(err.detail.contains("claimant"));
}

#[test]
fn assertion_code_metadata_differing_from_commitment_rejected() {
    // A malicious oracle cannot substitute code: the assertion must agree
    // with what the redeemer committed to on-chain.
    let request = valid_request(Action::ExecutePython, "");
    let mut payload = assertion_payload(&request);
    payload["github_url"] = json!("https://github.com/evil/repo/blob/main/x.py");
    let jws = sign_jws_with(&oracle_key(), &payload);
    let err = authorize_with(&request, jws).unwrap_err();
    assert_eq!(err.code, "assertion_invalid");
}

#[test]
fn assertion_runtime_mismatch_rejected() {
    let request = valid_request(Action::ExecutePython, "");
    let mut payload = assertion_payload(&request);
    payload["execution_type"] = json!("wasm");
    let jws = sign_jws_with(&oracle_key(), &payload);
    let err = authorize_with(&request, jws).unwrap_err();
    assert_eq!(err.code, "assertion_invalid");
}

#[test]
fn assertion_wrong_cluster_rejected() {
    let request = valid_request(Action::ExecutePython, "");
    let mut payload = assertion_payload(&request);
    payload["cluster"] = json!("mainnet-beta");
    let jws = sign_jws_with(&oracle_key(), &payload);
    let err = authorize_with(&request, jws).unwrap_err();
    assert_eq!(err.code, "assertion_invalid");
}

#[test]
fn expired_assertion_rejected() {
    let request = valid_request(Action::ExecutePython, "");
    let mut payload = assertion_payload(&request);
    payload["exp"] = json!(crate::claim::now_unix() - 5);
    let jws = sign_jws_with(&oracle_key(), &payload);
    let err = authorize_with(&request, jws).unwrap_err();
    assert_eq!(err.code, "assertion_invalid");
    assert!(err.detail.contains("expired"));
}

#[test]
fn oracle_outage_is_not_a_consumption() {
    let request = valid_request(Action::ExecutePython, "");
    let transport = MockOracle {
        response: Err(ApiError::oracle_unavailable("timed out")),
    };
    let err = authorize(&request, &transport, &config()).unwrap_err();
    assert_eq!(err.code, "oracle_unavailable");
}

#[test]
fn malformed_jws_rejected() {
    let request = valid_request(Action::ExecutePython, "");
    let err = authorize_with(&request, "not-a-jws".to_string()).unwrap_err();
    assert_eq!(err.code, "assertion_invalid");
}

#[test]
fn verify_jws_rejects_wrong_alg() {
    let header = URL_SAFE_NO_PAD.encode(br#"{"alg":"HS256","typ":"JWT"}"#);
    let body = URL_SAFE_NO_PAD.encode(b"{}");
    let token = format!("{header}.{body}.{}", URL_SAFE_NO_PAD.encode([0u8; 64]));
    let err = verify_jws(&token, &oracle_key().verifying_key().to_bytes()).unwrap_err();
    assert_eq!(err.code, "assertion_invalid");
}

// ---------------------------------------------------------------------------
// Replay ledger
// ---------------------------------------------------------------------------

fn with_temp_data_dir<T>(test: impl FnOnce() -> T) -> T {
    let _guard = ENV_LOCK.lock().unwrap();
    let dir = tempfile::tempdir().unwrap();
    std::env::set_var("DATA_DIR", dir.path());
    let result = test();
    std::env::remove_var("DATA_DIR");
    result
}

#[test]
fn replay_rejected_after_success_and_survives_reload() {
    with_temp_data_dir(|| {
        let key = replay_key(CLUSTER, PROGRAM, "tx1");
        let mut ledger = ReplayLedger::load().unwrap();
        ledger.reserve(&key, "digest1").unwrap();
        ledger
            .record_success(&key, Some(json!({"mean": 3})))
            .unwrap();

        // Persistent across reloads (fresh load = enclave restart).
        let reloaded = ReplayLedger::load().unwrap();
        let entry = reloaded.get(&key).unwrap();
        assert_eq!(entry.status, EntryStatus::Succeeded);
        assert_eq!(entry.result, Some(json!({"mean": 3})));
        assert_eq!(entry.commitment, "digest1");

        let mut again = ReplayLedger::load().unwrap();
        let err = again.reserve(&key, "digest1").unwrap_err();
        assert_eq!(err.code, "replay_rejected");
    });
}

#[test]
fn concurrent_duplicate_reservation_rejected() {
    with_temp_data_dir(|| {
        let key = replay_key(CLUSTER, PROGRAM, "tx2");
        let mut ledger = ReplayLedger::load().unwrap();
        ledger.reserve(&key, "digest").unwrap();
        // A second in-flight request sees the reservation and must fail.
        let mut concurrent = ReplayLedger::load().unwrap();
        let err = concurrent.reserve(&key, "digest").unwrap_err();
        assert_eq!(err.code, "replay_rejected");
    });
}

#[test]
fn failed_execution_stays_consumed() {
    with_temp_data_dir(|| {
        let key = replay_key(CLUSTER, PROGRAM, "tx3");
        let mut ledger = ReplayLedger::load().unwrap();
        ledger.reserve(&key, "digest").unwrap();
        ledger.record_failure(&key).unwrap();

        let reloaded = ReplayLedger::load().unwrap();
        assert_eq!(reloaded.get(&key).unwrap().status, EntryStatus::Failed);
        let mut again = ReplayLedger::load().unwrap();
        assert!(again.reserve(&key, "digest").is_err());
    });
}

#[test]
fn pool_identity_round_trips() {
    with_temp_data_dir(|| {
        use crate::state::{load_identity, store_identity, PoolIdentity};
        assert!(load_identity().unwrap().is_none());
        let identity = PoolIdentity {
            pool: POOL.into(),
            owner: claimant(),
            cluster: CLUSTER.into(),
            program: PROGRAM.into(),
            init_tx: "tx".into(),
            schema: json!({"type": "object"}),
        };
        store_identity(&identity).unwrap();
        let loaded = load_identity().unwrap().unwrap();
        assert_eq!(loaded.pool, POOL);
        assert_eq!(loaded.schema, json!({"type": "object"}));
    });
}
