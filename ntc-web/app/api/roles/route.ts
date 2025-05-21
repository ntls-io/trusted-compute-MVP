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