import { z } from "zod"

export const assistantActions = [
  "customer_create",
  "service_create",
  "product_create",
  "money_account_create",
  "order_create",
  "payment_record",
  "customer_update",
  "product_price_update",
  "product_details_update",
  "product_identifiers_update",
  "product_availability_update",
  "product_unit_configuration_draft",
  "product_unit_configuration_publish",
  "stock_receive",
  "stock_count_create",
  "stock_count_finalize",
  "stock_adjust",
  "stock_correct",
  "stock_transfer_dispatch",
  "stock_transfer_receive",
  "stock_transfer_cancel",
  "inventory_closeout_create",
  "inventory_closeout_finalize",
  "order_cancel",
  "order_metadata_update",
  "order_replace",
] as const
export const assistantSignalSchema = z.object({
  action: z.enum([
    ...assistantActions,
    "transcription_local_whisper",
    "transcription_openai",
    "transcription_xai",
  ]),
  phase: z.enum([
    "started",
    "completed",
    "failed",
    "skipped",
    "blocked",
    "cancelled",
  ]),
  provider: z.enum(["local_whisper", "openai", "xai"]).optional(),
  model: z
    .string()
    .regex(/^[a-zA-Z0-9_./:-]{1,100}$/)
    .optional(),
  environment: z.enum(["local", "dev", "preview", "production"]).optional(),
  error_code: z
    .string()
    .regex(/^[A-Z_]{1,64}$/)
    .optional(),
  duration_ms: z.number().finite().nonnegative().optional(),
  attempt_ordinal: z.number().int().min(1).max(3).optional(),
  item_count: z.number().int().nonnegative().optional(),
})
export type AssistantSignal = z.infer<typeof assistantSignalSchema>

export function proposalSignal(output: unknown) {
  const result = z
    .object({
      id: z.string().min(1).max(128),
      status: z.enum([
        "COMPLETED",
        "CANCELLED",
        "EXPIRED",
        "PENDING",
        "EXECUTING",
        "FAILED",
      ]),
      payload: z.object({ action: z.enum(assistantActions) }),
    })
    .safeParse(output)
  if (!result.success) return null
  return {
    commandId: result.data.id,
    signal: {
      action: result.data.payload.action,
      phase:
        result.data.status === "COMPLETED"
          ? "completed"
          : result.data.status === "CANCELLED"
            ? "cancelled"
            : result.data.status === "FAILED"
              ? "failed"
              : "blocked",
      item_count: result.data.status === "COMPLETED" ? 1 : 0,
    } satisfies AssistantSignal,
  }
}

export function productCreationSignal(path: string, output: unknown) {
  if (
    !["productAssistant.create", "productAssistant.createFromForm"].includes(
      path,
    )
  )
    return null
  const result = z
    .object({ recordId: z.string().min(1).max(128) })
    .safeParse(output)
  if (!result.success) return null
  return {
    commandId: result.data.recordId,
    signal: {
      action: "product_create",
      phase: "completed",
      item_count: 1,
    } satisfies AssistantSignal,
  }
}
