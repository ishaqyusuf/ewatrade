import { z } from "zod"

const jobId = z.string().trim().min(1).max(128)
const id = z.string().trim().min(1).max(128)

/** Owning identities only. Current actor/business/Store come from protected auth. */
export const serviceManualMessageContextInput = z.object({ jobId }).strict()
export const serviceManualMessageOriginalInput = z
  .object({ jobId, intentId: id, shareId: id })
  .strict()
export const serviceManualMessageTargetSchema =
  serviceManualMessageOriginalInput
    .extend({ kind: z.literal("service_manual_message") })
    .strict()
export type ServiceManualMessageTarget = z.infer<
  typeof serviceManualMessageTargetSchema
>

export const serviceManualMessageReceiptSchema = z
  .object({
    kind: z.literal("service_manual_message"),
    recordId: id,
    jobId,
    orderId: id,
    shareId: id,
    title: z.string(),
    detail: z.string(),
  })
  .strict()

/** Legacy related-Order receipts never manufacture missing message/share identity. */
export function serviceManualMessageReceiptTarget(
  raw: unknown,
): ServiceManualMessageTarget | null {
  const receipt = serviceManualMessageReceiptSchema.safeParse(raw)
  return receipt.success
    ? {
        kind: "service_manual_message",
        jobId: receipt.data.jobId,
        intentId: receipt.data.recordId,
        shareId: receipt.data.shareId,
      }
    : null
}
