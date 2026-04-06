import { prisma } from "@ewatrade/db"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug")?.trim().toLowerCase()

  if (!slug || slug.length < 3) {
    return NextResponse.json({ available: false }, { status: 400 })
  }

  // Basic slug format validation
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(slug)) {
    return NextResponse.json({ available: false })
  }

  // Reserved slugs that should not be registered
  const RESERVED = new Set([
    "www",
    "app",
    "api",
    "admin",
    "mail",
    "smtp",
    "ftp",
    "dashboard",
    "pos",
    "storefront",
    "marketing",
    "static",
    "cdn",
    "support",
    "help",
    "status",
    "jobs",
    "ewatrade",
  ])

  if (RESERVED.has(slug)) {
    return NextResponse.json({ available: false })
  }

  const existing = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true },
  })

  return NextResponse.json({ available: !existing })
}
