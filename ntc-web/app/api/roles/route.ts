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

// app/api/roles/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { RoleName } from '@prisma/client';

// Define the expected structure for a role object returned by this API
export interface ApiRole {
    id: number; // The integer ID from the database Role table
    name: RoleName; // The RoleName enum value (e.g., "DATA_PROVIDER")
    description: string;
    // Add any other fields from the Role model you want to expose
}

export async function GET(req: Request) {
  try {
    const rolesFromDb = await prisma.role.findMany({
      select: {
        id: true,
        name: true,
        description: true,
      },
      orderBy: {
        // Optional: order them consistently, e.g., by name or ID
        name: 'asc',
      }
    });

    // Ensure the response matches the ApiRole interface, if needed for strict typing on client
    const roles: ApiRole[] = rolesFromDb;

    return NextResponse.json(roles, { status: 200 });
  } catch (error) {
    console.error('Error fetching all roles:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ message: `Failed to fetch roles: ${errorMessage}` }, { status: 500 });
  }
}