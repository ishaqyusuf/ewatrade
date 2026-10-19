import { z } from "zod"

const id = z
  .string()
  .min(1)
  .max(191)
  .refine((value) => value === value.trim())
const scope = { actorUserId: id, tenantId: id, storeId: id }
const source = z.object({ kind: z.literal("service"), id }).strict()
export const holdSchema = z
  .object({
    ...scope,
    clientOperationId: id,
    expectedConfigurationRevision: z.number().int().min(0).max(2_147_483_647),
    offeringId: id,
    quantity: z.number().int().min(1).max(10_000),
    resourceId: id,
    slotEndAt: z.date(),
    slotStartAt: z.date(),
    source,
  })
  .strict()
  .refine((value) => value.slotEndAt > value.slotStartAt)
export const confirmationSchema = z
  .object({
    ...scope,
    clientOperationId: id,
    clientBookingId: id.optional(),
    commercialOrderId: id.optional(),
    holdId: id,
    quoteVersionId: id.optional(),
    serviceJobId: id.optional(),
    source,
  })
  .strict()
export const revisionSchema = z
  .object({
    ...scope,
    bookingId: id,
    clientOperationId: id,
    expectedRevision: z.number().int().min(0).max(2_147_483_646),
    operation: z.enum([
      "arrive",
      "cancel",
      "complete",
      "mark_no_show",
      "reschedule",
      "start",
    ]),
    newSlotEndAt: z.date().optional(),
    newSlotStartAt: z.date().optional(),
    reasonCode: z
      .string()
      .min(1)
      .max(80)
      .refine((value) => Boolean(value.trim()))
      .optional(),
    resourceId: id.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      ["cancel", "reschedule", "mark_no_show"].includes(value.operation) &&
      !value.reasonCode
    )
      context.addIssue({
        code: "custom",
        message: "This booking operation requires a reason.",
      })
    if (
      value.operation === "reschedule" &&
      (!value.resourceId ||
        !value.newSlotStartAt ||
        !value.newSlotEndAt ||
        value.newSlotEndAt <= value.newSlotStartAt)
    )
      context.addIssue({
        code: "custom",
        message: "Keep the complete exact rescheduled slot.",
      })
  })
export type StaffServiceCommerceBookingHoldInput = z.infer<typeof holdSchema>
export type StaffServiceCommerceBookingConfirmationInput = z.infer<
  typeof confirmationSchema
>
export type StaffServiceCommerceBookingRevisionInput = z.infer<
  typeof revisionSchema
>
