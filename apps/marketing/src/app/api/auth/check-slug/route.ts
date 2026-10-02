import { workspaceSchema } from "@/lib/signup-schemas"
import { resolveSignupWorkspace } from "@/lib/signup-workspace"
import { prisma } from "@ewatrade/db"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod"

const checkSchema = z.object({
  slug: workspaceSchema.shape.subdomain,
  email: z.email().optional(),
})

export async function GET(request: NextRequest) {
  return checkAvailability({
    slug: request.nextUrl.searchParams.get("slug")?.trim().toLowerCase(),
  })
}

export async function POST(request: NextRequest) {
  return checkAvailability(await request.json().catch(() => null))
}

async function checkAvailability(input: unknown) {
  const parsed = checkSchema.safeParse(input)
  if (!parsed.success) {
    return NextResponse.json({ available: false }, { status: 400 })
  }
  let workspace: ReturnType<typeof resolveSignupWorkspace>
  try {
    workspace = resolveSignupWorkspace(parsed.data)
  } catch {
    return NextResponse.json(
      {
        available: false,
        message:
          "QA email routing is unavailable or this QA domain is not configured.",
      },
      { status: 503 },
    )
  }
  const slug = workspace.slug

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

  return NextResponse.json(
    { available: !existing, slug, isQa: Boolean(workspace.qaSourceDomain) },
    { headers: { "Cache-Control": "no-store" } },
  )
}
