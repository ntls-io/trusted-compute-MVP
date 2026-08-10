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
//
// One-time pool initialization: the signed pool-creation transaction plus
// the exact payload string containing `schema` and seed `data`, which its
// on-chain memo commits to.
import { NextRequest } from 'next/server';
import { proxyProtectedRequest } from '@/lib/server/enclaveProxy';

export async function POST(req: NextRequest) {
  return proxyProtectedRequest(req, '/create_data_pool', { requirePayload: true });
}
