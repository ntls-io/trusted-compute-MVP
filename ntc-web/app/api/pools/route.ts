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

import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    // Get current user to check which pools they own
    const user = await currentUser();
    const userId = user?.id;

    // Fetch all pools with related data
    const pools = await prisma.pool.findMany({
      include: {
        enclaveMeasurement: true,
        allowedDRTs: {
          include: {
            drt: true
          }
        },
        owner: {
          select: {
            clerkId: true
          }
        }
      }
    });

    // Add isOwned field to each pool
    const enrichedPools = pools.map(pool => ({
      ...pool,
      isOwned: pool.owner?.clerkId === userId
    }));

    return NextResponse.json(enrichedPools);
  } catch (error) {
    console.error("❌ Error fetching pools:", error);
    return NextResponse.json(
      { error: "Failed to fetch pools" },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}