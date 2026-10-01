import type { PrismaClient } from "../../generated/prisma/client"

type NoticeAlertClient = Pick<
  PrismaClient,
  "accountPrivacyNoticeAttempt" | "accountPrivacyRequest"
>

/** Counts only unresolved notice custody; no recipient or case identifier leaves this query. */
export async function getAccountPrivacyNoticeAlertSummary(
  db: NoticeAlertClient,
  now = new Date(),
) {
  const sendingCutoff = new Date(now.getTime() - 10 * 60_000)
  const deliveryCutoff = new Date(now.getTime() - 60 * 60_000)
  const failed = await db.accountPrivacyNoticeAttempt.count({
    where: { status: "FAILED" },
  })
  const uncertain = await db.accountPrivacyNoticeAttempt.count({
    where: { status: "UNCERTAIN" },
  })
  const staleSending = await db.accountPrivacyNoticeAttempt.count({
    where: { status: "SENDING", updatedAt: { lt: sendingCutoff } },
  })
  const deliveryUnconfirmed = await db.accountPrivacyNoticeAttempt.count({
    where: { status: "SENT", sentAt: { lt: deliveryCutoff } },
  })
  const failedAfterCompletion = await db.accountPrivacyRequest.count({
    where: {
      completedAt: { not: null },
      noticeAttempts: { some: { status: "FAILED" } },
    },
  })
  return {
    failed,
    uncertain,
    staleSending,
    deliveryUnconfirmed,
    failedAfterCompletion,
    total: failed + uncertain + staleSending + deliveryUnconfirmed,
  }
}
