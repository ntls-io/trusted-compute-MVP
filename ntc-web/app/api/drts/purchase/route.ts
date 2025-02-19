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

// app/api/drts/purchase/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { prisma } from "@/lib/prisma"; // Use shared Prisma instance
import { Prisma } from '@prisma/client';

// Map from frontend DRT type names to database IDs
const DRT_TYPE_MAP: Record<string, string> = {
  "append": "APPEND_DATA_POOL",
  "w_compute_median": "EXECUTE_MEDIAN_WASM",
  "py_compute_median": "EXECUTE_MEDIAN_PYTHON"
};

export async function POST(req: NextRequest) {
  try {
    // Get authenticated user
    const user = await currentUser();
    
    if (!user?.id) {
      return NextResponse.json({ 
        success: false, 
        error: 'Authentication required' 
      }, { status: 401 });
    }
    
    // Parse request body
    const data = await req.json();
    
    // Log what we received
    console.log("Received purchase data:", JSON.stringify(data, null, 2));
    
    // Basic validation - keep it simple
    if (!data?.mintAddress || !data?.poolId || !data?.drtId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required fields' 
      }, { status: 400 });
    }

    // Find user by Clerk ID
    const dbUser = await prisma.user.findUnique({
      where: { clerkId: user.id }
    });

    if (!dbUser) {
      return NextResponse.json({ 
        success: false, 
        error: 'User record not found in database' 
      }, { status: 404 });
    }

    // Map frontend DRT type to database ID
    const databaseDrtId = DRT_TYPE_MAP[data.drtId] || data.drtId;
    console.log(`Mapping frontend DRT type "${data.drtId}" to database ID "${databaseDrtId}"`);
    
    // Check if the DRT type exists in database
    const drtType = await prisma.digitalRightToken.findUnique({
      where: { id: databaseDrtId }
    });

    if (!drtType) {
      console.error(`DRT type not found in database: ${databaseDrtId}`);
      return NextResponse.json({ 
        success: false, 
        error: `Invalid DRT type: ${data.drtId}` 
      }, { status: 400 });
    }
    
    // Use the database ID for all subsequent operations
    data.drtId = drtType.id;

    // Verify pool exists
    const pool = await prisma.pool.findUnique({
      where: { id: data.poolId }
    });

    if (!pool) {
      console.error(`Pool not found: ${data.poolId}`);
      return NextResponse.json({ 
        success: false, 
        error: `Invalid pool ID: ${data.poolId}` 
      }, { status: 400 });
    }

    // Verify the DRT is allowed for this pool
    const poolAllowedDRT = await prisma.poolAllowedDRT.findUnique({
      where: {
        poolId_drtId: {
          poolId: data.poolId,
          drtId: data.drtId
        }
      }
    });

    if (!poolAllowedDRT) {
      console.error(`DRT ${data.drtId} not allowed for pool ${data.poolId}`);
      return NextResponse.json({ 
        success: false, 
        error: `This DRT type is not allowed for the selected pool` 
      }, { status: 400 });
    }

    // Sanitize input values
    const quantity = Math.max(1, Number(data.quantity) || 1);
    const price = typeof data.price === 'number' ? data.price : null;

    console.log(`Creating ${quantity} DRT instances with price ${price}`);

    // Create the DRT instances
    const drtInstances = [];
    let baseAddress = data.mintAddress;
    
    for (let i = 0; i < quantity; i++) {
      try {

        const mintAddress = baseAddress;
        
        const drtInstance = await prisma.dRTInstance.create({
          data: {
            mintAddress,
            drtId: data.drtId,
            poolId: data.poolId,
            ownerId: dbUser.id,
            state: 'active',
            isListed: false,
            price
          }
        });
        
        drtInstances.push(drtInstance);
      } catch (createError) {
        console.error(`Error creating DRT instance: ${createError instanceof Error ? createError.message : 'Unknown error'}`);
        // Continue with the next instance instead of stopping
      }
    }

    // Return success response
    return NextResponse.json({ 
      success: true, 
      message: `Successfully recorded purchase of ${drtInstances.length} ${data.drtId} token(s)`,
      drtInstances
    });
    
  } catch (error) {
    // Safe error logging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error in purchase API: ${errorMessage}`);
    
    // Safe console error that won't cause TypeError
    if (error instanceof Error) {
      console.error('Full error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    
    // Return a safe error response
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to record purchase', 
    }, { status: 500 });
  }
}