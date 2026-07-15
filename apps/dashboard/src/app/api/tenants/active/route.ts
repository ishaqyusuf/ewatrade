import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import {
  buildInternalTenantHostname,
  resolveTenantDomain,
} from "@ewatrade/utils"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod/v4"

const ACTIVE_TENANT_COOKIE = "ewatrade.active_tenant_slug"
const PLATFORM_DOMAIN =
  process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ??
  process.env.PLATFORM_DOMAIN ??
  "ewatrade.com"

const activeTenantSchema = z.object({
  path: z.string().startsWith("/").default("/"),
  tenantId: z.string().min(1),
})

function getDashboardUrl(
  request: NextRequest,
  tenantSlug: string,
  path: string,
) {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? ""
  const protocol =
    request.headers.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https")
  const result = resolveTenantDomain(host, {
    platformDomain: PLATFORM_DOMAIN,
  })

  if (result.isLocalhost) {
    return null
  }

  const hostname = buildInternalTenantHostname({
    platformDomain: PLATFORM_DOMAIN,
    surface: "dashboard",
    tenantSlug,
  })

  return `${protocol}://${hostname}${path}`
}

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
    dashboardUrl: getDashboardUrl(request, tenant.slug, parsed.data.path),
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
