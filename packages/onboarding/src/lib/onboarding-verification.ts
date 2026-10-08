import { prisma } from "@ewatrade/db"
import { renderEarlyAccessVerificationTemplate } from "@ewatrade/email"
import { deliverEarlyAccessEmails } from "./early-access-email"
import {
  EARLY_ACCESS_VERIFICATION_KIND,
  type EarlyAccessOnboardingFormData,
  generateEarlyAccessRequestToken,
} from "./early-access-onboarding"
import {
  type EarlyAccessQaPreview,
  shouldPreviewEarlyAccess,
} from "./early-access-preview"
import { EarlyAccessError } from "./early-access-service"
import { getDashboardRouteUrl } from "./signup-navigation"

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000

// Emails a one-time `ear_` link that marks the setup session's email verified.
// Shared by direct signup and the resend action on the signup screens.
export async function issueOnboardingVerification(
  session: { expiresAt: Date; token: string },
  data: EarlyAccessOnboardingFormData,
): Promise<{ message: string; qaPreview?: EarlyAccessQaPreview }> {
  const url = new URL(getDashboardRouteUrl("/api/early-access/verify"))
  const token = generateEarlyAccessRequestToken()
  url.searchParams.set("token", token)
  const expiresAt = new Date(
    Math.min(Date.now() + VERIFICATION_TTL_MS, session.expiresAt.getTime()),
  )
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`signup-verification:${session.token}`}, 0))`
      const recent = await tx.onboardingSession.count({
        where: {
          createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
          AND: [
            {
              formData: {
                path: ["kind"],
                equals: EARLY_ACCESS_VERIFICATION_KIND,
              },
            },
            { formData: { path: ["accessToken"], equals: session.token } },
          ],
        },
      })
      if (recent >= 3)
        throw new EarlyAccessError(
          "Too many verification emails. Wait an hour, then try again.",
          429,
        )
      await tx.onboardingSession.create({
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
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
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
    return {
      message:
        "The verification email was sent to your tester inbox. You can also verify your QA address below.",
      qaPreview: {
        accessUrl: url.toString(),
        emailHtml: rendered.html,
        expiresAt: expiresAt.toISOString(),
        stage: "verification",
        emailSent: true,
      },
    }
  return {
    message:
      "Check your email for the verification link. It expires after 24 hours.",
  }
}
