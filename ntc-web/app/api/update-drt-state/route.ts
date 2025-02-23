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

// app/api/update-drt-state/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const user = await currentUser();

    if (!user) {
      console.warn("🚨 Unauthorized: No user found in Clerk.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { drtInstanceId, state } = await req.json();

    if (!drtInstanceId || !state) {
      return NextResponse.json({ error: "Missing drtInstanceId or state" }, { status: 400 });
    }

    // Verify the DRTInstance belongs to the user
    const drtInstance = await prisma.dRTInstance.findFirst({
      where: {
        id: drtInstanceId,
        ownerId: user.id,
      },
    });

    if (!drtInstance) {
      return NextResponse.json({ error: "DRTInstance not found or not owned by user" }, { status: 404 });
    }

    // Update the state
    const updatedDrtInstance = await prisma.dRTInstance.update({
      where: { id: drtInstanceId },
      data: { state },
    });

    console.log(`✅ Updated DRTInstance ${drtInstanceId} state to ${state}`);

    return NextResponse.json({ success: true, drtInstance: updatedDrtInstance });
  } catch (error) {
    console.error("❌ Error updating DRT state:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}