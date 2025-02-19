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
