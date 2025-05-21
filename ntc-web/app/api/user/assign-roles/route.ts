
// app/api/user/assign-roles/route.ts
import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { RoleName } from '@prisma/client'; // Import RoleName enum from Prisma

export async function POST(req: Request) {
  try {
    const clerkUser = await currentUser(); // Get the authenticated Clerk user

    if (!clerkUser?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    
    const userId = clerkUser.id;

    const body = await req.json();
    const selectedRoleNames: RoleName[] = body.roles; // Expect an array of RoleName strings

    if (!Array.isArray(selectedRoleNames)) { // Allow empty array if user can have no roles
      return NextResponse.json({ message: 'Roles must be an array.' }, { status: 400 });
    }

    // Validate role names against the RoleName enum
    const validRoleEnumValues = Object.values(RoleName);
    for (const name of selectedRoleNames) {
      if (!validRoleEnumValues.includes(name)) {
        return NextResponse.json({ message: `Invalid role name provided: ${name}` }, { status: 400 });
      }
    }

    // Fetch the actual Role records from the DB to get their integer IDs
    const rolesInDb = await prisma.role.findMany({
      where: {
        name: { in: selectedRoleNames }, // Filter roles by the names provided
      },
      select: { id: true, name: true }, // Select only the id and name
    });

    // Ensure all selected roles were found in the database
    // This check is important if selectedRoleNames is not empty
    if (selectedRoleNames.length > 0 && rolesInDb.length !== selectedRoleNames.length) {
      const foundDbRoleNames = rolesInDb.map(r => r.name);
      const missingRoleNames = selectedRoleNames.filter(name => !foundDbRoleNames.includes(name));
      console.warn(`Could not find the following roles in DB for user ${userId}: ${missingRoleNames.join(', ')}`);
      return NextResponse.json({ message: `One or more selected roles were not found in the database: ${missingRoleNames.join(', ')}` }, { status: 400 });
    }

    const userRoleDataToCreate = rolesInDb.map(role => ({
      userId: userId,
      roleId: role.id,
      // assignedAt is @default(now()) in schema
    }));

    // Use a transaction:
    // 1. Delete all existing roles for this user.
    // 2. Create new UserRole entries for the selected roles.
    // This makes the operation idempotent for the set of roles.
    await prisma.$transaction([
      prisma.userRole.deleteMany({
        where: { userId: userId },
      }),
      prisma.userRole.createMany({
        data: userRoleDataToCreate,
      }),
    ]);

    return NextResponse.json({ message: 'Roles updated successfully! Redirecting...' }, { status: 200 });
  } catch (error) {
    console.error('Error assigning roles:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ message: `Failed to assign roles: ${errorMessage}` }, { status: 500 });
  }
}