import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod/v4"

const ACTIVE_TENANT_COOKIE = "ewatrade.active_tenant_slug"
const activeTenantSchema = z.object({
  path: z.string().startsWith("/").default("/"),
  tenantId: z.string().min(1),
})

export async function POST(request: NextRequest) {
  const session = await getServerSession()

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const ctx = await getActiveTenant(session.user.id)

  if (!ctx) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  }

  const body = await request.json().catch(() => null)
  const parsed = activeTenantSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const tenant = ctx.tenants.find((item) => item.id === parsed.data.tenantId)

  if (!tenant) {
    return NextResponse.json(
      { error: "Tenant not found for this account." },
      { status: 404 },
    )
  }

  const response = NextResponse.json({
    dashboardUrl: null,
    success: true,
    tenant,
  })

  response.cookies.set(ACTIVE_TENANT_COOKIE, tenant.slug, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })

  return response
}
