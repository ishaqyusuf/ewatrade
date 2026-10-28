import { ManualPaymentError } from "@ewatrade/utils/manual-payments"
import type { PrismaClient } from "../../generated/prisma/client"
import { runInOwnTransaction } from "./own-transaction"

export function manualDraftCancellationDisposition(
  report: { status: string; revision: number; draftCancelledAt: Date | null },
  expectedRevision: number,
) {
  if (report.draftCancelledAt) return "replay" as const
  if (report.status !== "DRAFT" || report.revision !== expectedRevision)
    throw new ManualPaymentError(
      "CONFLICT",
      "This report changed or was submitted. It can no longer be replaced as a draft.",
    )
  return "cancel" as const
}

/** Exact report-purpose proof supplied by API; never creates a bank decision or funds effect. */
export function cancelManualPaymentDraft(
  db: PrismaClient,
  input: { reportId: string; expectedRevision: number },
) {
  return runInOwnTransaction(db, async (tx) => {
    const origin = await tx.manualPaymentReport.findFirst({
      where: { id: input.reportId, link: { tenant: { isActive: true } } },
      select: { linkId: true },
    })
    if (!origin)
      throw new ManualPaymentError("NOT_FOUND", "Payment report not found.")
    await tx.$queryRaw`SELECT id FROM "ManualPaymentLink" WHERE id=${origin.linkId} FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM "ManualPaymentReport" WHERE id=${input.reportId} FOR UPDATE`
    const report = await tx.manualPaymentReport.findFirst({
      where: {
        id: input.reportId,
        linkId: origin.linkId,
        link: { tenant: { isActive: true } },
      },
    })
    if (!report)
      throw new ManualPaymentError("NOT_FOUND", "Payment report not found.")
    if (
      manualDraftCancellationDisposition(report, input.expectedRevision) ===
      "replay"
    )
      return {
        reportId: report.id,
        revision: report.revision,
        draftCancelledAt: report.draftCancelledAt,
        replay: true,
      }
    const saved = await tx.manualPaymentReport.update({
      where: { id: report.id },
      data: { draftCancelledAt: new Date(), revision: { increment: 1 } },
    })
    return {
      reportId: saved.id,
      revision: saved.revision,
      draftCancelledAt: saved.draftCancelledAt,
      replay: false,
    }
  })
}
