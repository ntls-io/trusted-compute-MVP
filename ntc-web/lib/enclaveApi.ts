/**
 * Nautilus Trusted Compute
 * Copyright (C) 2026 Relational Network
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// lib/enclaveApi.ts
//
// Client for the enclave proxy routes. Surfaces finality wait, invalid
// claim, oracle outage, code-hash mismatch, and replay as distinct errors,
// and retries only while the redemption transaction awaits finality.

export interface EnclaveErrorBody {
  error_code?: string;
  detail?: string;
  error?: string;
}

export class EnclaveError extends Error {
  readonly errorCode: string;

  constructor(errorCode: string, message: string) {
    super(message);
    this.errorCode = errorCode;
  }
}

const FRIENDLY_MESSAGES: Record<string, string> = {
  tx_not_finalized:
    "The Solana transaction is not finalized yet. Please retry shortly.",
  oracle_rejected: "The oracle refused the redemption claim.",
  oracle_unavailable:
    "The oracle service is unreachable. Your DRT was not consumed; retry later.",
  assertion_invalid:
    "The oracle assertion failed enclave verification (possible code-hash mismatch).",
  code_metadata_invalid:
    "The DRT's code metadata (GitHub URL / SHA-256 hash) is missing or malformed.",
  replay_rejected:
    "This redemption was already used; each DRT authorizes exactly one operation.",
  payload_mismatch:
    "The uploaded payload does not match what the wallet signed.",
  wallet_signature_invalid: "The wallet signature was rejected.",
  invalid_claim: "The redemption claim was rejected as invalid.",
  claim_expired: "The redemption claim expired before it was verified.",
  pool_binding_violation:
    "This enclave is bound to a different pool or is not initialized.",
  execution_failed:
    "Execution failed after the DRT was consumed (the token is burned on-chain).",
  enclave_unconfigured: "The enclave is missing its oracle configuration.",
};

export function friendlyEnclaveError(body: EnclaveErrorBody, status: number): EnclaveError {
  const code = body.error_code || "enclave_error";
  const base = FRIENDLY_MESSAGES[code] || body.error || "Enclave request failed";
  const detail = body.detail ? ` (${body.detail})` : "";
  return new EnclaveError(code, `${base}${detail} [${code}, HTTP ${status}]`);
}

const FINALITY_RETRIES = 12;
const FINALITY_RETRY_DELAY_MS = 5000;

/**
 * POST to an enclave proxy route. `tx_not_finalized`/`oracle_rejected`
 * caused by pending finality is retried with backoff; everything else is
 * thrown immediately as a typed EnclaveError.
 */
export async function postToEnclave<T = unknown>(
  route: string,
  body: Record<string, unknown>
): Promise<T> {
  let lastError: EnclaveError | null = null;
  for (let attempt = 0; attempt < FINALITY_RETRIES; attempt++) {
    const response = await fetch(route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) {
      const data = await response.json();
      return (data.result ?? data) as T;
    }
    let parsed: EnclaveErrorBody = {};
    try {
      const outer = await response.json();
      // Proxy routes wrap the enclave's JSON error in `details`.
      if (typeof outer.details === "string") {
        try {
          parsed = JSON.parse(outer.details);
        } catch {
          parsed = { error: outer.details };
        }
      } else {
        parsed = outer.details || outer;
      }
      if (!parsed.error_code && typeof outer.error === "string") {
        parsed.error = outer.error;
      }
    } catch {
      parsed = { error: `HTTP ${response.status}` };
    }
    const error = friendlyEnclaveError(parsed, response.status);
    const waitingForFinality =
      error.errorCode === "tx_not_finalized" ||
      (error.errorCode === "oracle_rejected" &&
        error.message.includes("tx_not_finalized"));
    if (!waitingForFinality) {
      throw error;
    }
    lastError = error;
    await new Promise((resolve) => setTimeout(resolve, FINALITY_RETRY_DELAY_MS));
  }
  throw lastError ?? new EnclaveError("tx_not_finalized", "Timed out waiting for finality");
}
