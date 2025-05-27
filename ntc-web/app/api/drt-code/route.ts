// app/api/drt-code/route.ts

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const drts = await prisma.digitalRightToken.findMany({ orderBy: { name: 'asc' } });
  return NextResponse.json(drts.map((d) => ({ ...d, editable: d.ownerId === userId })));
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { operation, language, description, githubUrl, hash } = await req.json();
  if (!operation || !language) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const compositeName = `${operation.trim()} ${language === 'PYTHON' ? 'Python' : 'WASM'}`;
  const id = compositeName.toUpperCase().replace(/\s+/g, '_');

  // uniqueness check
  const exists = await prisma.digitalRightToken.findUnique({ where: { id } });
  if (exists) return NextResponse.json({ error: 'A DRT with that name already exists.' }, { status: 409 });

  const drt = await prisma.digitalRightToken.create({
    data: { id, name: compositeName, description, githubUrl, hash, isActive: true, owner: { connect: { clerkId: userId } } },
  });
  return NextResponse.json(drt, { status: 201 });
}