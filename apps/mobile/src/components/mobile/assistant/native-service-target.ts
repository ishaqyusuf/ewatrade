import { serviceBookingTargetSchema } from "@ewatrade/assistant/general/booking-read"
import type { GeneralReceipt } from "@ewatrade/assistant/general/contracts"
import { quoteDecisionReceiptTarget } from "@ewatrade/assistant/general/quote-decision"
import { quoteApprovalTargetSchema } from "@ewatrade/assistant/general/quote-reads"
import {
  serviceManualMessageReceiptTarget,
  serviceManualMessageTargetSchema,
} from "@ewatrade/assistant/general/service-message-read"
import { serviceRequestReadTargetSchema } from "@ewatrade/assistant/general/service-request-read"
import { serviceWorkOriginalTargetSchema } from "@ewatrade/assistant/general/service-work-original"
import { z } from "zod"

const id = z.string().trim().min(1).max(128)
export const nativeServiceOriginalTarget = z.discriminatedUnion("kind", [
  ...serviceRequestReadTargetSchema.options,
  ...serviceWorkOriginalTargetSchema.options,
  z
    .object({ kind: z.literal("service_intake"), intakeId: id, orderId: id })
    .strict(),
  quoteApprovalTargetSchema,
  serviceBookingTargetSchema,
  serviceManualMessageTargetSchema,
  z.object({ kind: z.literal("service_job"), jobId: id }).strict(),
])
export type NativeServiceOriginalTarget = z.infer<
  typeof nativeServiceOriginalTarget
>

export function readNativeServiceOriginalTarget(raw: unknown) {
  if (typeof raw !== "string" || raw.length > 8192) return null
  try {
    const parsed = nativeServiceOriginalTarget.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
export function nativeServiceOriginalRoute(raw: unknown) {
  const parsed = nativeServiceOriginalTarget.safeParse(raw)
  return parsed.success
    ? {
        pathname: "/service-jobs-modal" as const,
        params: { target: JSON.stringify(parsed.data) },
      }
    : null
}
export function nativeServiceReceiptRoute(receipt: GeneralReceipt) {
  if (receipt.kind === "service_manual_message")
    return nativeServiceOriginalRoute(
      serviceManualMessageReceiptTarget(receipt),
    )
  if (receipt.kind === "commerce_quote_decision")
    return nativeServiceOriginalRoute(quoteDecisionReceiptTarget(receipt))
  if (receipt.kind === "service_intake")
    return nativeServiceOriginalRoute({
      kind: receipt.kind,
      intakeId: receipt.recordId,
      orderId: receipt.orderId,
    })
  if (receipt.kind === "service_work")
    return nativeServiceOriginalRoute({
      kind: receipt.kind,
      jobId: receipt.recordId,
      eventId: "eventId" in receipt ? receipt.eventId : undefined,
    })
  if (
    receipt.kind === "service_work_note" ||
    receipt.kind === "service_work_exception"
  )
    return nativeServiceOriginalRoute({
      kind: receipt.kind,
      jobId: "jobId" in receipt ? receipt.jobId : undefined,
      recordId: receipt.recordId,
    })
  return null
}
