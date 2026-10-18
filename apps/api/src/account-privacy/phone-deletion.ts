import {
  type DeletionRequestSummary,
  createExternalDeletionChallenge,
  discardUndeliveredExternalDeletionChallenge,
  isLocalPhoneAuth,
  submitExternalDeletionRequest,
} from "@ewatrade/db/queries"
import {
  createEmailMessage,
  dispatchEmailMessages,
  renderAccountDeletionVerificationTemplate,
  shouldRouteEmailToTestRecipients,
} from "@ewatrade/email"
import {
  isAccountPrivacyEmailIntakeConfigured,
  isAccountPrivacyOtpSecretConfigured,
} from "@ewatrade/utils/account-privacy-intake"
import { TRPCError } from "@trpc/server"
import type { TRPCContext } from "../trpc/init"

type DeletionContext = Pick<
  TRPCContext,
  "db" | "privacyClientIp" | "qaSessionScope"
> & {
  session: NonNullable<TRPCContext["session"]>
}

export function requireFreshDeletionSession(ctx: DeletionContext) {
  if (!ctx.session.session)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Sign in again before requesting deletion.",
    })
  if (ctx.qaSessionScope || ctx.session.session.token.startsWith("qas_"))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Use your own account session to request deletion.",
    })
  const age = Date.now() - new Date(ctx.session.session.createdAt).getTime()
  if (!Number.isFinite(age) || age < 0 || age > 15 * 60_000)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message:
        "Sign in again to verify your account before requesting deletion.",
    })
}

async function requireVerifiedPhone(ctx: DeletionContext) {
  requireFreshDeletionSession(ctx)
  const user = await ctx.db.user.findUnique({
    where: { id: ctx.session.user.id },
    select: { phone: true, phoneVerifiedAt: true },
  })
  if (!user?.phoneVerifiedAt || !user.phone)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message:
        "Sign in again with your verified phone before requesting deletion.",
    })
}

export async function requestPhoneDeletionContactCode(
  ctx: DeletionContext,
  email: string,
) {
  await requireVerifiedPhone(ctx)
  const local = isLocalPhoneAuth()
  if (
    !isAccountPrivacyOtpSecretConfigured(
      process.env.ACCOUNT_PRIVACY_OTP_SECRET,
    ) ||
    (!local && !isAccountPrivacyEmailIntakeConfigured(process.env)) ||
    (!local && !ctx.privacyClientIp)
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Account deletion verification is unavailable. Please try again later.",
    })
  if (
    email.endsWith("@phone.ewatrade.invalid") ||
    shouldRouteEmailToTestRecipients(email)
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Use an email address that can receive your verification code and deletion outcome.",
    })
  const issued = await createExternalDeletionChallenge(
    ctx.db,
    email,
    ctx.privacyClientIp ?? "local",
    {
      authenticatedPhoneSubjectId: ctx.session.user.id,
      useLocalCode: local ? true : undefined,
    },
  )
  if (!issued)
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message:
        "Wait two minutes before requesting another code. You can request up to five codes a day.",
    })
  if (!local) {
    try {
      const results = await dispatchEmailMessages([
        createEmailMessage({
          from: process.env.EMAIL_FROM ?? "",
          to: issued.email,
          subject: "Your EwaTrade account deletion request code",
          ...renderAccountDeletionVerificationTemplate({ code: issued.code }),
        }),
      ])
      if (results.some((result) => result.status === "failed"))
        throw new Error("Delivery failed")
    } catch {
      await discardUndeliveredExternalDeletionChallenge(ctx.db, issued)
      throw new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message:
          "The verification email could not be sent. Please try again later.",
      })
    }
  }
  return { sent: true, devCode: local ? issued.code : null }
}

export async function requestPhoneAccountDeletion(
  ctx: DeletionContext,
  input: { contactEmail?: string; contactCode?: string },
): Promise<DeletionRequestSummary> {
  await requireVerifiedPhone(ctx)
  if (!input.contactEmail || !input.contactCode)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Verify a contact email so we can send your deletion outcome.",
    })
  const request = await submitExternalDeletionRequest(
    ctx.db,
    input.contactEmail,
    input.contactCode,
    ctx.session.user.id,
  )
  if (!request)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "The code is invalid or expired. Request a new code and try again.",
    })
  return request
}
