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

//! Structured API errors so the web layer can surface finality wait,
//! invalid claim, oracle outage, code-hash mismatch, and replay distinctly.

use actix_web::http::StatusCode;
use actix_web::{HttpResponse, ResponseError};
use std::fmt;

#[derive(Debug, Clone)]
pub struct ApiError {
    pub status: u16,
    pub code: &'static str,
    pub detail: String,
}

impl ApiError {
    pub fn new(status: u16, code: &'static str, detail: impl Into<String>) -> Self {
        ApiError {
            status,
            code,
            detail: detail.into(),
        }
    }

    pub fn invalid_claim(detail: impl Into<String>) -> Self {
        Self::new(400, "invalid_claim", detail)
    }

    pub fn oracle_unavailable(detail: impl Into<String>) -> Self {
        Self::new(502, "oracle_unavailable", detail)
    }

    pub fn oracle_rejected(status: u16, code: &'static str, detail: impl Into<String>) -> Self {
        Self::new(status, code, detail)
    }

    pub fn assertion_invalid(detail: impl Into<String>) -> Self {
        Self::new(401, "assertion_invalid", detail)
    }

    pub fn pool_binding(detail: impl Into<String>) -> Self {
        Self::new(409, "pool_binding_violation", detail)
    }

    pub fn replay(detail: impl Into<String>) -> Self {
        Self::new(409, "replay_rejected", detail)
    }

    pub fn internal(detail: impl Into<String>) -> Self {
        Self::new(500, "internal_error", detail)
    }
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code, self.detail)
    }
}

impl ResponseError for ApiError {
    fn status_code(&self) -> StatusCode {
        StatusCode::from_u16(self.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR)
    }

    fn error_response(&self) -> HttpResponse {
        HttpResponse::build(self.status_code()).json(serde_json::json!({
            "error_code": self.code,
            "detail": self.detail,
        }))
    }
}
