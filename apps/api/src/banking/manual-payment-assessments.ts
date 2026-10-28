import { prisma } from "@ewatrade/db/client"
import { ensureManualReceiptAssessment } from "@ewatrade/db/manual-payment-assessments"
import {
  enqueueManualReceiptAssessment,
  manualReceiptProcessingEnabled,
} from "@ewatrade/jobs"

/** Upload is already saved. Analysis failure cannot erase a valid manual report. */
export async function scheduleManualReceiptAssessment(reportId: string) {
  const assessment = await ensureManualReceiptAssessment(prisma, {
    reportId,
    processingEnabled: manualReceiptProcessingEnabled(),
  })
  if (!assessment || assessment.state !== "PENDING") return
  try {
    if (
      await enqueueManualReceiptAssessment({
        tenantId: assessment.tenantId,
        assessmentId: assessment.id,
      })
    )
      return
  } catch {
    // No provider error/request/receipt bytes enter logs or customer messages.
  }
  await prisma.manualReceiptAssessment.updateMany({
    where: { id: assessment.id, state: "PENDING", providerStartedAt: null },
    data: {
      state: "UNAVAILABLE",
      unavailableReason: "WORKER_UNAVAILABLE",
      completedAt: new Date(),
    },
  })
}

/** Explicit retry cannot reset spend/attempt/expiry fences or repeat uncertain calls. */
export async function retryManualReceiptAssessment(reportId: string) {
  const enabled = manualReceiptProcessingEnabled()
  const row = await ensureManualReceiptAssessment(prisma, {
    reportId,
    processingEnabled: enabled,
  })
  if (
    enabled &&
    row &&
    row.state === "UNAVAILABLE" &&
    row.providerStartedAt === null &&
    row.attempts < 2 &&
    row.expiresAt > new Date() &&
    [
      "PROCESSOR_UNAVAILABLE",
      "WORKER_UNAVAILABLE",
      "ENTITLEMENT_UNAVAILABLE",
      "SCOPE_UNAVAILABLE",
    ].includes(row.unavailableReason ?? "")
  ) {
    await prisma.manualReceiptAssessment.updateMany({
      where: {
        id: row.id,
        state: "UNAVAILABLE",
        providerStartedAt: null,
        attempts: { lt: 2 },
        expiresAt: { gt: new Date() },
        report: {
          receiptGeneration: row.generation,
          receiptDigest: row.receiptDigest,
        },
      },
      data: { state: "PENDING", unavailableReason: null, completedAt: null },
    })
  }
  await scheduleManualReceiptAssessment(reportId)
}
