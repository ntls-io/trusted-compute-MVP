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

// app/api/wallet/route.ts
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await currentUser();

    if (!user) {
      console.warn("🚨 Unauthorized: No user found in Clerk.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(`✅ Fetching wallet for user: ${user.id}`);

    const userData = await prisma.user.findUnique({
      where: { clerkId: user.id },
      select: { walletAddress: true }
    });

    return NextResponse.json({ 
      walletAddress: userData?.walletAddress ?? null 
    });

  } catch (error) {
    console.error("❌ Error fetching wallet:", error);
    return NextResponse.json(
      { error: "Internal server error" }, 
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await currentUser();

    if (!user) {
      console.warn("🚨 Unauthorized: No user found in Clerk.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { walletAddress } = await request.json();
    
    if (!walletAddress) {
      console.warn("⚠️ Bad request: Missing wallet address");
      return NextResponse.json(
        { error: "Wallet address is required" },
        { status: 400 }
      );
    }

    console.log(`✅ Linking wallet for user: ${user.id}`);

    const updatedUser = await prisma.user.update({
      where: { clerkId: user.id },
      data: { walletAddress },
      select: { walletAddress: true }
    });

    return NextResponse.json({ 
      walletAddress: updatedUser.walletAddress 
    });

  } catch (error) {
    console.error("❌ Error linking wallet:", error);
    return NextResponse.json(
      { error: "Failed to link wallet" },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await currentUser();

    if (!user) {
      console.warn("🚨 Unauthorized: No user found in Clerk.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(`✅ Unlinking wallet for user: ${user.id}`);

    const updatedUser = await prisma.user.update({
      where: { clerkId: user.id },
      data: { walletAddress: null },
      select: { walletAddress: true }
    });

    return NextResponse.json({ 
      walletAddress: updatedUser.walletAddress 
    });

  } catch (error) {
    console.error("❌ Error unlinking wallet:", error);
    return NextResponse.json(
      { error: "Failed to unlink wallet" },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}