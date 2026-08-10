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

//! Sealed pool identity and replay ledger.
//!
//! Both files live under the data dir, which in production is the Gramine
//! encrypted mount keyed by MRENCLAVE (`/data`), so they are sealed at rest
//! and survive restarts. `DATA_DIR` overrides the location for unit tests.
//! Rollback protection for this sealed state is explicitly out of scope for
//! the research prototype.

use crate::error::ApiError;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

pub fn data_dir() -> PathBuf {
    PathBuf::from(std::env::var("DATA_DIR").unwrap_or_else(|_| "/data".to_string()))
}

fn identity_path() -> PathBuf {
    data_dir().join("pool_identity.json")
}

fn ledger_path() -> PathBuf {
    data_dir().join("replay_ledger.json")
}

fn write_atomic(path: &PathBuf, contents: &[u8]) -> Result<(), ApiError> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, contents).map_err(|e| ApiError::internal(format!("state write: {e}")))?;
    fs::rename(&tmp, path).map_err(|e| ApiError::internal(format!("state rename: {e}")))
}

/// One-time pool binding: PDA, owner, schema, and initialization tx are
/// fixed at pool creation and every later claim must match them.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoolIdentity {
    pub pool: String,
    pub owner: String,
    pub cluster: String,
    pub program: String,
    pub init_tx: String,
    pub schema: Value,
}

pub fn load_identity() -> Result<Option<PoolIdentity>, ApiError> {
    match fs::read(identity_path()) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|e| ApiError::internal(format!("pool identity corrupt: {e}"))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(ApiError::internal(format!("pool identity read: {e}"))),
    }
}

pub fn store_identity(identity: &PoolIdentity) -> Result<(), ApiError> {
    let bytes = serde_json::to_vec(identity)
        .map_err(|e| ApiError::internal(format!("pool identity encode: {e}")))?;
    write_atomic(&identity_path(), &bytes)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntryStatus {
    /// Reserved before mutation/execution; a crash mid-operation leaves the
    /// redemption consumed rather than replayable.
    Reserved,
    Succeeded,
    /// Execution failed after the DRT was burned on-chain: consumed.
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LedgerEntry {
    pub status: EntryStatus,
    pub commitment: String,
    /// Cached result for identical successful retries.
    pub result: Option<Value>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct ReplayLedger {
    entries: HashMap<String, LedgerEntry>,
}

pub fn replay_key(cluster: &str, program: &str, tx: &str) -> String {
    format!("{cluster}|{program}|{tx}")
}

impl ReplayLedger {
    pub fn load() -> Result<Self, ApiError> {
        match fs::read(ledger_path()) {
            Ok(bytes) => serde_json::from_slice(&bytes)
                .map_err(|e| ApiError::internal(format!("replay ledger corrupt: {e}"))),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(e) => Err(ApiError::internal(format!("replay ledger read: {e}"))),
        }
    }

    fn persist(&self) -> Result<(), ApiError> {
        let bytes = serde_json::to_vec(self)
            .map_err(|e| ApiError::internal(format!("replay ledger encode: {e}")))?;
        write_atomic(&ledger_path(), &bytes)
    }

    pub fn get(&self, key: &str) -> Option<&LedgerEntry> {
        self.entries.get(key)
    }

    /// Atomically reserve a redemption before any mutation or execution.
    /// Fails if the key was ever seen, so a redemption never runs twice.
    pub fn reserve(&mut self, key: &str, commitment: &str) -> Result<(), ApiError> {
        if self.entries.contains_key(key) {
            return Err(ApiError::replay(
                "redemption already consumed or in progress",
            ));
        }
        self.entries.insert(
            key.to_string(),
            LedgerEntry {
                status: EntryStatus::Reserved,
                commitment: commitment.to_string(),
                result: None,
            },
        );
        self.persist()
    }

    pub fn record_success(&mut self, key: &str, result: Option<Value>) -> Result<(), ApiError> {
        if let Some(entry) = self.entries.get_mut(key) {
            entry.status = EntryStatus::Succeeded;
            entry.result = result;
        }
        self.persist()
    }

    pub fn record_failure(&mut self, key: &str) -> Result<(), ApiError> {
        if let Some(entry) = self.entries.get_mut(key) {
            entry.status = EntryStatus::Failed;
        }
        self.persist()
    }
}
