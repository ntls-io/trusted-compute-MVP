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

//! SGX-side unit tests with a mock oracle (plan.md test plan, SGX row).
//! Runs outside SGX: everything under test is pure over env/config/files.

use crate::authz::{authorize, validate_locally, EnclaveConfig};
use crate::canonical;
use crate::claim::{Action, ClaimContext};
use crate::error::ApiError;
use crate::oracle_client::{verify_jws, OracleTransport};
use crate::state::{replay_key, EntryStatus, ReplayLedger};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use ed25519_dalek::{Signer, SigningKey};
use serde_json::json;
use std::collections::BTreeMap;
use std::sync::Mutex;
use std::time::Duration;

static ENV_LOCK: Mutex<()> = Mutex::new(());

const CLUSTER: &str = "devnet";
const PROGRAM: &str = "CME2Dg7UEW82Hf99rQetEi7Hc5Db9JQPx6Azmx1eWbEE";
const GITHUB_URL: &str =
    "https://github.com/nautilus-project/py_compute_median/blob/main/script.py";
const SHA256_EMPTY: &str = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

fn wallet_key() -> SigningKey {
    SigningKey::from_bytes(&[7u8; 32])
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

fn future_expiry() -> String {
    (crate::claim::now_unix() + 300).to_string()
}

fn base_claim(action: &str) -> BTreeMap<String, String> {
    let mut map = BTreeMap::new();
    map.insert("version".into(), "1".into());
    map.insert("action".into(), action.into());
    map.insert("cluster".into(), CLUSTER.into());
    map.insert("program".into(), PROGRAM.into());
    map.insert("tx".into(), bs58::encode(vec![2u8; 64]).into_string());
    map.insert("pool".into(), bs58::encode(vec![1u8; 32]).into_string());
    map.insert("claimant".into(), claimant());
    map.insert("payload_sha256".into(), SHA256_EMPTY.into());
    map.insert("nonce".into(), "00112233445566778899aabbccddeeff".into());
    map.insert("expiry".into(), future_expiry());
    if action.starts_with("execute_") {
        map.insert("github_url".into(), GITHUB_URL.into());
        map.insert("code_hash".into(), "a".repeat(64));
    }
    map
}

fn sign_claim(map: &BTreeMap<String, String>) -> String {
    let signature = wallet_key().sign(&canonical::message_bytes(map));
    bs58::encode(signature.to_bytes()).into_string()
}

fn validated(action: Action, map: BTreeMap<String, String>) -> ClaimContext {
    ClaimContext::validate(map, action, CLUSTER, PROGRAM).expect("claim should validate")
}

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

fn assertion_payload(claim: &ClaimContext) -> serde_json::Value {
    let now = crate::claim::now_unix();
    let compute = claim.action().is_compute();
    json!({
        "iss": "relational-oracle-1",
        "iat": now,
        "exp": now + 300,
        "cluster": claim.get("cluster"),
        "program": claim.get("program"),
        "tx": claim.get("tx"),
        "slot": 1234,
        "action": claim.action().as_str(),
        "pool": claim.get("pool"),
        "claimant": claim.get("claimant"),
        "drt_type": if compute { json!("py_compute_median") } else { json!(null) },
        "execution_type": claim.action().expected_execution_type(),
        "github_url": if compute { json!(claim.get("github_url")) } else { json!(null) },
        "code_hash": if compute { json!(claim.get("code_hash")) } else { json!(null) },
        "payload_sha256": claim.get("payload_sha256"),
        "claim_digest": claim.digest_hex(),
    })
}

struct MockOracle {
    response: Result<String, ApiError>,
}

impl OracleTransport for MockOracle {
    fn verify_chain_claim(
        &self,
        _claim: &BTreeMap<String, String>,
        _wallet_signature: &str,
    ) -> Result<String, ApiError> {
        self.response.clone()
    }
}

fn authorize_with(claim: &ClaimContext, jws: String) -> Result<(), ApiError> {
    let transport = MockOracle { response: Ok(jws) };
    authorize(claim, &sign_claim(claim.map()), &transport, &config()).map(|_| ())
}

// ---------------------------------------------------------------------------
// Claim validation and wallet signatures
// ---------------------------------------------------------------------------

#[test]
fn valid_claim_and_wallet_signature_pass() {
    let map = base_claim("execute_python");
    let signature = sign_claim(&map);
    let claim = validate_locally(Action::ExecutePython, map, &signature, "", &config());
    assert!(claim.is_ok());
}

#[test]
fn forged_wallet_signature_rejected() {
    let map = base_claim("execute_python");
    let forger = SigningKey::from_bytes(&[9u8; 32]);
    let forged =
        bs58::encode(forger.sign(&canonical::message_bytes(&map)).to_bytes()).into_string();
    let err = validate_locally(Action::ExecutePython, map, &forged, "", &config()).unwrap_err();
    assert_eq!(err.code, "wallet_signature_invalid");
}

#[test]
fn signature_over_modified_claim_rejected() {
    let mut map = base_claim("execute_python");
    let signature = sign_claim(&map);
    map.insert("code_hash".into(), "b".repeat(64));
    let err = validate_locally(Action::ExecutePython, map, &signature, "", &config()).unwrap_err();
    assert_eq!(err.code, "wallet_signature_invalid");
}

#[test]
fn payload_mismatch_rejected() {
    let map = base_claim("append");
    let signature = sign_claim(&map);
    // Claim commits to sha256("") but a payload is supplied.
    let err =
        validate_locally(Action::Append, map, &signature, "{\"x\":1}", &config()).unwrap_err();
    assert_eq!(err.code, "payload_mismatch");
}

#[test]
fn expired_claim_rejected() {
    let mut map = base_claim("execute_python");
    map.insert("expiry".into(), (crate::claim::now_unix() - 10).to_string());
    let signature = sign_claim(&map);
    let err = validate_locally(Action::ExecutePython, map, &signature, "", &config()).unwrap_err();
    assert_eq!(err.code, "claim_expired");
}

#[test]
fn wrong_cluster_or_program_rejected() {
    let mut map = base_claim("execute_python");
    map.insert("cluster".into(), "mainnet-beta".into());
    let signature = sign_claim(&map);
    let err = validate_locally(Action::ExecutePython, map, &signature, "", &config()).unwrap_err();
    assert_eq!(err.code, "invalid_claim");
}

#[test]
fn action_endpoint_mismatch_rejected() {
    let map = base_claim("execute_python");
    let signature = sign_claim(&map);
    let err = validate_locally(Action::ExecuteWasm, map, &signature, "", &config()).unwrap_err();
    assert_eq!(err.code, "invalid_claim");
}

#[test]
fn compute_claim_missing_code_metadata_rejected() {
    let mut map = base_claim("execute_python");
    map.remove("code_hash");
    let signature = sign_claim(&map);
    let err = validate_locally(Action::ExecutePython, map, &signature, "", &config()).unwrap_err();
    assert_eq!(err.code, "invalid_claim");
}

#[test]
fn non_github_url_rejected() {
    let mut map = base_claim("execute_python");
    map.insert("github_url".into(), "https://example.com/x.py".into());
    let signature = sign_claim(&map);
    let err = validate_locally(Action::ExecutePython, map, &signature, "", &config()).unwrap_err();
    assert_eq!(err.code, "code_metadata_invalid");
}

// ---------------------------------------------------------------------------
// JWS verification and claim/assertion cross-checks
// ---------------------------------------------------------------------------

#[test]
fn valid_oracle_assertion_accepted() {
    let claim = validated(Action::ExecutePython, base_claim("execute_python"));
    let jws = sign_jws_with(&oracle_key(), &assertion_payload(&claim));
    assert!(authorize_with(&claim, jws).is_ok());
}

#[test]
fn jws_signed_with_wrong_key_rejected() {
    let claim = validated(Action::ExecutePython, base_claim("execute_python"));
    let wrong_key = SigningKey::from_bytes(&[13u8; 32]);
    let jws = sign_jws_with(&wrong_key, &assertion_payload(&claim));
    let err = authorize_with(&claim, jws).unwrap_err();
    assert_eq!(err.code, "assertion_invalid");
}

#[test]
fn tampered_jws_payload_rejected() {
    let claim = validated(Action::ExecutePython, base_claim("execute_python"));
    let jws = sign_jws_with(&oracle_key(), &assertion_payload(&claim));
    let mut parts: Vec<String> = jws.split('.').map(String::from).collect();
    let mut payload = assertion_payload(&claim);
    payload["code_hash"] = json!("b".repeat(64));
    parts[1] = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&payload).unwrap());
    let err = authorize_with(&claim, parts.join(".")).unwrap_err();
    assert_eq!(err.code, "assertion_invalid");
}

#[test]
fn wrong_claim_digest_rejected() {
    let claim = validated(Action::ExecutePython, base_claim("execute_python"));
    let mut payload = assertion_payload(&claim);
    payload["claim_digest"] = json!("0".repeat(64));
    let jws = sign_jws_with(&oracle_key(), &payload);
    let err = authorize_with(&claim, jws).unwrap_err();
    assert_eq!(err.code, "assertion_invalid");
    assert!(err.detail.contains("digest"));
}

#[test]
fn assertion_code_metadata_differing_from_claim_rejected() {
    // A malicious oracle cannot substitute code: the assertion must match
    // the wallet-signed claim's github_url/code_hash.
    let claim = validated(Action::ExecutePython, base_claim("execute_python"));
    let mut payload = assertion_payload(&claim);
    payload["github_url"] = json!("https://github.com/evil/repo/blob/main/x.py");
    let jws = sign_jws_with(&oracle_key(), &payload);
    let err = authorize_with(&claim, jws).unwrap_err();
    assert_eq!(err.code, "assertion_invalid");
}

#[test]
fn assertion_pool_mismatch_rejected() {
    let claim = validated(Action::ExecutePython, base_claim("execute_python"));
    let mut payload = assertion_payload(&claim);
    payload["pool"] = json!(bs58::encode(vec![5u8; 32]).into_string());
    let jws = sign_jws_with(&oracle_key(), &payload);
    let err = authorize_with(&claim, jws).unwrap_err();
    assert_eq!(err.code, "assertion_invalid");
}

#[test]
fn assertion_runtime_mismatch_rejected() {
    let claim = validated(Action::ExecutePython, base_claim("execute_python"));
    let mut payload = assertion_payload(&claim);
    payload["execution_type"] = json!("wasm");
    let jws = sign_jws_with(&oracle_key(), &payload);
    let err = authorize_with(&claim, jws).unwrap_err();
    assert_eq!(err.code, "assertion_invalid");
}

#[test]
fn expired_assertion_rejected() {
    let claim = validated(Action::ExecutePython, base_claim("execute_python"));
    let mut payload = assertion_payload(&claim);
    payload["exp"] = json!(crate::claim::now_unix() - 5);
    let jws = sign_jws_with(&oracle_key(), &payload);
    let err = authorize_with(&claim, jws).unwrap_err();
    assert_eq!(err.code, "assertion_invalid");
    assert!(err.detail.contains("expired"));
}

#[test]
fn oracle_outage_is_not_a_consumption() {
    let claim = validated(Action::ExecutePython, base_claim("execute_python"));
    let transport = MockOracle {
        response: Err(ApiError::oracle_unavailable("timed out")),
    };
    let err = authorize(&claim, &sign_claim(claim.map()), &transport, &config()).unwrap_err();
    assert_eq!(err.code, "oracle_unavailable");
}

#[test]
fn malformed_jws_rejected() {
    let claim = validated(Action::ExecutePython, base_claim("execute_python"));
    let err = authorize_with(&claim, "not-a-jws".to_string()).unwrap_err();
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
        assert_eq!(entry.claim_digest, "digest1");

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
            pool: "poolpda".into(),
            owner: "owner".into(),
            cluster: CLUSTER.into(),
            program: PROGRAM.into(),
            init_tx: "tx".into(),
            schema: json!({"type": "object"}),
        };
        store_identity(&identity).unwrap();
        let loaded = load_identity().unwrap().unwrap();
        assert_eq!(loaded.pool, "poolpda");
        assert_eq!(loaded.schema, json!({"type": "object"}));
    });
}
