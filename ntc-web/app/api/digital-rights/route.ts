import { NextResponse } from 'next/server';
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const digitalRights = await prisma.digitalRightToken.findMany({
      where: {
        isActive: true
      },
      select: {
        id: true,
        name: true,
        description: true,
        githubUrl: true,
        hash: true
      }
    });

    return NextResponse.json(digitalRights);
  } catch (error) {
    console.error("❌ Error fetching digital rights:", error);
    return NextResponse.json(
      { error: "Failed to fetch digital rights" },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}