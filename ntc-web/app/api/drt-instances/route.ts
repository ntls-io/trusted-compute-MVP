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

// app/api/drt-instances/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { prisma } from "@/lib/prisma";
import { randomUUID } from 'crypto';

interface DRTInstanceRequest {
  mintAddress: string;
  drtId: string;
  poolId: string;
  state: string;
}

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  console.log(`[${requestId}] Starting DRT instance creation`);

  try {
    // Authentication check
    const user = await currentUser();
    if (!user) {
      console.warn(`[${requestId}] Authentication failed: No user found`);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.log(`[${requestId}] Request authenticated for user: ${user.id}`);

    // Request body parsing
    let body: DRTInstanceRequest;
    try {
      body = await req.json();
      console.log(`[${requestId}] Request body received:`, {
        mintAddress: body.mintAddress,
        drtId: body.drtId,
        poolId: body.poolId,
        state: body.state
      });
    } catch (e) {
      console.error(`[${requestId}] Request body parsing failed:`, e);
      return NextResponse.json({ 
        error: "Invalid JSON in request body" 
      }, { status: 400 });
    }

    // Input validation
    const { mintAddress, drtId, poolId, state } = body;
    const missingFields = [];
    if (!mintAddress) missingFields.push('mintAddress');
    if (!drtId) missingFields.push('drtId');
    if (!poolId) missingFields.push('poolId');
    if (!state) missingFields.push('state');

    if (missingFields.length > 0) {
      console.error(`[${requestId}] Validation failed - Missing fields:`, missingFields);
      return NextResponse.json({ 
        error: "Missing required fields",
        missing: missingFields
      }, { status: 400 });
    }

    // Pool existence check
    const pool = await prisma.pool.findUnique({
      where: { id: poolId },
    });

    if (!pool) {
      console.error(`[${requestId}] Pool not found: ${poolId}`);
      return NextResponse.json({ 
        error: "Pool not found" 
      }, { status: 404 });
    }
    console.log(`[${requestId}] Pool verified: ${pool.name}`);

    // DRT permission check
    const allowedDrt = await prisma.poolAllowedDRT.findFirst({
      where: { poolId, drtId },
      include: { drt: true }
    });

    if (!allowedDrt) {
      console.error(`[${requestId}] DRT permission check failed:`, {
        poolId,
        drtId
      });
      return NextResponse.json({ 
        error: "DRT not allowed for this pool" 
      }, { status: 403 });
    }
    console.log(`[${requestId}] DRT permission verified: ${allowedDrt.drt.name}`);

    // Create DRT instance
    const drtInstance = await prisma.dRTInstance.create({
      data: {
        id: randomUUID(),
        mintAddress,
        drtId,
        poolId,
        ownerId: user.id,
        state,
        isListed: false,
        price: null,
      },
    });

    console.log(`[${requestId}] DRT instance created successfully:`, {
      instanceId: drtInstance.id,
      state: drtInstance.state
    });

    return NextResponse.json({ 
      success: true, 
      drtInstance 
    }, { status: 201 });

  } catch (error) {
    console.error(`[${requestId}] Unhandled error:`, {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      type: typeof error
    });

    return NextResponse.json({ 
      error: "Internal server error",
      errorId: requestId
    }, { status: 500 });

  } finally {
    await prisma.$disconnect();
    console.log(`[${requestId}] Request completed`);
  }
}