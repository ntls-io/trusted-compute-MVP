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
//
// Verified append: wallet-signed claim plus the exact JSON payload string
// the claim's payload_sha256 commits to.
import { NextRequest } from 'next/server';
import { proxyProtectedRequest } from '@/lib/server/enclaveProxy';

export async function POST(req: NextRequest) {
  return proxyProtectedRequest(req, '/append_data', { requirePayload: true });
}
