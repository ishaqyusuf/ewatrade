import { staffOnboardingAuth } from "@/lib/staff-onboarding-auth"
import { getStaffWebInvitation } from "@/lib/staff-web-invitation"
import { prisma } from "@ewatrade/db"
import {
  completeRetailOpsStaffOnboarding,
  declareCustomerAccountAgeBand,
} from "@ewatrade/db/staff-onboarding"
import {
  assertLegalVersionHash,
  resolveLegalSignupChoice,
} from "@ewatrade/utils/legal-approval"
import { isQaStaffInvitation } from "@ewatrade/utils/staff-invitation-links"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod/v4"

const schema = z
  .object({
    operation: z.enum(["request-code", "complete"]),
    inviteToken: z.string().min(20).max(300),
    code: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    name: z.string().trim().min(1).max(120).optional(),
    password: z.string().min(8).max(128).optional(),
    confirmPassword: z.string().min(8).max(128).optional(),
    ageBand: z.enum(["AGE_13_TO_15", "AGE_16_TO_17", "ADULT"]).optional(),
    legalVersion: z.string().optional(),
    acceptedTerms: z.literal(true).optional(),
    acknowledgedPrivacyNotice: z.literal(true).optional(),
  })
  .strict()

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  })
}

export async function POST(request: NextRequest) {
  const dashboardOrigin = new URL(
    process.env.DASHBOARD_URL ??
      process.env.NEXT_PUBLIC_DASHBOARD_URL ??
      request.nextUrl.origin,
  ).origin
  if (request.headers.get("origin") !== dashboardOrigin)
    return response(
      { error: "This request must come from the onboarding page." },
      403,
    )
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    return response({ error: "Check your onboarding details." }, 400)
  try {
    const input = parsed.data
    const invite = await getStaffWebInvitation(input.inviteToken)
    const qaInvitation = isQaStaffInvitation(invite.email, process.env)
    if (input.operation === "request-code") {
      if (qaInvitation) return response({ qaReady: true })
      await staffOnboardingAuth.api.sendVerificationOTP({
        body: { email: invite.email, type: "sign-in" },
        headers: request.headers,
      })
      return response({ sent: true })
    }
    if (!input.name || (!qaInvitation && !input.code))
      return response({ error: "Enter your name and verification code." }, 400)
    if (
      invite.needsPassword &&
      (!input.password || input.password !== input.confirmPassword)
    )
      return response(
        {
          error: "Create a password and enter the same password to confirm it.",
        },
        400,
      )
    if (!qaInvitation && input.code)
      await staffOnboardingAuth.api.checkVerificationOTP({
        body: { email: invite.email, type: "sign-in", otp: input.code },
        headers: request.headers,
      })
    const publication = resolveLegalSignupChoice(input)
    if (publication) {
      const existing = await prisma.legalAcceptance.findUnique({
        where: {
          userId_version: {
            userId: invite.user.id,
            version: publication.version,
          },
        },
      })
      assertLegalVersionHash(existing?.documentHash, publication.documentHash)
      if (!existing)
        await prisma.legalAcceptance.create({
          data: {
            userId: invite.user.id,
            version: publication.version,
            documentHash: publication.documentHash,
            surface: "web",
          },
        })
    }
    if (invite.user.ageBand === "UNDECLARED") {
      if (!input.ageBand)
        return response({ error: "Choose your age range." }, 400)
      await declareCustomerAccountAgeBand(prisma, invite.user.id, input.ageBand)
    }
    const code = qaInvitation
      ? await staffOnboardingAuth.api.createVerificationOTP({
          body: { email: invite.email, type: "sign-in" },
        })
      : input.code
    if (!code) return response({ error: "Enter your verification code." }, 400)
    const result = await staffOnboardingAuth.api.signInEmailOTP({
      body: { email: invite.email, otp: code },
      headers: request.headers,
      returnHeaders: true,
    })
    if (result.response.user.id !== invite.user.id)
      return response(
        { error: "This code does not match the invitation." },
        403,
      )
    if (invite.needsPassword && input.password) {
      const passwordHeaders = new Headers(request.headers)
      passwordHeaders.set(
        "cookie",
        result.headers
          .getSetCookie()
          .map((cookie) => cookie.split(";")[0])
          .join("; "),
      )
      await staffOnboardingAuth.api.setPassword({
        body: { newPassword: input.password },
        headers: passwordHeaders,
      })
    }
    await completeRetailOpsStaffOnboarding(prisma, {
      userId: invite.user.id,
      tenantSlug: invite.tenant.slug,
      inviteToken: input.inviteToken,
      name: input.name,
    })
    const success = response({ dashboardUrl: "/" })
    success.cookies.set("ewatrade.active_tenant_slug", invite.tenant.slug, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(dashboardOrigin).protocol === "https:",
      path: "/",
    })
    for (const cookie of result.headers.getSetCookie())
      success.headers.append("Set-Cookie", cookie)
    return success
  } catch (error) {
    return response(
      {
        error:
          error instanceof Error
            ? error.message
            : "Staff setup could not be completed. Try again.",
      },
      400,
    )
  }
}
