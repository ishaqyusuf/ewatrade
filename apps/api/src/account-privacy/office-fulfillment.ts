import type { PrismaClient } from "@ewatrade/db"
import {
  AccountPrivacyWorkflowError,
  accountPrivacyNoticeContentDigest,
  getAccountPrivacyWorkflow,
  getApprovedAccountPrivacyExternalPolicy,
  recordAccountPrivacyExternalReview,
} from "@ewatrade/db/queries"
import { renderAccountPrivacyOutcomeTemplate } from "@ewatrade/email"
import type { z } from "zod"
import {
  officePrivacyExternalReviewSchema,
  officePrivacyNoticeContentSchema,
  officePrivacyNoticeSchema,
} from "../schemas/office-privacy"
import { sendAccountPrivacyOutcomeNotice } from "./notice-sender"

/** Server-approved content only. Browser input cannot replace the notice or destination. */
export function approvedOfficePrivacyNotice(env = process.env) {
  try {
    const input = officePrivacyNoticeContentSchema.parse(
      JSON.parse(env.ACCOUNT_PRIVACY_OUTCOME_NOTICE_JSON ?? "null"),
    )
    const from = env.EMAIL_FROM?.trim()
    const replyTo = env.EMAIL_REPLY_TO?.trim()
    if (!from || !replyTo) return null
    const content = { ...input, ...renderAccountPrivacyOutcomeTemplate(input) }
    const digest = accountPrivacyNoticeContentDigest({
      from,
      replyTo,
      ...content,
    })
    if (digest !== env.ACCOUNT_PRIVACY_APPROVED_NOTICE_CONTENT_DIGEST)
      return null
    return { ...content, digest }
  } catch {
    return null
  }
}

export async function getOfficePrivacyReview(
  db: PrismaClient,
  input: { requestId: string; operatorUserId: string },
) {
  const workflow = await getAccountPrivacyWorkflow(db, input)
  const policy = getApprovedAccountPrivacyExternalPolicy()
  const notice = approvedOfficePrivacyNotice()
  const attempt = await db.accountPrivacyNoticeAttempt.findFirst({
    where: { requestId: input.requestId },
    orderBy: { attemptNumber: "desc" },
    select: { status: true },
  })
  return {
    workflow,
    externalPolicy: policy
      ? {
          digest: policy.digest,
          version: policy.version,
          providers: policy.providers,
        }
      : null,
    notice: notice
      ? {
          subject: notice.subject,
          text: notice.text,
          contentDigest: notice.digest,
        }
      : null,
    noticeStatus: attempt?.status ?? null,
  }
}

/** Existing repositories remain authoritative for identity, evidence and all postconditions. */
export async function reviewOfficePrivacyProviders(
  db: PrismaClient,
  input: z.infer<typeof officePrivacyExternalReviewSchema> & {
    operatorUserId: string
  },
) {
  const parsed = officePrivacyExternalReviewSchema.parse({
    requestId: input.requestId,
    commandId: input.commandId,
    expectedStep: input.expectedStep,
    reason: input.reason,
    policyDigest: input.policyDigest,
    confirmationsReviewed: input.confirmationsReviewed,
    receipts: input.receipts,
  })
  const workflow = await getAccountPrivacyWorkflow(db, input)
  if (workflow.nextStep !== parsed.expectedStep)
    throw new AccountPrivacyWorkflowError("STALE_STEP")
  const policy = getApprovedAccountPrivacyExternalPolicy()
  if (!policy || policy.digest !== parsed.policyDigest)
    throw new AccountPrivacyWorkflowError("DOMAIN_REVIEW_REQUIRED")
  await recordAccountPrivacyExternalReview(db, {
    requestId: parsed.requestId,
    receipts: parsed.receipts,
    confirmationsReviewed: true,
    operatorUserId: input.operatorUserId,
  })
  return {
    executedStep: parsed.expectedStep,
    workflow: await getAccountPrivacyWorkflow(db, input),
  }
}

export async function dispatchOfficePrivacyNotice(
  db: PrismaClient,
  input: z.infer<typeof officePrivacyNoticeSchema> & { operatorUserId: string },
  sendNotice: typeof sendAccountPrivacyOutcomeNotice = sendAccountPrivacyOutcomeNotice,
) {
  const parsed = officePrivacyNoticeSchema.parse({
    requestId: input.requestId,
    commandId: input.commandId,
    expectedStep: input.expectedStep,
    reason: input.reason,
    contentDigest: input.contentDigest,
    contentReviewed: input.contentReviewed,
  })
  const workflow = await getAccountPrivacyWorkflow(db, input)
  if (workflow.nextStep !== parsed.expectedStep)
    throw new AccountPrivacyWorkflowError("STALE_STEP")
  const notice = approvedOfficePrivacyNotice()
  if (!notice || notice.digest !== parsed.contentDigest)
    throw new AccountPrivacyWorkflowError("NOTICE_DELIVERY_REQUIRED")
  const result = await sendNotice(db, {
    requestId: input.requestId,
    operatorUserId: input.operatorUserId,
    subject: notice.subject,
    text: notice.text,
    html: notice.html,
  })
  // Unknown delivery must keep the Office command unresolved. Never automatically resend.
  if (result.status === "UNCERTAIN")
    throw new AccountPrivacyWorkflowError("NOTICE_DELIVERY_REQUIRED")
  return {
    executedStep: parsed.expectedStep,
    workflow: await getAccountPrivacyWorkflow(db, input),
  }
}
