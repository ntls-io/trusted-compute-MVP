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

//! Oracle-backed DRT redemption verification for the SGX enclave.
//!
//! Split from the enclave binary so the security-critical logic (canonical
//! claims, wallet signatures, JWS verification, replay ledger, pool
//! identity) is unit-testable outside SGX and without the Python runtime
//! the enclave links against.

pub mod authz;
pub mod canonical;
pub mod claim;
pub mod error;
pub mod oracle_client;
pub mod state;

#[cfg(test)]
mod tests;
