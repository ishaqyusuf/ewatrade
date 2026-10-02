import { deliverEarlyAccessEmails } from "@/lib/early-access-email"
import {
  EARLY_ACCESS_VERIFICATION_KIND,
  generateEarlyAccessRequestToken,
  getEarlyAccessOrigin,
} from "@/lib/early-access-onboarding"
import { shouldPreviewEarlyAccess } from "@/lib/early-access-preview"
import {
  earlyAccessFailure,
  earlyAccessHeaders,
} from "@/lib/early-access-response"
import { requireApprovedSession } from "@/lib/early-access-service"
import { blockMarketingIntakeInPreview } from "@/lib/preview-intake-guard"
import { getQaWebRequestOrigin } from "@/lib/qa-request-origin"
import { prisma } from "@ewatrade/db"
import { renderEarlyAccessVerificationTemplate } from "@ewatrade/email"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

export async function POST(request: NextRequest) {
  const previewBlock = blockMarketingIntakeInPreview()
  if (previewBlock) return previewBlock
  const body = z
    .object({ accessToken: z.string().min(1).max(200) })
    .safeParse(await request.json().catch(() => null))
  if (!body.success)
    return NextResponse.json(
      { message: "An approved setup link is required." },
      { status: 400, headers: earlyAccessHeaders },
    )
  try {
    const { session, data } = await requireApprovedSession(
      body.data.accessToken,
    )
    if (data.emailVerifiedAt)
      return NextResponse.json(
        { message: "Your email is already verified." },
        { headers: earlyAccessHeaders },
      )
    const url = new URL(
      "/api/early-access/verify",
      getEarlyAccessOrigin(getQaWebRequestOrigin(request)),
    )
    const token = generateEarlyAccessRequestToken()
    url.searchParams.set("token", token)
    const expiresAt = new Date(
      Math.min(Date.now() + 24 * 60 * 60 * 1000, session.expiresAt.getTime()),
    )
    await prisma.onboardingSession.create({
      data: {
        token,
        expiresAt,
        formData: {
          kind: EARLY_ACCESS_VERIFICATION_KIND,
          accessToken: session.token,
          email: data.email,
        },
      },
    })
    const rendered = renderEarlyAccessVerificationTemplate({
      fullName: data.fullName,
      email: data.email,
      verificationUrl: url.toString(),
      expiresAt: expiresAt.toISOString(),
    })
    await deliverEarlyAccessEmails(
      data.leadId,
      [
        {
          from: process.env.EMAIL_FROM ?? "noreply@ewatrade.local",
          to: data.email,
          replyTo: process.env.EMAIL_REPLY_TO,
          subject: "Verify your email to set up EwaTrade",
          ...rendered,
        },
      ],
      "verification",
    )
    if (shouldPreviewEarlyAccess({ email: data.email }))
      return NextResponse.json(
        {
          message:
            "The verification email was sent to your tester inbox. You can also verify your QA address below.",
          qaPreview: {
            accessUrl: url.toString(),
            emailHtml: rendered.html,
            expiresAt: expiresAt.toISOString(),
            stage: "verification",
            emailSent: true,
          },
        },
        { headers: earlyAccessHeaders },
      )
    return NextResponse.json(
      {
        message:
          "Check your email for the verification link. It expires after 24 hours or when your setup link expires.",
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
