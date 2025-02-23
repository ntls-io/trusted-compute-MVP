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

// app/api/append-data/route.ts
import { NextRequest, NextResponse } from 'next/server';
import fetch from 'node-fetch';
import https from 'https';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    
    if (!body) {
      return NextResponse.json({ 
        error: 'Invalid request body - must be valid JSON' 
      }, { status: 400 });
    }

    const { publicIp, data } = body;

    if (!publicIp || !data) {
      return NextResponse.json({ 
        error: 'Missing required fields',
        required: ['publicIp', 'data'],
        received: { publicIp: !!publicIp, data: !!data }
      }, { status: 400 });
    }

    const url = `https://${publicIp}/append_data`;
    
    // Custom agent for handling self-signed certificates
    const agent = new https.Agent({
      rejectUnauthorized: false,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data }),
      // @ts-ignore - Type mismatch between node-fetch and native fetch
      agent,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ 
        error: `Enclave error (${response.status})`,
        details: errorText
      }, { status: response.status });
    }

    const responseText = await response.text();
    
    try {
      // Try parsing as JSON first
      const jsonResult = JSON.parse(responseText);
      return NextResponse.json({ result: jsonResult });
    } catch {
      // If not JSON, check if it's the success message
      if (responseText.includes("Data appended, sealed, and saved successfully")) {
        return NextResponse.json({ 
          result: "Data appended, sealed, and saved successfully" 
        });
      }
      
      // Otherwise, it's an unexpected response
      return NextResponse.json({ 
        error: 'Unexpected response format from enclave',
        details: responseText
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json({ 
      error: 'Failed to communicate with enclave',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}