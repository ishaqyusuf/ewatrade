import { resolveDashboardUrl } from "@/lib/dashboard-url"
import { signupPayloadSchema } from "@/lib/signup-schemas"
import { auth } from "@ewatrade/auth"
import { prisma } from "@ewatrade/db"
import {
  createEmailMessage,
  createTestRoutedEmailMessages,
  dispatchEmailMessages,
  getTestEmailRouting,
} from "@ewatrade/email"
import {
  buildCustomTenantHostname,
  buildInternalTenantHostname,
  provisionTenantVercelDomains,
} from "@ewatrade/utils"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { parseEarlyAccessOnboardingFormData } from "@/lib/early-access-onboarding"

const PLATFORM_DOMAIN =
  process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com"
const IS_DEV = process.env.NODE_ENV === "development"

function getEmailFromAddress() {
  return process.env.EMAIL_FROM?.trim() || "Ewatrade <noreply@ewatrade.com>"
}

function getEmailReplyToAddress() {
  return process.env.EMAIL_REPLY_TO?.trim() || undefined
}

// ─── Dev email builder ────────────────────────────────────────────────────────

function buildWelcomeEmailHtml(params: {
  firstName: string
  email: string
  deliveryEmail: string
  businessName: string
  dashboardHostname: string
  dashboardUrl: string
  posHostname: string
  storefrontHostname: string
}) {
  const {
    firstName,
    email,
    deliveryEmail,
    businessName,
    dashboardHostname,
    dashboardUrl,
    posHostname,
    storefrontHostname,
  } = params

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
    ${IS_DEV ? `<div class="dev-banner"><strong>DEV MODE</strong> - Signup email for <strong>${email}</strong>. Delivery target: <strong>${deliveryEmail}</strong></div>` : ""}

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
        <span class="domain-value">${storefrontHostname}</span>
      </div>
      <div class="domain-row">
        <span class="domain-label">POS</span>
        <span class="domain-value">${posHostname}</span>
      </div>
      <div class="domain-row">
        <span class="domain-label">Dashboard</span>
        <span class="domain-value">${dashboardHostname}</span>
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

function buildWelcomeEmailText(params: {
  firstName: string
  businessName: string
  dashboardHostname: string
  dashboardUrl: string
  posHostname: string
  storefrontHostname: string
}) {
  const {
    firstName,
    businessName,
    dashboardHostname,
    dashboardUrl,
    posHostname,
    storefrontHostname,
  } = params

  return [
    `Your workspace is ready, ${firstName}.`,
    "",
    `${businessName} has been created on ewatrade.`,
    "",
    `Storefront: ${storefrontHostname}`,
    `POS: ${posHostname}`,
    `Dashboard: ${dashboardHostname}`,
    "",
    `Open your dashboard: ${dashboardUrl}`,
  ].join("\n")
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
    accessToken,
    addressLine1,
    subdomain,
    customDomain,
    businessName,
    city,
    industry,
    businessSize,
    countryCode,
    currencyCode,
    phone,
    region,
    firstName,
    lastName,
    email,
    password,
  } = result.data

  const normalizedEmail = email.toLowerCase()
  const normalizedPhone = phone.replace(/\s+/g, "")

  // ── 2. Check existing account / slug ─────────────────────────────────────
  const [existingEmailUser, existingPhoneUser, existingTenant] =
    await Promise.all([
      prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      }),
      prisma.user.findUnique({
        where: { phone: normalizedPhone },
        select: { id: true },
      }),
      prisma.tenant.findUnique({
        where: { slug: subdomain },
        select: { id: true },
      }),
    ])

  if (existingEmailUser) {
    return NextResponse.json(
      { message: "An account with this email address already exists." },
      { status: 409 },
    )
  }

  if (existingPhoneUser) {
    return NextResponse.json(
      { message: "An account with this phone number already exists." },
      { status: 409 },
    )
  }

  if (existingTenant) {
    return NextResponse.json(
      { message: "That subdomain is already taken. Please choose another." },
      { status: 409 },
    )
  }

  const displayName = `${firstName} ${lastName}`.trim()
  const accessSession = accessToken
    ? await prisma.onboardingSession.findUnique({
        where: { token: accessToken },
        select: {
          completed: true,
          expiresAt: true,
          formData: true,
          id: true,
        },
      })
    : null
  const accessSessionFormData = parseEarlyAccessOnboardingFormData(
    accessSession?.formData,
  )

  if (accessToken && (!accessSession || !accessSessionFormData)) {
    return NextResponse.json(
      { message: "This early access link is invalid." },
      { status: 404 },
    )
  }

  if (accessToken && accessSession?.completed) {
    return NextResponse.json(
      { message: "This early access link has already been used." },
      { status: 410 },
    )
  }

  if (accessToken && accessSession && accessSession.expiresAt <= new Date()) {
    return NextResponse.json(
      { message: "This early access link has expired." },
      { status: 410 },
    )
  }

  if (
    accessToken &&
    accessSessionFormData?.email.toLowerCase() !== normalizedEmail
  ) {
    return NextResponse.json(
      {
        message:
          "Use the same email address that received this early access link.",
      },
      { status: 400 },
    )
  }
  const signupEmailRouting = (() => {
    try {
      return getTestEmailRouting({ to: normalizedEmail })
    } catch (error) {
      console.error("[signup] Email safety routing is not configured", error)
      return null
    }
  })()

  if (!signupEmailRouting) {
    return NextResponse.json(
      {
        message:
          "Email delivery safety routing is not configured. Set TEST_EMAILS or TEST_EMAIL.",
      },
      { status: 503 },
    )
  }

  // ── 3. Create Better Auth user/session ──────────────────────────────────
  const signUpResult = await auth.api
    .signUpEmail({
      body: {
        email: normalizedEmail,
        password,
        name: displayName || normalizedEmail,
        firstName,
        lastName,
        displayName,
        phone: normalizedPhone,
      },
      headers: request.headers,
    })
    .catch((error: unknown) => {
      console.error("[signup] Better Auth signup failed", error)
      return null
    })

  if (!signUpResult?.user?.id) {
    return NextResponse.json(
      { message: "Unable to create your account. Please try again." },
      { status: 400 },
    )
  }

  const userId = signUpResult.user.id

  // ── 4. Build hostnames ───────────────────────────────────────────────────
  const storefrontHostname = buildInternalTenantHostname({
    localProjectSlug: subdomain,
    tenantSlug: subdomain,
    surface: "storefront",
    platformDomain: PLATFORM_DOMAIN,
  })
  const posHostname = buildInternalTenantHostname({
    localProjectSlug: subdomain,
    tenantSlug: subdomain,
    surface: "pos",
    platformDomain: PLATFORM_DOMAIN,
  })
  const dashboardUrl = resolveDashboardUrl({
    configuredUrl: process.env.NEXT_PUBLIC_DASHBOARD_URL,
    isProduction: process.env.NODE_ENV === "production",
    platformDomain: PLATFORM_DOMAIN,
  })
  const dashboardHostname = new URL(dashboardUrl).host
  const urlProtocol = process.env.NODE_ENV === "production" ? "https" : "http"
  const posUrl = `${urlProtocol}://${posHostname}`
  const storefrontUrl = `${urlProtocol}://${storefrontHostname}`

  // ── 5. Transactional DB writes ───────────────────────────────────────────
  const { tenant } = await prisma
    .$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          email: normalizedEmail,
          name: displayName || normalizedEmail,
          emailVerified: false,
          image: null,
          firstName,
          lastName,
          displayName,
          phone: normalizedPhone,
        },
        select: { id: true },
      })

      const tenant = await (
        tx.tenant.create as unknown as (
          args: unknown,
        ) => Promise<{ id: string; slug: string }>
      )({
        data: {
          slug: subdomain,
          name: businessName,
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          countryCode,
          currencyCode,
          metadata: { industry, businessSize },
        },
      })

      // The business slug belongs to public/store operations. The dashboard is
      // one shared platform surface and resolves tenant context from session.
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

      await tx.store.create({
        data: {
          addressLine1: addressLine1.trim(),
          city: city.trim(),
          countryCode,
          currencyCode,
          name: businessName,
          region: region?.trim() || null,
          slug: "main",
          status: "ACTIVE",
          supportPhone: normalizedPhone,
          tenantId: tenant.id,
        },
      })

      if (accessSession?.id && accessSessionFormData) {
        const updated = await tx.onboardingSession.updateMany({
          data: {
            completed: true,
            formData: {
              ...accessSessionFormData,
              completedAt: new Date().toISOString(),
              tenantId: tenant.id,
              tenantSlug: tenant.slug,
              userId: user.id,
            },
            step: 4,
            tenantId: tenant.id,
            userId: user.id,
          },
          where: {
            completed: false,
            expiresAt: {
              gt: new Date(),
            },
            id: accessSession.id,
          },
        })

        if (updated.count !== 1) {
          throw new Error("Early access link could not be consumed.")
        }
      }

      return { tenant }
    })
    .catch(async (error: unknown) => {
      await prisma.user.delete({ where: { id: userId } }).catch(() => null)
      throw error
    })

  // ── 6. Vercel domain provisioning (fire-and-forget) ──────────────────────
  if (process.env.VERCEL_API_TOKEN) {
    void provisionTenantVercelDomains({
      storefrontDomain: storefrontHostname,
      posDomain: posHostname,
    })
  }

  // ── 7. Build email HTML ──────────────────────────────────────────────────
  const signupEmailRecipients = signupEmailRouting.recipients.join(", ")
  const emailHtml = buildWelcomeEmailHtml({
    firstName,
    email: email.toLowerCase(),
    deliveryEmail: signupEmailRecipients,
    businessName,
    dashboardHostname,
    dashboardUrl,
    posHostname,
    storefrontHostname,
  })
  const emailText = buildWelcomeEmailText({
    firstName,
    businessName,
    dashboardHostname,
    dashboardUrl,
    posHostname,
    storefrontHostname,
  })
  const emailDeliveries = await dispatchEmailMessages(
    createTestRoutedEmailMessages(
      createEmailMessage({
        from: getEmailFromAddress(),
        html: emailHtml,
        replyTo: getEmailReplyToAddress(),
        subject: `Welcome to ewatrade - verify your ${businessName} workspace`,
        text: emailText,
        to: normalizedEmail,
      }),
    ),
  )
  const failedEmailDelivery = emailDeliveries.find(
    (delivery) => delivery.status === "failed",
  )
  const emailDeliveryStatus = failedEmailDelivery ? "failed" : "sent"

  if (IS_DEV) {
    console.info(`\n[signup] Welcome email for ${email}:\n${dashboardUrl}\n`)
  }

  if (failedEmailDelivery) {
    console.error("[signup] Welcome email delivery failed", {
      error: failedEmailDelivery.error,
      email: normalizedEmail,
      tenantSlug: tenant.slug,
    })
  }

  // ── 8. Return signup result ──────────────────────────────────────────────
  return NextResponse.json({
    success: true,
    tenantSlug: tenant.slug,
    dashboardUrl,
    posUrl,
    storefrontUrl,
    emailDeliveryStatus,
    ...(IS_DEV ? { devEmailHtml: emailHtml } : {}),
  })
}
