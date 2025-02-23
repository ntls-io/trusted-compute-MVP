
// app/api/append-data/route.ts
import { NextRequest, NextResponse } from 'next/server';
import fetch from 'node-fetch';
import https from 'https';

export async function POST(req: NextRequest) {
  try {
    const { publicIp, data } = await req.json();

    if (!publicIp || !data) {
      return NextResponse.json({ error: 'Missing publicIp or data' }, { status: 400 });
    }

    const url = `https://${publicIp}/append_data`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data }),
      agent: new https.Agent({
        rejectUnauthorized: false, // Ignore self-signed certificate
      }),
    } as any);

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: `Enclave error: ${errorText}` }, { status: response.status });
    }

    // Get the response text first
    const responseText = await response.text();
    let result;

    // Try to parse as JSON; if it fails, treat as plain text
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      // If not JSON, assume it’s the success message and wrap it
      if (responseText.includes("Data appended, sealed, and saved successfully")) {
        result = { result: responseText };
      } else {
        throw new Error(`Unexpected response from enclave: ${responseText}`);
      }
    }

    return NextResponse.json({ result });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to proxy request to enclave' }, { status: 500 });
  }
}