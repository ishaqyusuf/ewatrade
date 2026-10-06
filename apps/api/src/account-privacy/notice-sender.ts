import type { PrismaClient } from "@ewatrade/db"
import {
  AccountPrivacyNoticePreparationError,
  accountPrivacyNoticeContentDigest,
  claimAccountPrivacyNoticeSend,
  markAccountPrivacyNoticeSendUncertain,
  prepareAccountPrivacyNotice,
  recordAccountPrivacyNoticeSendReceipt,
} from "@ewatrade/db/queries"
import {
  renderAccountPrivacyOutcomeTemplate,
  resendEmailTransport,
} from "@ewatrade/email"

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
  const content = renderAccountPrivacyOutcomeTemplate(input)
  // The operator must review/approve the exact Warm Desk output. Never send
  // arbitrary HTML or hash the old body while sending a different wrapper.
  if (input.html !== content.html)
    throw new AccountPrivacyNoticePreparationError("POLICY_NOT_APPROVED")
  const contentDigest = accountPrivacyNoticeContentDigest({
    from,
    replyTo,
    subject: input.subject,
    text: content.text,
    html: content.html,
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
        text: content.text,
        html: content.html,
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
