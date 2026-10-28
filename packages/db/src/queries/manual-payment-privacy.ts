import type { PrismaClient } from "../../generated/prisma/client"
/** Retained commercial attribution must prevent a false account-erasure claim.
 * Never match a person by an unverified payer name or a bank account label. */
export async function manualPaymentPrivacyInventory(
  db: Pick<PrismaClient, "$queryRaw">,
  subjectId: string,
) {
  const rows = await db.$queryRaw<
    Array<{
      manualPaymentLinks: number
      manualPaymentReviews: number
      manualPaymentReceiptAssets: number
      manualPaymentAlertSettings: number
      manualPaymentAlertIntents: number
      manualPaymentAlertNoticeReads: number
      manualReceiptAssessments: number
      manualPaymentTransferConsumptions: number
      customerFundsRefundActions: number
    }>
  >`
    SELECT
    (SELECT count(*)::int FROM "ManualPaymentLink" WHERE "createdByUserId"=${subjectId}) AS "manualPaymentLinks",
    (SELECT count(*)::int FROM "ManualPaymentReport" WHERE "decidedByUserId"=${subjectId}) AS "manualPaymentReviews",
    (SELECT count(*)::int FROM "ManualPaymentReport" r JOIN "ManualPaymentLink" l ON l.id=r."linkId"
      WHERE r."receiptStoragePath" IS NOT NULL AND (l."createdByUserId"=${subjectId} OR r."decidedByUserId"=${subjectId})) AS "manualPaymentReceiptAssets",
    (SELECT count(*)::int FROM "ManualPaymentAlertSetting" WHERE "updatedByUserId"=${subjectId} OR ${subjectId}=ANY("recipientUserIds")) AS "manualPaymentAlertSettings",
    (SELECT count(*)::int FROM "PaymentNotificationIntent" WHERE "recipientUserId"=${subjectId}) AS "manualPaymentAlertIntents",
    (SELECT count(*)::int FROM "PaymentNotificationNoticeRead" r JOIN "Membership" m ON m.id=r."membershipId" AND m."tenantId"=r."tenantId" WHERE m."userId"=${subjectId}) AS "manualPaymentAlertNoticeReads",
    (SELECT count(*)::int FROM "ManualReceiptAssessment" a JOIN "ManualPaymentReport" r ON r.id=a."reportId"
      JOIN "ManualPaymentLink" l ON l.id=r."linkId" WHERE l."createdByUserId"=${subjectId} OR r."decidedByUserId"=${subjectId}) AS "manualReceiptAssessments",
    (SELECT count(*)::int FROM "ManualPaymentTransferConsumption" WHERE "validatedByUserId"=${subjectId}) AS "manualPaymentTransferConsumptions",
    (SELECT count(*)::int FROM "CustomerFundsRefundRequest" WHERE "requestedByUserId"=${subjectId} OR "approvedByUserId"=${subjectId} OR "completedByUserId"=${subjectId}) AS "customerFundsRefundActions"
  `
  const row = rows[0]
  if (
    !row ||
    [
      row.manualPaymentLinks,
      row.manualPaymentReviews,
      row.manualPaymentReceiptAssets,
      row.manualPaymentAlertSettings,
      row.manualPaymentAlertIntents,
      row.manualPaymentAlertNoticeReads,
      row.manualReceiptAssessments,
      row.manualPaymentTransferConsumptions,
      row.customerFundsRefundActions,
    ].some((value) => !Number.isSafeInteger(value) || value < 0)
  )
    throw new Error("Manual payment privacy inventory unavailable.")
  return {
    manualPaymentLinks: row.manualPaymentLinks,
    manualPaymentReviews: row.manualPaymentReviews,
    manualPaymentReceiptAssets: row.manualPaymentReceiptAssets,
    manualPaymentAlertSettings: row.manualPaymentAlertSettings,
    manualPaymentAlertIntents: row.manualPaymentAlertIntents,
    manualPaymentAlertNoticeReads: row.manualPaymentAlertNoticeReads,
    manualReceiptAssessments: row.manualReceiptAssessments,
    manualPaymentTransferConsumptions: row.manualPaymentTransferConsumptions,
    customerFundsRefundActions: row.customerFundsRefundActions,
  }
}
