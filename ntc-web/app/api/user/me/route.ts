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

// app/api/user/me/route.ts
import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma'; 
import { RoleName } from '@prisma/client'; // Import RoleName for type safety

export async function GET(req: Request) {
  try {
    const clerkUser = await currentUser();

    if (!clerkUser?.id) {
      return NextResponse.json({ message: 'Unauthorized: No user session found.' }, { status: 401 });
    }

    // In your schema, User.id IS the clerkUser.id
    const userId = clerkUser.id;

    const userProfile = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        userRoles: { // Include the join table records
          select: {
            role: { // For each join table record, select the related Role
              select: {
                name: true, // And from that Role, select its name
              },
            },
          },
        },
        // You can include other fields from the User model if needed by the client
        // e.g., walletAddress: true,
      },
    });

    if (!userProfile) {
      // This might happen if the user exists in Clerk but their record hasn't been created
      // in your local DB yet (e.g., if /api/auth/check-user hasn't run for them).
      console.warn(`User profile not found in DB for Clerk ID: ${userId}. Prompting for profile setup might be needed.`);
      return NextResponse.json({ message: 'User profile not found in application database. Please complete your profile setup.' }, { status: 404 });
    }

    // Transform the userRoles data into a simple array of role names
    const roles: RoleName[] = userProfile.userRoles.map(userRole => userRole.role.name);

    // Prepare the response object, excluding the detailed userRoles join table structure
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { userRoles, ...profileData } = userProfile;

    return NextResponse.json({
      ...profileData, // Includes id, clerkId, walletAddress, createdAt, updatedAt from User model
      roles: roles,  // The simplified array of role names
    });

  } catch (error) {
    console.error('Error fetching user data for /api/user/me:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ message: `Error fetching user data: ${errorMessage}` }, { status: 500 });
  }
}