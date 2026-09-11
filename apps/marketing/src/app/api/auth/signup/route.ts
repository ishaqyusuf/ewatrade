import { resolveDashboardUrl } from "@/lib/dashboard-url"
import { signupPayloadSchema } from "@/lib/signup-schemas"
import { auth } from "@ewatrade/auth"
import { prisma } from "@ewatrade/db"
import {
  createEmailMessage,
  createTestRoutedEmailMessages,
  dispatchEmailMessages,
  getTestEmailRouting,
  renderWorkspaceWelcomeTemplate,
} from "@ewatrade/email"
import {
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
  businessName: string
  dashboardHostname: string
  dashboardUrl: string
  posHostname: string
  storefrontHostname: string
}) {
  return renderWorkspaceWelcomeTemplate(params).html
}

function buildWelcomeEmailText(params: {
  firstName: string
  businessName: string
  dashboardHostname: string
  dashboardUrl: string
  posHostname: string
  storefrontHostname: string
}) {
  return renderWorkspaceWelcomeTemplate(params).text
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
    businessProfileKey,
    businessProfileVersion,
    businessName,
    city,
    businessSize,
    countryCode,
    currencyCode,
    phone,
    region,
    firstName,
    lastName,
    email,
    password,
    operatingModel,
    orderChannels,
    otherBusinessDescription,
  } = result.data

  const normalizedEmail = email.toLowerCase()
  const normalizedPhone = phone.replace(/\s+/g, "")
  const onboardingSnapshot = {
    businessProfileKey,
    businessProfileVersion,
    capturedAt: new Date().toISOString(),
    countryCode,
    currencyCode,
    operatingModel,
    orderChannels,
    ...(otherBusinessDescription?.trim()
      ? { otherBusinessDescription: otherBusinessDescription.trim() }
      : {}),
    source: "marketing_signup",
    teamSize: businessSize,
  }

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
          metadata: { businessSize },
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
          metadata: {
            retailOps: {
              onboarding: onboardingSnapshot,
            },
          },
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
              onboarding: onboardingSnapshot,
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
  const emailHtml = buildWelcomeEmailHtml({
    firstName,
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
