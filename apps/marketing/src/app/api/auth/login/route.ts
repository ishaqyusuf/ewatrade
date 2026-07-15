import { auth } from "@ewatrade/auth"
import { prisma } from "@ewatrade/db"
import { buildInternalTenantHostname } from "@ewatrade/utils"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod/v4"

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

const PLATFORM_DOMAIN =
  process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com"
const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? `https://${PLATFORM_DOMAIN}`

function buildDashboardUrl(tenantSlug: string): string {
  const hostname = buildInternalTenantHostname({
    localProjectSlug: tenantSlug,
    tenantSlug,
    surface: "dashboard",
    platformDomain: PLATFORM_DOMAIN,
  })
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http"
  return `${protocol}://${hostname}`
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 400 },
    )
  }

  const { email, password } = parsed.data
  const normalizedEmail = email.toLowerCase()

  const result = await auth.api
    .signInEmail({
      body: {
        email: normalizedEmail,
        password,
      },
      headers: request.headers,
    })
    .catch(() => null)

  if (!result?.user?.id) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    )
  }

  const membership = await prisma.membership.findFirst({
    where: {
      userId: result.user.id,
      status: "ACTIVE",
    },
    orderBy: { createdAt: "asc" },
    select: {
      tenant: {
        select: {
          slug: true,
        },
      },
    },
  })

  const tenantSlug = membership?.tenant.slug
  const dashboardUrl = tenantSlug
    ? buildDashboardUrl(tenantSlug)
    : `${MARKETING_URL}/login?error=no_tenant`

  return NextResponse.json({ success: true, dashboardUrl })
}
