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

// app/api/user-pool-next-id/route.ts
import { NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    // Authorization check
    const user = await currentUser();
    if (!user) {
      console.warn("🚨 Unauthorized: No user found in Clerk.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user.id;

    const allUserPools = await prisma.pool.findMany({
        where: { ownerId: userId },
        select: { name: true, poolSequenceId: true }
      });
      console.log(`All pools for user ${userId}:`, allUserPools);

    // Debugging: log user info
    console.log(`🔍 Fetching pool ID for user: ${userId}`);

    // Get pool name from query
    const { searchParams } = new URL(req.url)
    const name = (searchParams.get('name') || '').trim()
    if (!name) {
      return NextResponse.json({ error: 'Missing pool name' }, { status: 400 })
    }

    // Debugging: log request parameters
    console.log(`🔍 Looking for pools with name: "${name}"`);

    try {
      // Find the highest existing poolSequenceId for this user and pool name
      const highestSequencePool = await prisma.pool.findFirst({
        where: {
            owner: {
                clerkId: userId
            },
            name: {
                equals: name,
                mode: 'insensitive' // Make the search case insensitive
            }
        },
        orderBy: {
          poolSequenceId: 'desc'
        },
        select: {
          poolSequenceId: true,
          id: true // Also select ID for debugging
        }
      });

      // Debugging: log query result
      console.log(`🔍 Query result:`, highestSequencePool);

      // Next sequence ID will be the highest + 1, or 1 if none exists
      const nextId = highestSequencePool ? highestSequencePool.poolSequenceId + 1 : 1;
      
      console.log(`✅ Next poolSequenceId for user ${userId}, pool '${name}': ${nextId}`);
      return NextResponse.json({ nextId, poolName: name });
    } catch (dbError) {
      // Handle database-specific errors
      console.error("Database error:", dbError);
      
      // Check if this might be a migration issue
      if (dbError instanceof Error && dbError.message.includes('poolSequenceId')) {
        console.error("This may be a migration issue. Ensure you've run 'npx prisma migrate dev'");
        // Fallback: return ID 1 if this appears to be a migration issue
        return NextResponse.json({ 
          nextId: 1, 
          poolName: name,
          warning: "Using default ID due to database schema issue" 
        });
      }
      
      throw dbError; // Re-throw to be caught by outer catch
    }
  } catch (error) {
    console.error("Error determining next pool sequence ID:", error);
    return NextResponse.json(
      { error: 'Internal server error determining pool sequence ID' }, 
      { status: 500 }
    );
  }
}