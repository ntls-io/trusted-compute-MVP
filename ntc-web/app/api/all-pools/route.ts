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


// app/api/all-pools/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await currentUser();
    const userId = user?.id;
    
    // Fetch all pools from the database
    const allPools = await prisma.pool.findMany({
      include: {
        enclaveMeasurement: true,
        allowedDRTs: { include: { drt: true } },
        owner: true
      }
    });

    // If user is logged in, determine which pools are owned by the current user
    let ownedPoolIds = new Set<string>();
    if (userId) {
      const userData = await prisma.user.findFirst({
        where: { clerkId: userId },
        select: { id: true }
      });
      
      if (userData) {
        ownedPoolIds = new Set(
          allPools
            .filter(pool => pool.owner?.clerkId === userId)
            .map(pool => pool.id)
        );
      }
    }

    // Format the pools for the response, including isOwned property
    const formattedPools = allPools.map(pool => ({
      ...pool,
      isOwned: ownedPoolIds.has(pool.id),
      ownerId: pool.owner?.id || null
    }));

    console.log(`✅ Fetched ${allPools.length} pools`);

    return NextResponse.json({ pools: formattedPools });

  } catch (error) {
    console.error("❌ Internal server error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}