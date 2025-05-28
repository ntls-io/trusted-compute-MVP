// ntc-web/app/api/drt-code/[drtId]/route.ts

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/* --------- helpers --------- */
type Ctx = { params: { drtId: string } }

/* --------------- PUT --------------- */
export async function PUT(req: Request, context: Ctx) {
  // Await the params Promise first
  const { drtId } = await context.params

  const { userId } = await auth()
  if (!userId)
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const drt = await prisma.digitalRightToken.findUnique({ where: { id: drtId } })
  if (!drt)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (drt.ownerId !== userId)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { description, githubUrl, hash, isActive } = await req.json()

  const updated = await prisma.digitalRightToken.update({
    where: { id: drtId },
    data: { description, githubUrl, hash, isActive },
  })

  return NextResponse.json(updated)
}

/* -------------- DELETE -------------- */
export async function DELETE(_: Request, context: Ctx) {
  // Await the params Promise first
  const { drtId } = await context.params

  const { userId } = await auth()
  if (!userId)
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const drt = await prisma.digitalRightToken.findUnique({ where: { id: drtId } })
  if (!drt)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (drt.ownerId !== userId)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.digitalRightToken.delete({ where: { id: drtId } })
  return NextResponse.json({ success: true })
}
