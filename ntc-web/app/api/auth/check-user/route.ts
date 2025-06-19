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

// app/api/auth/check-user/route.ts
import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    try {
        const user = await currentUser();

        if (!user?.id) {
            console.warn("🚨 Unauthorized: No user found in Clerk session for check-user.");
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const userId = user.id;

        // Use prisma.user.upsert to atomically find and create/update the user.
        // This is safe to call multiple times and prevents race conditions.
        const userInDb = await prisma.user.upsert({
            where: {
                clerkId: userId,
            },
            update: {
                // You can add fields to update on every login here if needed
                // For example: lastLoginAt: new Date()
            },
            create: {
                id: userId,
                clerkId: userId,
                // walletAddress can be set to null or a default value
                walletAddress: null,
            },
        });

        console.log(`✅ User ${userInDb.id} ensured in DB.`);

        return NextResponse.json({ user: userInDb }, { status: 200 });

    } catch (error) {
        console.error("❌ Error in check-user endpoint:", error);
        // It's helpful to log the specific error to the console
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        return NextResponse.json(
            { message: `Internal server error: ${errorMessage}` },
            { status: 500 }
        );
    }
}