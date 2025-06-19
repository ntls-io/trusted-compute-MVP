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

// ntc-web/app/api/deployments/[id]/route.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * GET /api/deployments/:id
 *
 * This route proxies our front-end calls to the Azure TEE API,
 * avoiding CORS by fetching server-side.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  if (!id) {
    return NextResponse.json({ error: 'Missing deployment ID' }, { status: 400 })
  }

  const apiBase = process.env.NEXT_PUBLIC_API_URL
  if (!apiBase) {
    console.error('[proxy:/api/deployments] NEXT_PUBLIC_API_URL is undefined')
    return NextResponse.json(
      { error: 'Server misconfiguration: API base URL is missing' },
      { status: 500 }
    )
  }

  const azureUrl = `${apiBase}/deployments/${encodeURIComponent(id)}`

  try {
    const azureRes = await fetch(azureUrl)
    const text = await azureRes.text()

    // If Azure returned non-JSON (e.g. "stream timeout"), treat as still provisioning
    if (!azureRes.ok) {
      // 404 → pending; other non-OK → bubble error
      if (azureRes.status === 404) {
        return NextResponse.json({ status: 'pending' }, { status: 200 })
      }
      throw new Error(`Azure responded ${azureRes.status}: ${text}`)
    }

    // Try to parse JSON; if that fails, assume it's still streaming.
    let payload: any
    try {
      payload = JSON.parse(text)
    } catch {
      console.warn('[proxy:/api/deployments] Non-JSON body, assuming pending:', text)
      return NextResponse.json({ status: 'pending' }, { status: 200 })
    }

    // Success! Mirror Azure’s status code and body
    return NextResponse.json(payload, { status: azureRes.status })

  } catch (err: any) {
    console.error('[proxy:/api/deployments] fetch error:', err)
    return NextResponse.json(
      {
        error: 'Failed to fetch from Azure TEE API',
        details: err.message,
      },
      { status: 502 }
    )
  }
}