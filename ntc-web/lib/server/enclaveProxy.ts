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

// lib/server/enclaveProxy.ts
//
// Shared proxy for the enclave's protected endpoints. Every protected
// request is the claimant's signed redemption transaction plus the values
// its on-chain memo commits to; the enclave re-derives the commitment and
// refuses anything that does not match, so this layer only forwards. The
// WASM schema still never comes from the client -- the enclave uses its
// sealed copy. Enclave error bodies are passed through verbatim in `details`
// so the browser can surface distinct error codes.
import { NextRequest, NextResponse } from 'next/server';
import fetch from 'node-fetch';
import https from 'https';

interface ProtectedBody {
  publicIp?: string;
  signed_transaction?: string;
  ephemeral_pubkey?: string;
  ephemeral_signature?: string;
  payload?: string;
  github_url?: string;
  code_hash?: string;
}

export async function proxyProtectedRequest(
  req: NextRequest,
  enclavePath: string,
  options: { requirePayload: boolean }
) {
  let body: ProtectedBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body - must be valid JSON' },
      { status: 400 }
    );
  }

  const {
    publicIp,
    signed_transaction,
    ephemeral_pubkey,
    ephemeral_signature,
    payload,
    github_url,
    code_hash,
  } = body;
  if (!publicIp || !signed_transaction || !ephemeral_pubkey || !ephemeral_signature) {
    return NextResponse.json(
      {
        error: 'Missing required fields',
        required: [
          'publicIp',
          'signed_transaction',
          'ephemeral_pubkey',
          'ephemeral_signature',
        ],
      },
      { status: 400 }
    );
  }
  if (options.requirePayload && typeof payload !== 'string') {
    return NextResponse.json(
      { error: 'Missing payload (exact JSON string the memo commits to)' },
      { status: 400 }
    );
  }

  try {
    const enclaveRequest: Record<string, unknown> = {
      signed_transaction,
      ephemeral_pubkey,
      ephemeral_signature,
    };
    if (typeof payload === 'string') {
      enclaveRequest.payload = payload;
    }
    if (typeof github_url === 'string' && typeof code_hash === 'string') {
      enclaveRequest.github_url = github_url;
      enclaveRequest.code_hash = code_hash;
    }

    const response = await fetch(`https://${publicIp}${enclavePath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enclaveRequest),
      agent: new https.Agent({
        // RA-TLS presents a self-signed certificate; trust is established
        // via remote attestation, not the web PKI.
        rejectUnauthorized: false,
      }),
    });

    const responseText = await response.text();
    if (!response.ok) {
      return NextResponse.json(
        { error: `Enclave error (${response.status})`, details: responseText },
        { status: response.status }
      );
    }

    try {
      return NextResponse.json({ result: JSON.parse(responseText) });
    } catch {
      return NextResponse.json({ result: responseText });
    }
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      {
        error: 'Failed to communicate with enclave',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
