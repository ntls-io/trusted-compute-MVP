/**
 * Nautilus Trusted Compute
 * Copyright (C) 2025 Nautilus
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

// app/api/create-data-pool/route.ts
import { NextRequest, NextResponse } from 'next/server';
import fetch from 'node-fetch'; // Import node-fetch
import https from 'https';

export async function POST(req: NextRequest) {
  try {
    const { publicIp, data } = await req.json();

    if (!publicIp || !data) {
      return NextResponse.json({ error: 'Missing publicIp or data' }, { status: 400 });
    }

    const url = `https://${publicIp}/create_data_pool`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data }),
      agent: new https.Agent({
        rejectUnauthorized: false, // Ignore self-signed certificate
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: `Enclave error: ${errorText}` }, { status: response.status });
    }

    const result = await response.text();
    return NextResponse.json({ result });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json({ error: 'Failed to proxy request to enclave' }, { status: 500 });
  }
}