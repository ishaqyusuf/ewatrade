import { type NextRequest, NextResponse } from "next/server"

import {
  EARLY_ACCESS_ONBOARDING_KIND,
  buildEarlyAccessSignupUrl,
  generateEarlyAccessToken,
  getEarlyAccessExpiresAt,
} from "@/lib/early-access-onboarding"
import { shouldPreviewEarlyAccess } from "@/lib/early-access-preview"
import { earlyAccessSchema, toLeadCapturePayload } from "@/lib/lead-capture"
import { blockMarketingIntakeInPreview } from "@/lib/preview-intake-guard"
import { getQaWebRequestOrigin } from "@/lib/qa-request-origin"
import { renderMarketingEarlyAccessConfirmationTemplate } from "@ewatrade/email"

export async function POST(request: NextRequest) {
  const previewBlock = blockMarketingIntakeInPreview()
  if (previewBlock) return previewBlock

  const body = await request.json().catch(() => null)
  const result = earlyAccessSchema.safeParse(body)

  if (!result.success) {
    return NextResponse.json(
      { message: "Please complete the form with valid details." },
      { status: 400 },
    )
  }

  const [{ LeadCaptureType, prisma }, { enqueueMarketingLeadNotification }] =
    await Promise.all([import("@ewatrade/db"), import("@ewatrade/jobs")])

  const requestedAt = new Date()
  const accessToken = generateEarlyAccessToken()
  const accessUrl = buildEarlyAccessSignupUrl({
    requestUrl: getQaWebRequestOrigin(request),
    token: accessToken,
  })
  const expiresAt = getEarlyAccessExpiresAt(requestedAt)
  const previewEmail = shouldPreviewEarlyAccess({
    email: result.data.email,
    requestUrl: getQaWebRequestOrigin(request),
  })
  const { lead } = await prisma.$transaction(async (tx) => {
    const lead = await tx.leadCapture.create({
      data: {
        ...toLeadCapturePayload(LeadCaptureType.EARLY_ACCESS, result.data),
        ...(previewEmail
          ? {
              metadata: {
                qaEmailPreview: {
                  deliveryMode: "inline",
                  notificationEnqueued: false,
                  recordedAt: requestedAt.toISOString(),
                },
              },
            }
          : {}),
      },
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

  const notification = {
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
  }

  if (previewEmail) {
    const email = renderMarketingEarlyAccessConfirmationTemplate(notification)
    return NextResponse.json(
      {
        message:
          "Your QA request has been saved. Continue setup below; no email was sent.",
        devPreview: {
          accessUrl,
          emailHtml: email.html,
          expiresAt: expiresAt.toISOString(),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  }

  await enqueueMarketingLeadNotification(notification)

  return NextResponse.json({
    message:
      "Your early access request has been received. Check your email for your secure signup link.",
  })
}
