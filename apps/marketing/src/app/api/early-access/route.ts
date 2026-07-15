import { NextResponse } from "next/server"

import { LeadCaptureType, prisma } from "@ewatrade/db"
import { enqueueMarketingLeadNotification } from "@ewatrade/jobs"

import {
  EARLY_ACCESS_ONBOARDING_KIND,
  buildEarlyAccessSignupUrl,
  generateEarlyAccessToken,
  getEarlyAccessExpiresAt,
} from "@/lib/early-access-onboarding"
import { earlyAccessSchema, toLeadCapturePayload } from "@/lib/lead-capture"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const result = earlyAccessSchema.safeParse(body)

  if (!result.success) {
    return NextResponse.json(
      { message: "Please complete the form with valid details." },
      { status: 400 },
    )
  }

  const requestedAt = new Date()
  const accessToken = generateEarlyAccessToken()
  const accessUrl = buildEarlyAccessSignupUrl({
    requestUrl: request.url,
    token: accessToken,
  })
  const expiresAt = getEarlyAccessExpiresAt(requestedAt)
  const { lead } = await prisma.$transaction(async (tx) => {
    const lead = await tx.leadCapture.create({
      data: toLeadCapturePayload(LeadCaptureType.EARLY_ACCESS, result.data),
    })

    await tx.onboardingSession.create({
      data: {
        expiresAt,
        formData: {
          accessUrl,
          companyName: lead.companyName,
          email: lead.email,
          fullName: lead.fullName,
          kind: EARLY_ACCESS_ONBOARDING_KIND,
          leadId: lead.id,
          phone: lead.phone,
          requestedAt: requestedAt.toISOString(),
          roleTitle: lead.roleTitle,
        },
        token: accessToken,
      },
    })

    return { lead }
  })

  await enqueueMarketingLeadNotification({
    accessExpiresAt: expiresAt.toISOString(),
    accessUrl,
    companyName: lead.companyName,
    email: lead.email,
    fullName: lead.fullName,
    id: lead.id,
    message: lead.message,
    phone: lead.phone,
    roleTitle: lead.roleTitle,
    type: lead.type,
  })

  return NextResponse.json({
    message:
      "Your early access request has been received. Check your email for your secure signup link.",
  })
}
