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
    const user = await currentUser();

    if (!user) {
      console.warn("🚨 Unauthorized: No user found in Clerk.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(`✅ Fetching data for user: ${user.id}`);

    const userData = await prisma.user.findFirst({
      where: { clerkId: user.id },
      include: {
        pools: {
          include: {
            enclaveMeasurement: true,
            allowedDRTs: { include: { drt: true } }
          }
        },
        drtInstances: {
          include: { drt: true, pool: true }
        }
      }
    });

    if (!userData) {
      console.warn(`⚠️ No user data found for Clerk ID: ${user.id}`);
      return NextResponse.json({ pools: [], drtInstances: [] }, { status: 200 }); // Return empty arrays
    }

    return NextResponse.json({
      pools: userData.pools ?? [], // Ensure empty array
      drtInstances: userData.drtInstances ?? [] // Ensure empty array
    });

  } catch (error) {
    console.error("❌ Internal server error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
