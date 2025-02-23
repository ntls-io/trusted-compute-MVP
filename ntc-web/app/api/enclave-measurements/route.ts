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

// app/api/enclave-measurements/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { poolId, mrenclave, mrsigner, isvProdId, isvSvn, publicIp, actualName } = body;

    // Validate required fields
    if (!poolId || !mrenclave || !mrsigner || !isvProdId || !isvSvn) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    try {
      const enclaveMeasurement = await prisma.enclaveMeasurement.create({
        data: {
          pool: {
            connect: {
              id: poolId
            }
          },
          mrenclave,
          mrsigner,
          isvProdId,
          isvSvn,
          publicIp,    // Add publicIp (optional)
          actualName,  // Add actualName (optional)
        },
      });

      return NextResponse.json(enclaveMeasurement);
    } catch (prismaError: any) {
      if (prismaError.code === 'P2025') {
        return NextResponse.json(
          { error: 'Pool not found' },
          { status: 404 }
        );
      }
      throw prismaError;
    }
  } catch (error: any) {
    console.error('Error saving enclave measurement:', error);
    return NextResponse.json(
      { 
        error: 'Failed to save enclave measurement',
        details: error.message 
      },
      { status: 500 }
    );
  }
}