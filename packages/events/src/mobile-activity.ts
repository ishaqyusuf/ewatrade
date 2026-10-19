import { z } from "zod"

const saleCategory = z.enum([
  "catalog",
  "quick_sale",
  "additional_cost",
  "mixed",
])
const stockAction = z.enum(["receipt", "count", "adjustment", "custody", "use"])
const stockCategory = z.enum(["shared", "packaged"])
const count = z.number().int().min(0).max(1000)

/** Fixed product vocabulary only; never pass a form, entity, error or account. */
export const mobileActivityInputSchema = z.discriminatedUnion("name", [
  z
    .object({
      name: z.literal("mobile_sale_started"),
      properties: z.object({ category: saleCategory }).strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("mobile_sale_step_viewed"),
      properties: z
        .object({
          action: z.enum(["items", "customer", "review"]),
          category: saleCategory,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("mobile_sale_submitted"),
      properties: z
        .object({ category: saleCategory, item_count: count })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("mobile_sale_result"),
      properties: z
        .object({
          category: saleCategory,
          status: z.enum([
            "saved",
            "queued",
            "review_required",
            "failed",
            "unknown",
          ]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("mobile_payment_account_selected"),
      properties: z
        .object({
          category: z.enum(["cash", "bank_transfer", "card", "pos", "other"]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("mobile_stock_reviewed"),
      properties: z
        .object({ action: stockAction, category: stockCategory })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("mobile_stock_result"),
      properties: z
        .object({
          action: stockAction,
          status: z.enum([
            "recorded",
            "not_recorded",
            "refresh_required",
            "unknown",
          ]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("mobile_attachment_restricted"),
      properties: z
        .object({
          category: z.enum(["order", "service"]),
          action: z.enum(["camera", "gallery", "video", "document"]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("mobile_upgrade_prompt_action"),
      properties: z
        .object({
          action: z.enum(["view_plan", "ask_owner", "dismiss"]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("mobile_sync_result"),
      properties: z
        .object({
          status: z.enum(["completed", "partial", "failed", "unknown"]),
          item_count: count,
          duration_ms: z.number().finite().min(0).max(3_600_000),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("mobile_offline_review_result"),
      properties: z
        .object({
          action: z.enum(["approve", "reject", "retry", "discard"]),
          status: z.enum([
            "applied",
            "review_required",
            "pending",
            "discarded",
            "failed",
            "unknown",
          ]),
        })
        .strict(),
    })
    .strict(),
])

export type MobileActivityInput = z.infer<typeof mobileActivityInputSchema>

/** Invalid metadata drops the signal instead of copying arbitrary scalar text. */
export function mobileActivityEvent(input: unknown) {
  const parsed = mobileActivityInputSchema.safeParse(input)
  if (!parsed.success) return null
  const { name, properties } = parsed.data
  const status = "status" in properties ? properties.status : undefined
  return {
    name,
    properties: {
      surface: "mobile",
      ...properties,
      ...(status === undefined
        ? {}
        : {
            success: ["saved", "recorded", "completed", "applied"].includes(
              status,
            ),
          }),
    },
  }
}
