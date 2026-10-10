import { z } from "zod"
const id = z.string().trim().min(1).max(128)
const reason = z.string().trim().min(1).max(500)
const money = z.number().int().min(0).max(100_000_000)
export const orderCancelAction = z
  .object({ action: z.literal("order_cancel"), orderId: id, reason })
  .strict()
export const orderMetadataAction = z
  .object({
    action: z.literal("order_metadata_update"),
    orderId: id,
    reason,
    patch: z
      .object({
        customerId: id.nullable().optional(),
        deliveryDueAt: z
          .string()
          .datetime({ offset: true })
          .nullable()
          .optional(),
        notes: z.string().trim().max(2000).nullable().optional(),
      })
      .strict()
      .refine(
        (value) => Object.values(value).some((entry) => entry !== undefined),
        "Choose at least one field to change.",
      ),
  })
  .strict()
export const orderReplaceAction = z
  .object({
    action: z.literal("order_replace"),
    orderId: id,
    reason,
    changes: z
      .array(
        z
          .object({
            orderLineId: id,
            quantity: z
              .string()
              .regex(/^\d{1,12}(\.\d{1,6})?$/)
              .refine((value) => Number(value) > 0)
              .optional(),
            unitPriceMinor: money.optional(),
            enteredTotalMinor: money.optional(),
          })
          .strict()
          .refine(
            (value) =>
              value.quantity !== undefined ||
              value.unitPriceMinor !== undefined ||
              value.enteredTotalMinor !== undefined,
            "Choose a quantity or price change.",
          ),
      )
      .min(1)
      .max(30),
  })
  .strict()
