import { randomUUID } from "node:crypto"
import {
  RECEIPT_PIPELINE_VERSION,
  RECEIPT_RULE_VERSION,
  type ReceiptCheckContext,
  assessManualPaymentReceipt,
  hasAdvisoryReceiptTransferCandidate,
  parseReceiptExtraction,
} from "@ewatrade/payments/receipt-assessment"
import {
  RECEIPT_PROMPT_VERSION,
  RECEIPT_SCHEMA_VERSION,
  type ReceiptExtractorResult,
} from "@ewatrade/payments/receipt-extractor"
import { ManualPaymentError } from "@ewatrade/utils/manual-payments"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { assertAttachmentEntitlement } from "./attachment-entitlement"
import { assertFinanceManager } from "./finance/access"
import { runInOwnTransaction } from "./own-transaction"

type Identity = { tenantId: string; assessmentId: string }
const CURRENT_PIPELINE = {
  pipelineVersion: RECEIPT_PIPELINE_VERSION,
  schemaVersion: RECEIPT_SCHEMA_VERSION,
  promptVersion: RECEIPT_PROMPT_VERSION,
  ruleVersion: RECEIPT_RULE_VERSION,
}
const unavailable = (reason: string) => ({
  state: "UNAVAILABLE" as const,
  unavailableReason: reason,
  completedAt: new Date(),
  leaseToken: null,
  leaseExpiresAt: null,
})

/** Called only after purpose-bound verified private ingress. Disabled mode records manual fallback. */
export async function ensureManualReceiptAssessment(
  db: PrismaClient,
  input: { reportId: string; processingEnabled: boolean },
) {
  return runInOwnTransaction(db, async (tx) => {
    const report = await tx.manualPaymentReport.findFirst({
      where: { id: input.reportId, link: { tenant: { isActive: true } } },
      include: { link: { select: { tenantId: true } } },
    })
    if (
      !report?.receiptUploadedAt ||
      !report.receiptDigest ||
      report.draftCancelledAt
    )
      return null
    // A pipeline upgrade/public retry is not permission for another uncertain provider call.
    const dispatched = await tx.manualReceiptAssessment.findFirst({
      where: {
        reportId: report.id,
        generation: report.receiptGeneration,
        receiptDigest: report.receiptDigest,
        providerStartedAt: { not: null },
      },
      orderBy: { createdAt: "desc" },
    })
    if (dispatched) return dispatched
    const identity = {
      reportId: report.id,
      generation: report.receiptGeneration,
      pipelineVersion: RECEIPT_PIPELINE_VERSION,
    }
    await tx.manualReceiptAssessment.createMany({
      data: {
        ...identity,
        ...CURRENT_PIPELINE,
        tenantId: report.link.tenantId,
        receiptDigest: report.receiptDigest,
        expiresAt: new Date(Date.now() + 10 * 60_000),
        ...(!input.processingEnabled
          ? unavailable("PROCESSOR_UNAVAILABLE")
          : {}),
      },
      skipDuplicates: true,
    })
    return tx.manualReceiptAssessment.findUnique({
      where: { reportId_generation_pipelineVersion: identity },
    })
  })
}

export function claimManualReceiptAssessment(
  db: PrismaClient,
  identity: Identity,
) {
  return runInOwnTransaction(db, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ManualReceiptAssessment" WHERE id=${identity.assessmentId} AND "tenantId"=${identity.tenantId} FOR UPDATE`
    const row = await tx.manualReceiptAssessment.findFirst({
      where: { id: identity.assessmentId, tenantId: identity.tenantId },
      include: {
        report: {
          include: {
            link: {
              select: {
                tenantId: true,
                tenant: { select: { isActive: true } },
              },
            },
          },
        },
      },
    })
    if (!row || ["COMPLETE", "UNAVAILABLE"].includes(row.state)) return null
    const now = new Date()
    if (
      row.state === "CHECKING" &&
      row.leaseExpiresAt &&
      row.leaseExpiresAt > now
    )
      return null
    const current =
      row.report.receiptGeneration === row.generation &&
      row.report.receiptDigest === row.receiptDigest &&
      row.report.receiptUploadedAt &&
      row.report.draftCancelledAt === null &&
      row.report.link.tenantId === row.tenantId &&
      row.report.link.tenant.isActive
    if (
      !current ||
      row.expiresAt <= now ||
      row.attempts >= 2 ||
      row.providerStartedAt
    ) {
      await tx.manualReceiptAssessment.update({
        where: { id: row.id },
        data: unavailable(
          row.providerStartedAt
            ? "PROVIDER_OUTCOME_UNKNOWN"
            : "PROCESSING_UNAVAILABLE",
        ),
      })
      return null
    }
    const leaseToken = randomUUID()
    return tx.manualReceiptAssessment.update({
      where: { id: row.id },
      data: {
        state: "CHECKING",
        leaseToken,
        leaseExpiresAt: new Date(now.getTime() + 60_000),
        attempts: { increment: 1 },
      },
    })
  })
}

export type ReceiptProcessingAdmission = {
  processorApproved: boolean
  provider: "openai"
  model: string
  maxDailyRequests: number
  maxDailyTokens: number
  reservedTokens: number
  maxDailyImages: number
  imageCount: number
}

/** Fenced spend reservation. Unknown outcomes retain the complete reservation; never blind-retry. */
export function startManualReceiptAssessment(
  db: PrismaClient,
  input: Identity & {
    leaseToken: string
    admission: ReceiptProcessingAdmission
  },
) {
  return runInOwnTransaction(db, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ManualReceiptAssessment" WHERE id=${input.assessmentId} AND "tenantId"=${input.tenantId} FOR UPDATE`
    const row = await tx.manualReceiptAssessment.findFirst({
      where: {
        id: input.assessmentId,
        tenantId: input.tenantId,
        leaseToken: input.leaseToken,
        state: "CHECKING",
        providerStartedAt: null,
        leaseExpiresAt: { gt: new Date() },
        expiresAt: { gt: new Date() },
      },
      include: {
        report: {
          include: {
            link: {
              include: {
                order: { select: { storeId: true } },
                tenant: { select: { isActive: true } },
              },
            },
          },
        },
      },
    })
    if (!row) return false
    await tx.$queryRaw`SELECT id FROM "ManualPaymentReport" WHERE id=${row.reportId} FOR UPDATE`
    const currentArtifact = await tx.manualPaymentReport.findFirst({
      where: {
        id: row.reportId,
        receiptDigest: row.receiptDigest,
        receiptGeneration: row.generation,
        receiptUploadedAt: { not: null },
        draftCancelledAt: null,
        link: { tenantId: row.tenantId, tenant: { isActive: true } },
      },
      select: { id: true },
    })
    const priorDispatch = await tx.manualReceiptAssessment.findFirst({
      where: {
        reportId: row.reportId,
        generation: row.generation,
        receiptDigest: row.receiptDigest,
        id: { not: row.id },
        providerStartedAt: { not: null },
      },
      select: { id: true },
    })
    if (!currentArtifact || priorDispatch) {
      await tx.manualReceiptAssessment.update({
        where: { id: row.id },
        data: unavailable("ASSESSMENT_ALREADY_DISPATCHED"),
      })
      return false
    }
    const admission = input.admission
    const bounded = [
      admission.maxDailyRequests,
      admission.maxDailyTokens,
      admission.reservedTokens,
      admission.maxDailyImages,
      admission.imageCount,
    ].every((value) => Number.isSafeInteger(value) && value > 0)
    if (
      !bounded ||
      admission.imageCount > 3 ||
      !admission.processorApproved ||
      admission.provider !== "openai" ||
      !["gpt-4.1-mini", "gpt-4.1"].includes(admission.model) ||
      !row.report.link.tenant.isActive ||
      row.report.receiptDigest !== row.receiptDigest ||
      row.report.receiptGeneration !== row.generation ||
      row.report.link.tenantId !== row.tenantId ||
      !row.report.receiptUploadedAt ||
      row.report.draftCancelledAt !== null
    ) {
      await tx.manualReceiptAssessment.update({
        where: { id: row.id },
        data: unavailable("PROCESSOR_UNAVAILABLE"),
      })
      return false
    }
    try {
      await assertAttachmentEntitlement(tx, { tenantId: row.tenantId })
    } catch {
      await tx.manualReceiptAssessment.update({
        where: { id: row.id },
        data: unavailable("ENTITLEMENT_UNAVAILABLE"),
      })
      return false
    }
    const member = await tx.membership.findFirst({
      where: {
        tenantId: row.tenantId,
        userId: row.report.link.createdByUserId,
        status: "ACTIVE",
      },
      include: {
        staffStoreAssignments: {
          where: { storeId: row.report.link.order.storeId, status: "ACTIVE" },
        },
      },
    })
    if (
      !member ||
      !["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"].includes(
        member.role,
      ) ||
      (!["OWNER", "ADMIN"].includes(member.role) &&
        member.staffAccessMode === "SCOPED" &&
        !member.staffStoreAssignments.length)
    ) {
      await tx.manualReceiptAssessment.update({
        where: { id: row.id },
        data: unavailable("SCOPE_UNAVAILABLE"),
      })
      return false
    }
    const day = new Date().toISOString().slice(0, 10)
    const scopeKey = `manual-receipt:${row.tenantId}:${day}`
    await tx.assistantBudget.upsert({
      where: { scopeKey },
      create: { scopeKey, windowStartedAt: new Date(`${day}T00:00:00.000Z`) },
      update: {},
    })
    const [budget] = await tx.$queryRaw<
      { requests: number; tokens: number; visionImages: number }[]
    >`SELECT "requests", "tokens", "visionImages" FROM "AssistantBudget" WHERE "scopeKey"=${scopeKey} FOR UPDATE`
    if (
      !budget ||
      budget.requests >= admission.maxDailyRequests ||
      budget.tokens + admission.reservedTokens > admission.maxDailyTokens ||
      budget.visionImages + admission.imageCount > admission.maxDailyImages
    ) {
      await tx.manualReceiptAssessment.update({
        where: { id: row.id },
        data: unavailable("BUDGET_UNAVAILABLE"),
      })
      return false
    }
    await tx.assistantBudget.update({
      where: { scopeKey },
      data: {
        requests: { increment: 1 },
        tokens: { increment: admission.reservedTokens },
        visionImages: { increment: admission.imageCount },
      },
    })
    const usage = await tx.assistantUsageEvent.create({
      data: {
        tenantId: row.tenantId,
        actorUserId: member.userId,
        provider: admission.provider,
        model: admission.model,
        requestClass: "manual-receipt",
        outcome: "reserved",
        // Reservation is a budget ceiling, never measured provider usage.
        totalTokens: null,
        imageCount: admission.imageCount,
      },
    })
    await tx.manualReceiptAssessment.update({
      where: { id: row.id },
      data: {
        providerStartedAt: new Date(),
        provider: admission.provider,
        model: admission.model,
        usageEventId: usage.id,
      },
    })
    return true
  })
}

export function finishManualReceiptAssessment(
  db: PrismaClient,
  input: Identity & {
    leaseToken: string
    result: ReceiptExtractorResult | null
    context: ReceiptCheckContext
  },
) {
  return runInOwnTransaction(db, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ManualReceiptAssessment" WHERE id=${input.assessmentId} AND "tenantId"=${input.tenantId} FOR UPDATE`
    const row = await tx.manualReceiptAssessment.findFirst({
      where: {
        id: input.assessmentId,
        tenantId: input.tenantId,
        leaseToken: input.leaseToken,
        state: "CHECKING",
        leaseExpiresAt: { gt: new Date() },
        expiresAt: { gt: new Date() },
      },
      include: {
        report: {
          include: {
            link: {
              select: {
                tenantId: true,
                currencyCode: true,
                bankAccountNumber: true,
                tenant: { select: { isActive: true } },
              },
            },
          },
        },
      },
    })
    if (!row) return false
    if (
      !row.providerStartedAt ||
      !input.result ||
      row.report.receiptDigest !== row.receiptDigest ||
      row.report.receiptGeneration !== row.generation ||
      row.report.draftCancelledAt !== null ||
      input.result.provider !== row.provider ||
      input.result.model !== row.model
    ) {
      await tx.manualReceiptAssessment.update({
        where: { id: row.id },
        data: unavailable("PROCESSING_UNAVAILABLE"),
      })
      return false
    }
    const extraction = parseReceiptExtraction(input.result.extraction)
    // Context snapshot must match the saved claim. Rules still cannot mutate money.
    if (
      input.context.claimedAmountMinor !== row.report.claimedAmountMinor ||
      input.context.currencyCode !== row.report.link.currencyCode ||
      input.context.receivingAccountNumber !==
        row.report.link.bankAccountNumber ||
      row.report.link.tenantId !== row.tenantId ||
      !row.report.link.tenant.isActive
    )
      throw new Error("Receipt claim changed.")
    const semanticCandidate = await hasAdvisoryReceiptTransferCandidate(
      {
        tenantId: row.tenantId,
        currencyCode: row.report.link.currencyCode,
        reportId: row.reportId,
        printedBankReference: extraction.bankReference,
      },
      async (candidate) =>
        Boolean(
          await tx.manualPaymentTransferConsumption.findFirst({
            where: {
              tenantId: candidate.tenantId,
              currencyCode: candidate.currencyCode,
              reportId: { not: candidate.excludeReportId },
              namespace: candidate.namespace,
              normalizedReference: candidate.printedSessionId,
            },
            select: { id: true },
          }),
        ),
    )
    const result = assessManualPaymentReceipt(extraction, {
      ...input.context,
      duplicateCandidate: input.context.duplicateCandidate || semanticCandidate,
    })
    await tx.manualReceiptAssessment.update({
      where: { id: row.id },
      data: {
        state: "COMPLETE",
        completedAt: new Date(),
        leaseToken: null,
        leaseExpiresAt: null,
        extraction: { ...extraction },
        findings: {
          disposition: result.disposition,
          findings: result.findings,
          fundsConfirmed: false,
          checkWindow: {
            claimedAt: input.context.claimedAt.toISOString(),
            oldestAcceptableAt: input.context.oldestAcceptableAt.toISOString(),
            latestAcceptableAt: input.context.latestAcceptableAt.toISOString(),
          },
        },
        amountMinor: result.amountMinor,
        currencyCode: extraction.currencyCode,
        recipientLast4: /^\d{10}$/.test(extraction.recipientAccount ?? "")
          ? extraction.recipientAccount?.slice(-4)
          : null,
        providerRequestId: input.result.providerRequestId,
      },
    })
    if (row.usageEventId)
      await tx.assistantUsageEvent.update({
        where: { id: row.usageEventId },
        data: { outcome: "complete" },
      })
    return true
  })
}

/** No raw extraction, account digits, bank identifiers or merchant duplicate history. */
export function manualReceiptAssessmentProjection(
  row:
    | {
        state: "PENDING" | "CHECKING" | "COMPLETE" | "UNAVAILABLE"
        generation: number
        pipelineVersion: string
        completedAt: Date | null
        expiresAt: Date
        leaseExpiresAt: Date | null
        providerStartedAt: Date | null
        amountMinor: number | null
        currencyCode: string | null
        recipientLast4: string | null
        unavailableReason: string | null
        findings: Prisma.JsonValue | null
      }
    | undefined,
) {
  if (!row) return null
  const timedOut =
    (row.state === "PENDING" && row.expiresAt <= new Date()) ||
    (row.state === "CHECKING" &&
      (row.expiresAt <= new Date() ||
        (row.leaseExpiresAt !== null && row.leaseExpiresAt <= new Date())))
  const states = {
    PENDING: "pending",
    CHECKING: "checking",
    COMPLETE: "complete",
    UNAVAILABLE: "unavailable",
  } as const
  const result =
    row.findings &&
    typeof row.findings === "object" &&
    !Array.isArray(row.findings)
      ? row.findings
      : null
  const findings =
    result && Array.isArray(result.findings)
      ? result.findings.flatMap<{ code: string; severity: "info" | "review" }>(
          (value) => {
            if (
              !value ||
              typeof value !== "object" ||
              Array.isArray(value) ||
              typeof value.code !== "string" ||
              value.code.length > 80 ||
              (value.severity !== "info" && value.severity !== "review")
            )
              return []
            return [{ code: value.code, severity: value.severity }]
          },
        )
      : []
  return {
    state: timedOut ? ("unavailable" as const) : states[row.state],
    generation: row.generation,
    pipelineVersion: row.pipelineVersion,
    completedAt: row.completedAt,
    amountMinor: row.amountMinor,
    currencyCode: row.currencyCode,
    recipientLast4: row.recipientLast4,
    unavailableReason: timedOut
      ? row.providerStartedAt
        ? "PROVIDER_OUTCOME_UNKNOWN"
        : "PROCESSING_UNAVAILABLE"
      : row.unavailableReason,
    disposition:
      result?.disposition === "consistent"
        ? ("consistent" as const)
        : result?.disposition === "needs_review"
          ? ("needs_review" as const)
          : null,
    findings,
    fundsConfirmed: false as const,
  }
}

export async function markManualReceiptAssessmentUnavailable(
  db: PrismaClient,
  input: Identity & { leaseToken: string },
) {
  return db.manualReceiptAssessment.updateMany({
    where: {
      id: input.assessmentId,
      tenantId: input.tenantId,
      leaseToken: input.leaseToken,
      state: "CHECKING",
    },
    data: unavailable("PROCESSING_UNAVAILABLE"),
  })
}

export function manualReceiptExtractionProjection(
  row: { extraction: Prisma.JsonValue | null } | undefined,
) {
  if (!row?.extraction) return null
  try {
    return parseReceiptExtraction(row.extraction)
  } catch {
    return null
  }
}

/** Fresh Finance authority and canonical Tenant ownership, independent of funds setup. */
export function authorizeMerchantReceiptAssessmentRetry(
  db: PrismaClient,
  input: { tenantId: string; actorUserId: string; reportId: string },
) {
  return runInOwnTransaction(db, async (tx) => {
    await assertFinanceManager(tx, input)
    const report = await tx.manualPaymentReport.findFirst({
      where: {
        id: input.reportId,
        link: { tenantId: input.tenantId, tenant: { isActive: true } },
      },
      select: { id: true },
    })
    if (!report)
      throw new ManualPaymentError("NOT_FOUND", "Payment report not found.")
    return report.id
  })
}
