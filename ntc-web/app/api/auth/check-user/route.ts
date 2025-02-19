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
import { prisma } from "@/lib/prisma"; // Ensure you are using a shared Prisma instance

export async function POST(req: Request) {
    try {
        // Get Clerk userId correctly
        const user = await currentUser();

        if (!user?.id) {
            console.warn("🚨 Unauthorized: No user found in Clerk.");
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const userId = user.id;

        // Check if user exists in Prisma
        let existingUser = await prisma.user.findUnique({
            where: { clerkId: userId },
        });

        // Create user if not exists
        if (!existingUser) {
            console.log(`🆕 Creating new user in Prisma for Clerk ID: ${userId}`);

            existingUser = await prisma.user.create({
                data: {
                    id: userId,
                    clerkId: userId,
                    walletAddress: null, // Optional: Modify based on Clerk metadata if needed
                },
            });
        } else {
            console.log(`✅ User found in Prisma: ${existingUser.id}`);
        }

        return NextResponse.json({ user: existingUser }, { status: 200 });
    } catch (error) {
        console.error("❌ Error checking user:", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}
