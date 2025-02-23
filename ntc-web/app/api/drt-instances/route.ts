
// app/api/drt-instances/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { mintAddress, drtId, poolId, ownerId, state, isListed } = await req.json();

    // Validate required fields
    if (!mintAddress || !drtId || !poolId || !ownerId || !state) {
      return NextResponse.json({ error: 'Missing required fields: mintAddress, drtId, poolId, ownerId, and state are required' }, { status: 400 });
    }

    // Create the DRT instance in the database
    const drtInstance = await prisma.dRTInstance.create({
      data: {
        id: crypto.randomUUID(), // Generate a unique UUID
        mintAddress,
        drtId,
        poolId,
        ownerId,
        state,
        isListed: isListed ?? false, // Default to false if not provided
        price: null, // Ownership tokens do not have a price
      },
    });

    return NextResponse.json({ success: true, drtInstance }, { status: 201 });
  } catch (error) {
    console.error('Error creating DRT instance:', error);
    return NextResponse.json({ error: 'Failed to create DRT instance' }, { status: 500 });
  }
}