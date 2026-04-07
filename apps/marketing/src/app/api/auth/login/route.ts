import { prisma } from "@ewatrade/db"
import { buildInternalTenantHostname } from "@ewatrade/utils"
import bcrypt from "bcryptjs"
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

  // Look up account credentials
  const account = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "credentials",
        providerAccountId: email.toLowerCase(),
      },
    },
    select: {
      passwordHash: true,
      userId: true,
    },
  })

  if (!account || !account.passwordHash) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    )
  }

  const valid = await bcrypt.compare(password, account.passwordHash)
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    )
  }

  // Find the user's first active tenant membership
  const membership = await prisma.membership.findFirst({
    where: { userId: account.userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { tenant: { select: { slug: true } } },
  })

  // Create a new session (30 days)
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  const session = await prisma.session.create({
    data: {
      userId: account.userId,
      token: crypto.randomUUID(),
      expiresAt,
      ipAddress:
        request.headers.get("x-forwarded-for") ??
        request.headers.get("x-real-ip") ??
        null,
      userAgent: request.headers.get("user-agent") ?? null,
    },
    select: { token: true },
  })

  const tenantSlug = membership?.tenant.slug
  const dashboardUrl = tenantSlug
    ? buildDashboardUrl(tenantSlug)
    : `${MARKETING_URL}/login?error=no_tenant`

  const response = NextResponse.json({ success: true, dashboardUrl })

  const isDev = process.env.NODE_ENV !== "production"
  const cookieDomain = isDev ? undefined : `.${PLATFORM_DOMAIN}`

  response.cookies.set("ewt-session", session.token, {
    httpOnly: true,
    secure: !isDev,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  })

  return response
}
