import type { PrismaClient } from "@ewatrade/db"
import {
  AccountPrivacyNoticePreparationError,
  accountPrivacyNoticeContentDigest,
  claimAccountPrivacyNoticeSend,
  markAccountPrivacyNoticeSendUncertain,
  prepareAccountPrivacyNotice,
  recordAccountPrivacyNoticeSendReceipt,
} from "@ewatrade/db/queries"
import { resendEmailTransport } from "@ewatrade/email"

export async function sendAccountPrivacyOutcomeNotice(
  db: PrismaClient,
  input: {
    requestId: string
    operatorUserId: string
    subject: string
    text: string
    html: string
  },
  dependencies: {
    transport?: typeof resendEmailTransport
  } = {},
) {
  const from = process.env.EMAIL_FROM?.trim()
  const replyTo = process.env.EMAIL_REPLY_TO?.trim()
  if (
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED !== "true" ||
    process.env.ACCOUNT_PRIVACY_NOTICE_SENDING_ENABLED !== "true" ||
    process.env.ACCOUNT_PRIVACY_NOTICE_WEBHOOK_ENABLED !== "true" ||
    !process.env.RESEND_API_KEY?.trim() ||
    !process.env.ACCOUNT_PRIVACY_RESEND_WEBHOOK_SECRET?.trim() ||
    !from ||
    !replyTo
  )
    throw new AccountPrivacyNoticePreparationError("DISABLED")
  const contentDigest = accountPrivacyNoticeContentDigest({
    from,
    replyTo,
    subject: input.subject,
    text: input.text,
    html: input.html,
  })
  const prepared = await prepareAccountPrivacyNotice(db, {
    requestId: input.requestId,
    operatorUserId: input.operatorUserId,
    contentDigest,
  })
  const claim = await claimAccountPrivacyNoticeSend(db, {
    attemptId: prepared.attemptId,
    operatorUserId: input.operatorUserId,
    contentDigest,
  })
  try {
    const receipt = await (dependencies.transport ?? resendEmailTransport).send(
      {
        from,
        replyTo,
        to: claim.recipient,
        subject: input.subject,
        text: input.text,
        html: input.html,
        idempotencyKey: claim.idempotencyKey,
        tags: [
          { name: "category", value: "account_privacy_outcome_notice" },
          { name: "notice_attempt", value: claim.attemptId },
        ],
      },
    )
    if (receipt?.provider !== "resend" || !receipt.providerMessageId?.trim())
      throw new Error("Provider acceptance is unconfirmed")
    return await recordAccountPrivacyNoticeSendReceipt(db, {
      attemptId: claim.attemptId,
      providerMessageId: receipt.providerMessageId,
    })
  } catch {
    await markAccountPrivacyNoticeSendUncertain(db, claim.attemptId).catch(
      () => undefined,
    )
    return { attemptId: claim.attemptId, status: "UNCERTAIN" as const }
  }
}
