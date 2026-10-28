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
