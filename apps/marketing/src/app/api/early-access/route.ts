import {
  deliverEarlyAccessEmails,
  earlyAccessRequestConfirmationEmail,
  earlyAccessRequestEmails,
} from "@/lib/early-access-email"
import {
  EARLY_ACCESS_REQUEST_KIND,
  buildEarlyAccessApprovalUrl,
  generateEarlyAccessRequestToken,
  getEarlyAccessRequestExpiresAt,
} from "@/lib/early-access-onboarding"
import { shouldPreviewEarlyAccess } from "@/lib/early-access-preview"
import {
  earlyAccessFailure,
  earlyAccessHeaders,
} from "@/lib/early-access-response"
import { earlyAccessSchema, toLeadCapturePayload } from "@/lib/lead-capture"
import { blockMarketingIntakeInPreview } from "@/lib/preview-intake-guard"
import { getQaWebRequestOrigin } from "@/lib/qa-request-origin"
import { LeadCaptureType, prisma } from "@ewatrade/db"
import { renderMarketingEarlyAccessAdminTemplate } from "@ewatrade/email"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const previewBlock = blockMarketingIntakeInPreview()
  if (previewBlock) return previewBlock
  const result = earlyAccessSchema.safeParse(
    await request.json().catch(() => null),
  )
  if (!result.success)
    return NextResponse.json(
      {
        message:
          "Please complete the form with valid details and select at least one setup need.",
      },
      { status: 400, headers: earlyAccessHeaders },
    )
  try {
    const requestedAt = new Date()
    const token = generateEarlyAccessRequestToken()
    const qa = shouldPreviewEarlyAccess({ email: result.data.email })
    const approvalUrl = buildEarlyAccessApprovalUrl({
      requestUrl: getQaWebRequestOrigin(request),
      token,
      continueToSetup: qa,
    })
    const expiresAt = getEarlyAccessRequestExpiresAt(requestedAt)
    const lead = await prisma.$transaction(
      async (tx) => {
        const lead = await tx.leadCapture.create({
          data: {
            ...toLeadCapturePayload(LeadCaptureType.EARLY_ACCESS, result.data),
            metadata: {
              intake: {
                businessSize: result.data.businessSize,
                launchTimeline: result.data.launchTimeline,
                recordSystem: result.data.recordSystem,
                setupNeeds: result.data.setupNeeds,
              },
              ...(qa
                ? {
                    qaEmailPreview: {
                      deliveryMode: "inline_and_email",
                      notificationEnqueued: false,
                      recordedAt: requestedAt.toISOString(),
                    },
                  }
                : {}),
            },
          },
        })
        await tx.onboardingSession.create({
          data: {
            expiresAt,
            token,
            formData: {
              kind: EARLY_ACCESS_REQUEST_KIND,
              leadId: lead.id,
              requestedAt: requestedAt.toISOString(),
            },
          },
        })
        return lead
      },
      { maxWait: 10_000, timeout: 30_000 },
    )
    const emailInput = {
      ...lead,
      approvalUrl,
      accessExpiresAt: expiresAt.toISOString(),
      businessSize: result.data.businessSize,
      recordSystem: result.data.recordSystem,
      launchTimeline: result.data.launchTimeline,
      setupNeeds: result.data.setupNeeds,
    }
    await deliverEarlyAccessEmails(
      lead.id,
      earlyAccessRequestEmails(emailInput, qa ? lead.email : undefined),
      "request",
    )
    await deliverEarlyAccessEmails(
      lead.id,
      [earlyAccessRequestConfirmationEmail(lead)],
      "requestConfirmation",
    )
    if (qa)
      return NextResponse.json(
        {
          message:
            "Your QA request has been saved and emailed to your tester inbox. Approve it below or from the email.",
          qaPreview: {
            accessUrl: approvalUrl,
            emailHtml: renderMarketingEarlyAccessAdminTemplate(emailInput).html,
            expiresAt: expiresAt.toISOString(),
            stage: "approval",
            emailSent: true,
          },
        },
        { headers: earlyAccessHeaders },
      )
    return NextResponse.json(
      {
        message:
          "Your early access request has been received. We will review your business details and email you after approval.",
      },
      { headers: earlyAccessHeaders },
    )
  } catch (error) {
    const failure = earlyAccessFailure(error)
    return NextResponse.json(
      { message: failure.message },
      { status: failure.status, headers: earlyAccessHeaders },
    )
  }
}
