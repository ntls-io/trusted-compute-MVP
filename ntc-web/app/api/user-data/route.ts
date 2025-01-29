import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await currentUser();

    if (!user) {
      console.warn("🚨 Unauthorized: No user found in Clerk.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(`✅ Fetching data for user: ${user.id}`);

    const userData = await prisma.user.findFirst({
      where: { clerkId: user.id },
      include: {
        pools: {
          include: {
            enclaveMeasurement: true,
            allowedDRTs: { include: { drt: true } }
          }
        },
        drtInstances: {
          include: { drt: true, pool: true }
        }
      }
    });

    if (!userData) {
      console.warn(`⚠️ No user data found for Clerk ID: ${user.id}`);
      return NextResponse.json({ pools: [], drtInstances: [] }, { status: 200 }); // Return empty arrays
    }

    return NextResponse.json({
      pools: userData.pools ?? [], // Ensure empty array
      drtInstances: userData.drtInstances ?? [] // Ensure empty array
    });

  } catch (error) {
    console.error("❌ Internal server error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
