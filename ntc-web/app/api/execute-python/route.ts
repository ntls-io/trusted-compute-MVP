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
// Verified Python execution: wallet-signed claim only. The script's GitHub
// URL and code hash come from the oracle-verified on-chain redemption,
// never from the client.
import { NextRequest } from 'next/server';
import { proxyProtectedRequest } from '@/lib/server/enclaveProxy';

export async function POST(req: NextRequest) {
  return proxyProtectedRequest(req, '/execute_python', { requirePayload: false });
}
