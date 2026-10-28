import { createHash } from "node:crypto"
import { prisma } from "@ewatrade/db/client"
import {
  claimManualReceiptAssessment,
  finishManualReceiptAssessment,
  markManualReceiptAssessmentUnavailable,
  startManualReceiptAssessment,
} from "@ewatrade/db/manual-payment-assessments"
import { createReceiptExtractor } from "@ewatrade/payments/receipt-extractor"
import {
  acceptsOrderAttachmentBytes,
  createOrderAttachmentStorage,
} from "@ewatrade/private-media/order-attachments"
import sharp from "sharp"
import { assertQaJobProviderAllowed } from "../qa-provider-guard"
import {
  type ManualReceiptAssessmentPayload,
  runManualReceiptAssessment,
} from "./manual-payment-receipt-assessment"

function configuredPolicy() {
  const read = (key: string) => {
    const text = process.env[key]
    return text && /^[1-9]\d{0,7}$/.test(text) ? Number(text) : null
  }
  const maxDailyRequests = read("MANUAL_RECEIPT_MAX_DAILY_REQUESTS")
  const maxDailyTokens = read("MANUAL_RECEIPT_MAX_DAILY_TOKENS")
  const reservedTokens = read("MANUAL_RECEIPT_RESERVED_TOKENS")
  const maxDailyImages = read("MANUAL_RECEIPT_MAX_DAILY_IMAGES")
  const oldestDays = read("MANUAL_RECEIPT_OLDEST_DAYS")
  const futureMinutes = read("MANUAL_RECEIPT_FUTURE_MINUTES")
  if (
    process.env.MANUAL_RECEIPT_PROCESSING_ENABLED !== "true" ||
    process.env.MANUAL_RECEIPT_PROCESSOR_APPROVED !== "true" ||
    process.env.MANUAL_RECEIPT_WORKER_ADMITTED !== "true" ||
    !maxDailyRequests ||
    !maxDailyTokens ||
    !reservedTokens ||
    !maxDailyImages ||
    !oldestDays ||
    !futureMinutes ||
    oldestDays > 36500 ||
    futureMinutes > 1440
  )
    return null
  return {
    maxDailyRequests,
    maxDailyTokens,
    reservedTokens,
    maxDailyImages,
    oldestDays,
    futureMinutes,
  }
}

/** Unconfigured/disabled/unapproved processors preserve the ordinary manual review. */
export async function manualPaymentReceiptAssessmentHandler(
  payload: ManualReceiptAssessmentPayload,
) {
  const policy = configuredPolicy()
  const model = process.env.MANUAL_RECEIPT_MODEL ?? "gpt-4.1-mini"
  const extractor = createReceiptExtractor({
    enabled: Boolean(policy),
    processorApproved: Boolean(policy),
    apiKey: process.env.MANUAL_RECEIPT_OPENAI_API_KEY,
    model,
  })
  return runManualReceiptAssessment(payload, {
    claim: (identity) => claimManualReceiptAssessment(prisma, identity),
    prepare: async (identity) => {
      if (!extractor || !policy) return null
      await assertQaJobProviderAllowed({
        adapter: "live",
        operation: "media_analysis",
        tenantId: identity.tenantId,
      })
      const row = await prisma.manualReceiptAssessment.findFirst({
        where: {
          id: identity.assessmentId,
          tenantId: identity.tenantId,
          leaseToken: identity.leaseToken,
          state: "CHECKING",
        },
        include: {
          report: {
            include: {
              attempt: true,
              link: {
                include: { tenant: { select: { dataClassification: true } } },
              },
            },
          },
        },
      })
      const report = row?.report
      if (
        !row ||
        !report?.receiptUploadedAt ||
        !report.receiptStoragePath ||
        !report.receiptContentType ||
        !report.receiptDigest ||
        !report.receiptSizeBytes ||
        report.receiptGeneration !== row.generation ||
        report.receiptDigest !== row.receiptDigest ||
        report.link.tenantId !== row.tenantId ||
        report.receiptContentType === "application/pdf"
      )
        return null
      const bytes = await createOrderAttachmentStorage(
        report.link.tenant.dataClassification,
      ).read({
        target: {
          tenantId: row.tenantId,
          orderId: report.link.orderId,
          attachmentId: report.id,
          contentType: report.receiptContentType,
          contentDigest: row.receiptDigest,
          sizeBytes: report.receiptSizeBytes,
        },
        abortSignal: AbortSignal.timeout(10_000),
      })
      if (
        bytes.byteLength !== report.receiptSizeBytes ||
        bytes.byteLength > 4 * 1024 * 1024 ||
        createHash("sha256").update(bytes).digest("hex") !==
          row.receiptDigest ||
        !acceptsOrderAttachmentBytes(bytes, report.receiptContentType)
      )
        return null
      const image = sharp(bytes, {
        limitInputPixels: 12_000_000,
        animated: false,
        failOn: "warning",
      }).timeout({ seconds: 5 })
      const metadata = await image.metadata()
      if ((metadata.pages ?? 1) !== 1) return null
      const normalized = await image
        .rotate()
        .png()
        .toBuffer({ resolveWithObject: true })
      if (normalized.data.byteLength > 4 * 1024 * 1024) return null
      const claimedAt = report.submittedAt ?? report.createdAt
      return {
        pages: [
          {
            bytes: normalized.data,
            contentType: "image/png",
            width: normalized.info.width,
            height: normalized.info.height,
          },
        ],
        extractor,
        context: {
          claimedAmountMinor: report.claimedAmountMinor,
          currencyCode: report.link.currencyCode,
          receivingAccountNumber: report.link.bankAccountNumber,
          paymentReference: report.attempt?.paymentReference ?? null,
          claimedAt,
          oldestAcceptableAt: new Date(
            claimedAt.getTime() - policy.oldestDays * 86400_000,
          ),
          latestAcceptableAt: new Date(
            claimedAt.getTime() + policy.futureMinutes * 60_000,
          ),
          duplicateCandidate: Boolean(
            await prisma.manualPaymentReport.findFirst({
              where: {
                id: { not: report.id },
                receiptDigest: row.receiptDigest,
                receiptUploadedAt: { not: null },
                link: { tenantId: row.tenantId },
                status: { in: ["SUBMITTED", "CONFIRMED"] },
              },
              select: { id: true },
            }),
          ),
        },
      }
    },
    start: async (identity) => {
      const currentPolicy = configuredPolicy()
      if (!currentPolicy) {
        await markManualReceiptAssessmentUnavailable(prisma, identity)
        return false
      }
      await assertQaJobProviderAllowed({
        adapter: "live",
        operation: "media_analysis",
        tenantId: identity.tenantId,
      })
      return startManualReceiptAssessment(prisma, {
        ...identity,
        admission: {
          ...currentPolicy,
          imageCount: identity.imageCount,
          provider: "openai",
          model,
          processorApproved: true,
        },
      })
    },
    finish: (input) => finishManualReceiptAssessment(prisma, input),
    unavailable: (input) =>
      markManualReceiptAssessmentUnavailable(prisma, input),
  })
}
