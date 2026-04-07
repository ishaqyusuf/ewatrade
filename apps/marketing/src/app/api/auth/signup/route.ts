import { signupPayloadSchema } from "@/lib/signup-schemas"
import { prisma } from "@ewatrade/db"
import {
  buildCustomTenantHostname,
  buildInternalTenantHostname,
  provisionTenantVercelDomains,
} from "@ewatrade/utils"
import bcrypt from "bcryptjs"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const PLATFORM_DOMAIN =
  process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com"
const IS_DEV = process.env.NODE_ENV === "development"

// ─── Dev email builder ────────────────────────────────────────────────────────

function buildWelcomeEmailHtml(params: {
  firstName: string
  email: string
  businessName: string
  tenantSlug: string
  dashboardUrl: string
}) {
  const { firstName, email, businessName, tenantSlug, dashboardUrl } = params

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to ewatrade</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9f7f4; margin: 0; padding: 40px 16px; color: #1a1a1a; }
    .card { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 20px; border: 1px solid #e5e7eb; padding: 40px; box-shadow: 0 8px 32px rgba(0,0,0,0.06); }
    .logo { font-size: 20px; font-weight: 700; color: #1a1a1a; margin-bottom: 32px; }
    h1 { font-size: 26px; font-weight: 700; margin: 0 0 12px; line-height: 1.2; }
    p { color: #555; line-height: 1.6; margin: 0 0 16px; }
    .badge { display: inline-block; background: #eef2ff; color: #4f46e5; border-radius: 999px; padding: 4px 12px; font-size: 12px; font-weight: 600; margin-bottom: 24px; }
    .domain-list { background: #f9f9fb; border-radius: 12px; padding: 16px; margin: 20px 0; }
    .domain-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #eee; }
    .domain-row:last-child { border-bottom: none; }
    .domain-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #888; width: 80px; }
    .domain-value { font-family: monospace; font-size: 13px; color: #1a1a1a; }
    .cta { display: inline-block; background: #4f46e5; color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 999px; font-weight: 600; font-size: 14px; margin: 24px 0; }
    .footer { margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #aaa; }
    .dev-banner { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px; font-size: 12px; color: #92400e; }
  </style>
</head>
<body>
  <div class="card">
    ${IS_DEV ? `<div class="dev-banner">⚠️ <strong>DEV MODE</strong> — This email was not actually sent. Recipient: <strong>${email}</strong></div>` : ""}

    <div class="logo">ewatrade</div>

    <span class="badge">Welcome aboard</span>

    <h1>Your workspace is ready, ${firstName}.</h1>

    <p>
      <strong>${businessName}</strong> has been created on ewatrade. You can now access your
      merchant workspace, set up your storefront, and start taking orders.
    </p>

    <div class="domain-list">
      <div class="domain-row">
        <span class="domain-label">Storefront</span>
        <span class="domain-value">${tenantSlug}.${PLATFORM_DOMAIN}</span>
      </div>
      <div class="domain-row">
        <span class="domain-label">POS</span>
        <span class="domain-value">${tenantSlug}-pos.${PLATFORM_DOMAIN}</span>
      </div>
      <div class="domain-row">
        <span class="domain-label">Dashboard</span>
        <span class="domain-value">${tenantSlug}-dashboard.${PLATFORM_DOMAIN}</span>
      </div>
    </div>

    <p>To activate your account, verify your email address:</p>

    <a href="${dashboardUrl}" class="cta">Go to your dashboard →</a>

    <p style="font-size: 13px; color: #999;">
      If you did not create this account, you can safely ignore this email.
    </p>

    <div class="footer">
      &copy; ${new Date().getFullYear()} ewatrade · Multi-tenant commerce for African merchants
    </div>
  </div>
</body>
</html>`
}

// ─── Signup route ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── 0. Feature flag guard ────────────────────────────────────────────────
  if (process.env.NEXT_PUBLIC_SIGNUP_ENABLED !== "true") {
    return NextResponse.json(
      { message: "Signup is not currently available." },
      { status: 403 },
    )
  }

  // ── 1. Parse + validate payload ──────────────────────────────────────────
  const body = await request.json().catch(() => null)
  const result = signupPayloadSchema.safeParse(body)

  if (!result.success) {
    const firstError = result.error.issues[0]
    return NextResponse.json(
      { message: firstError?.message ?? "Invalid request data." },
      { status: 400 },
    )
  }

  const {
    modes,
    subdomain,
    customDomain,
    businessName,
    industry,
    businessSize,
    countryCode,
    phone,
    firstName,
    lastName,
    email,
    password,
  } = result.data

  // ── 2. Check existing email / slug ───────────────────────────────────────
  const [existingUser, existingTenant] = await Promise.all([
    prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    }),
    prisma.tenant.findUnique({
      where: { slug: subdomain },
      select: { id: true },
    }),
  ])

  if (existingUser) {
    return NextResponse.json(
      { message: "An account with this email address already exists." },
      { status: 409 },
    )
  }

  if (existingTenant) {
    return NextResponse.json(
      { message: "That subdomain is already taken. Please choose another." },
      { status: 409 },
    )
  }

  // ── 3. Hash password ─────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(password, 12)

  // ── 4. Determine primary tenant type ────────────────────────────────────
  const primaryType =
    modes.includes("DISPATCH") && modes.length === 1
      ? ("DISPATCH" as const)
      : ("MERCHANT" as const)

  // ── 5. Build hostnames ───────────────────────────────────────────────────
  const storefrontHostname = buildInternalTenantHostname({
    tenantSlug: subdomain,
    surface: "storefront",
    platformDomain: PLATFORM_DOMAIN,
  })
  const posHostname = buildInternalTenantHostname({
    tenantSlug: subdomain,
    surface: "pos",
    platformDomain: PLATFORM_DOMAIN,
  })
  const dashboardHostname = buildInternalTenantHostname({
    tenantSlug: subdomain,
    surface: "dashboard",
    platformDomain: PLATFORM_DOMAIN,
  })
  const dashboardUrl = `https://${dashboardHostname}`

  // ── 6. Transactional DB writes ───────────────────────────────────────────
  const { user, tenant, session } = await prisma.$transaction(async (tx) => {
    // Create user
    const user = await tx.user.create({
      data: {
        email: email.toLowerCase(),
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`.trim(),
        phone: phone.replace(/\s+/g, ""),
      },
    })

    // Create credentials account
    await tx.account.create({
      data: {
        userId: user.id,
        provider: "credentials",
        providerAccountId: email.toLowerCase(),
        passwordHash,
      },
    })

    // Create tenant
    // biome-ignore lint/suspicious/noExplicitAny: enabledModes added in migration; Prisma client not regenerated yet
    const tenant = await (
      tx.tenant.create as unknown as (
        args: unknown,
      ) => Promise<{ id: string; slug: string }>
    )({
      data: {
        slug: subdomain,
        name: businessName,
        type: primaryType,
        enabledModes: modes,
        countryCode,
        currencyCode: countryCode === "NG" ? "NGN" : "USD",
        metadata: { industry, businessSize },
      },
    })

    // Create all three internal hostname records
    await tx.tenantHostname.createMany({
      data: [
        {
          tenantId: tenant.id,
          surface: "STOREFRONT",
          hostname: storefrontHostname,
          isPrimary: true,
          isCustom: false,
        },
        {
          tenantId: tenant.id,
          surface: "POS",
          hostname: posHostname,
          isPrimary: true,
          isCustom: false,
        },
        {
          tenantId: tenant.id,
          surface: "DASHBOARD",
          hostname: dashboardHostname,
          isPrimary: true,
          isCustom: false,
        },
      ],
    })

    // If custom domain provided, also create custom hostname records
    if (customDomain && customDomain.trim().length > 0) {
      const cleanCustom = customDomain.trim().toLowerCase()
      await tx.tenantHostname.createMany({
        data: [
          {
            tenantId: tenant.id,
            surface: "STOREFRONT",
            hostname: buildCustomTenantHostname({
              customDomain: cleanCustom,
              surface: "storefront",
            }),
            isPrimary: false,
            isCustom: true,
          },
          {
            tenantId: tenant.id,
            surface: "POS",
            hostname: buildCustomTenantHostname({
              customDomain: cleanCustom,
              surface: "pos",
            }),
            isPrimary: false,
            isCustom: true,
          },
          {
            tenantId: tenant.id,
            surface: "DASHBOARD",
            hostname: buildCustomTenantHostname({
              customDomain: cleanCustom,
              surface: "dashboard",
            }),
            isPrimary: false,
            isCustom: true,
          },
        ],
      })
    }

    // Create owner membership
    await tx.membership.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        role: "OWNER",
        status: "ACTIVE",
        acceptedAt: new Date(),
      },
    })

    // Create session (30 days)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const session = await tx.session.create({
      data: {
        userId: user.id,
        token: crypto.randomUUID(),
        expiresAt,
        ipAddress:
          request.headers.get("x-forwarded-for") ??
          request.headers.get("x-real-ip") ??
          null,
        userAgent: request.headers.get("user-agent") ?? null,
      },
    })

    return { user, tenant, session }
  })

  // ── 7. Vercel domain provisioning (fire-and-forget) ──────────────────────
  if (process.env.VERCEL_API_TOKEN) {
    void provisionTenantVercelDomains({
      storefrontDomain: storefrontHostname,
      posDomain: posHostname,
      dashboardDomain: dashboardHostname,
    })
  }

  // ── 8. Build email HTML ──────────────────────────────────────────────────
  const emailHtml = buildWelcomeEmailHtml({
    firstName,
    email: email.toLowerCase(),
    businessName,
    tenantSlug: subdomain,
    dashboardUrl,
  })

  if (IS_DEV) {
    console.info(`\n[signup] Welcome email for ${email}:\n${dashboardUrl}\n`)
  }

  // ── 9. Set session cookie + return ───────────────────────────────────────
  const response = NextResponse.json({
    success: true,
    tenantSlug: tenant.slug,
    dashboardUrl,
    ...(IS_DEV ? { devEmailHtml: emailHtml } : {}),
  })

  response.cookies.set("ewt-session", session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  })

  return response
}
