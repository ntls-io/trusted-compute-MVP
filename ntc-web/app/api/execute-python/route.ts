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

// app/api/execute-python/route.ts
//
// Verified Python execution: the signed redemption transaction, and the
// script's GitHub URL and code hash as committed in its on-chain memo. The
// enclave re-derives the commitment and cross-checks both against the
// oracle's view of the redeemed DRT, so neither the client nor the oracle
// can substitute a different program.
import { NextRequest } from 'next/server';
import { proxyProtectedRequest } from '@/lib/server/enclaveProxy';

export async function POST(req: NextRequest) {
  return proxyProtectedRequest(req, '/execute_python', { requirePayload: false });
}
