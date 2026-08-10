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

// app/api/execute-wasm/route.ts
//
// Verified WASM execution: the signed redemption transaction, and the
// binary's GitHub URL and hash as committed in its on-chain memo. The schema
// comes from the enclave's sealed pool identity, never from the client.
import { NextRequest } from 'next/server';
import { proxyProtectedRequest } from '@/lib/server/enclaveProxy';

export async function POST(req: NextRequest) {
  return proxyProtectedRequest(req, '/execute_wasm', { requirePayload: false });
}
