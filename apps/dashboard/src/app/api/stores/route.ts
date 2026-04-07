import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { prisma } from "@ewatrade/db"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod/v4"

const createStoreSchema = z.object({
  name: z.string().min(1).max(120),
  currencyCode: z.string().length(3).default("NGN"),
  supportEmail: z.email().optional(),
  supportPhone: z.string().optional(),
})

// Slugify a display name into a URL-safe store slug
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession()
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await getActiveTenant(session.user.id)
  if (!ctx)
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const body = await request.json().catch(() => null)
  const parsed = createStoreSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const { name, currencyCode, supportEmail, supportPhone } = parsed.data

  // Generate a unique slug within the tenant
  const baseSlug = toSlug(name) || "store"
  let slug = baseSlug
  let attempt = 0

  while (true) {
    const existing = await prisma.store.findUnique({
      where: { tenantId_slug: { tenantId: ctx.tenant.id, slug } },
    })
    if (!existing) break
    attempt++
    slug = `${baseSlug}-${attempt}`
  }

  const store = await prisma.store.create({
    data: {
      tenantId: ctx.tenant.id,
      slug,
      name,
      currencyCode,
      supportEmail: supportEmail ?? null,
      supportPhone: supportPhone ?? null,
      status: "ACTIVE",
    },
    select: { id: true, slug: true, name: true, status: true },
  })

  return NextResponse.json({ success: true, store }, { status: 201 })
}
