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
// request is a wallet-signed chain claim (+ optional exact payload string);
// security-sensitive fields (GitHub URL, code hash, schema) never come from
// the client. Enclave error bodies are passed through verbatim in `details`
// so the browser can surface distinct error codes.
import { NextRequest, NextResponse } from 'next/server';
import fetch from 'node-fetch';
import https from 'https';

interface ProtectedBody {
  publicIp?: string;
  claim?: Record<string, string>;
  wallet_signature?: string;
  payload?: string;
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

  const { publicIp, claim, wallet_signature, payload } = body;
  if (!publicIp || !claim || !wallet_signature) {
    return NextResponse.json(
      { error: 'Missing required fields', required: ['publicIp', 'claim', 'wallet_signature'] },
      { status: 400 }
    );
  }
  if (options.requirePayload && typeof payload !== 'string') {
    return NextResponse.json(
      { error: 'Missing payload (exact JSON string the claim commits to)' },
      { status: 400 }
    );
  }

  try {
    const enclaveRequest: Record<string, unknown> = { claim, wallet_signature };
    if (typeof payload === 'string') {
      enclaveRequest.payload = payload;
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
