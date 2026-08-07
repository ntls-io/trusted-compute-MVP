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
import { Prisma, RoleName } from '@prisma/client'; // Import RoleName for type safety

export async function GET() {
  try {
    const clerkUser = await currentUser();

    if (!clerkUser?.id) {
      return NextResponse.json({ message: 'Unauthorized: No user session found.' }, { status: 401 });
    }

    // In your schema, User.id IS the clerkUser.id
    const userId = clerkUser.id;

    const includeUserRoles = {
      userRoles: {
        select: {
          role: {
            select: {
              name: true,
            },
          },
        },
      },
    };

    let userProfile = await prisma.user.findUnique({
      where: {
        clerkId: userId,
      },
      include: includeUserRoles,
    });

    if (!userProfile) {
      try {
        userProfile = await prisma.user.create({
          data: {
            id: userId,
            clerkId: userId,
            walletAddress: null,
          },
          include: includeUserRoles,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          userProfile = await prisma.user.findUnique({
            where: { clerkId: userId },
            include: includeUserRoles,
          });
        } else {
          throw error;
        }
      }
    }

    if (!userProfile) {
      return NextResponse.json(
        { message: "User profile could not be loaded." },
        { status: 500 }
      );
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
