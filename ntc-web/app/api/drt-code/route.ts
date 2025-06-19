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

// app/api/drt-code/route.ts

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

/* -------------------- GET -------------------- */
export async function GET() {
  const { userId } = await auth()
  if (!userId)
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const drts = await prisma.digitalRightToken.findMany({
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(
    drts.map((d) => ({ ...d, editable: d.ownerId === userId })),
  )
}

/* -------------------- POST ------------------- */
export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId)
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { operation, language, description, githubUrl, hash } = await req.json()

  if (!operation || !language)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const compositeName = `${operation.trim()} ${
    language === 'PYTHON' ? 'Python' : 'WASM'
  }`
  const id = compositeName.toUpperCase().replace(/\s+/g, '_')

  try {
    const drt = await prisma.digitalRightToken.create({
      data: {
        id,
        name: compositeName,
        description,
        githubUrl,
        hash,
        isActive: true,
        owner: { connect: { clerkId: userId } },
      },
    })
    return NextResponse.json(drt, { status: 201 })
  } catch (err) {
    /* ---- unique-constraint violation (duplicate id) ---- */
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'A DRT with that name already exists, please enter another name.' },
        { status: 409 },
      )
    }
    /* ---- anything else becomes 500 ---- */
    throw err
  }
}