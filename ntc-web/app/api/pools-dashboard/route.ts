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

// app/api/pools-dashboard/route.ts
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// Define valid DRT types
type FrontendDrtType = 'append' | 'w_compute_median' | 'py_compute_median';
type DatabaseDrtType = 'APPEND_DATA_POOL' | 'EXECUTE_MEDIAN_WASM' | 'EXECUTE_MEDIAN_PYTHON';

// Map frontend DRT names to database IDs with type safety
const DRT_MAPPING: Record<FrontendDrtType, DatabaseDrtType> = {
  'append': 'APPEND_DATA_POOL',
  'w_compute_median': 'EXECUTE_MEDIAN_WASM',
  'py_compute_median': 'EXECUTE_MEDIAN_PYTHON'
} as const;

export async function POST(request: NextRequest) {
  try {
    let body;
    try {
        body = await request.json();
        console.log("Received Payload:", JSON.stringify(body, null, 2));
    } catch (parseError) {
        console.error("JSON parse error:", parseError);
        return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }
    
    const { name, description, poolSequenceId, chainAddress, vaultAddress, feeVaultAddress, ownershipMintAddress, schemaDefinition } = body;
    
    // Validate that all required fields are present
    if (!name || !description || !chainAddress || !vaultAddress || !feeVaultAddress || !ownershipMintAddress || !schemaDefinition) {
      console.error("Missing required fields");
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Map and validate DRT IDs with type checking
    const mappedDrtIds = schemaDefinition.allowedDrts.map((drt: string) => {
      return DRT_MAPPING[drt as FrontendDrtType];
    });
    
    // Check for any undefined mappings
    if (mappedDrtIds.some((id: DatabaseDrtType | undefined): id is undefined => id === undefined)) {
      const invalidDrts = schemaDefinition.allowedDrts.filter(
        (drt: string) => !DRT_MAPPING[drt as FrontendDrtType]
      );
      console.error("Invalid DRT types:", invalidDrts);
      return NextResponse.json({
        error: "Invalid DRT types provided",
        invalidDrts
      }, { status: 400 });
    }
    
    const clerkUser = await currentUser();
    if (!clerkUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    let user = await prisma.user.findUnique({ 
      where: { clerkId: clerkUser.id } 
    });
    
    if (!user) {
      user = await prisma.user.create({
        data: {
          id: clerkUser.id,
          clerkId: clerkUser.id,
          walletAddress: typeof clerkUser.publicMetadata?.walletAddress === 'string' 
            ? clerkUser.publicMetadata.walletAddress 
            : null,
        },
      });
    }
    
    // Create the new pool with properly typed DRT IDs
    const newPool = await prisma.pool.create({
      data: {
        name,
        description,
        poolSequenceId,
        chainAddress,
        vaultAddress,
        feeVaultAddress,
        ownershipMintAddress,
        schemaDefinition,
        ownerId: user.id,
        allowedDRTs: {
          create: mappedDrtIds.map((drtId: DatabaseDrtType) => ({
            drtId
          })),
        },
      },
      include: {
        allowedDRTs: true,
      },
    });
    
    // Convert the newPool to a JSON-friendly object (e.g., BigInts become strings)
    const safePool = JSON.parse(JSON.stringify(newPool));
    return NextResponse.json({ 
      success: true,
      pool: safePool 
    }, { status: 201 });
    
} catch (error: any) {
    console.error("Error creating pool:", error);
    return NextResponse.json({ 
      error: "Internal server error",
      details: error?.message || "No error message available"
    }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
