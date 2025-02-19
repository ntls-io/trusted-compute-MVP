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

// app/api/drts/user/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    // Get authenticated user
    const user = await currentUser();
    
    if (!user?.id) {
      return NextResponse.json({ 
        success: false, 
        error: 'Authentication required' 
      }, { status: 401 });
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

    // Fetch all DRT instances owned by this user
    const drtInstances = await prisma.dRTInstance.findMany({
      where: { ownerId: dbUser.id },
      orderBy: { createdAt: 'desc' }
    });

    // Return the list of DRT instances
    return NextResponse.json(drtInstances);
    
  } catch (error) {
    // Safe error logging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error fetching user DRTs: ${errorMessage}`);
    
    if (error instanceof Error) {
      console.error(error);
    }
    
    // Return a safe error response
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch DRT instances', 
    }, { status: 500 });
  }
}