import { z } from "zod"

// Exact native opaque identity. Parsing never authorizes the actor or source.
const id = z
  .string()
  .min(1)
  .max(191)
  .refine((value) => value === value.trim())
const revision = z.number().int().min(0).max(2_147_483_647)
const expectedRevision = revision.max(2_147_483_646)
const quantity = z.number().int().min(1).max(10_000)
const source = z.object({ kind: z.literal("service"), id }).strict()
// Preserve the submitted exact instant string. Native Dates represent milliseconds;
// reject finer nonzero precision rather than silently changing the intended instant.
const instant = z
  .string()
  .datetime({ offset: true })
  .refine((value) => {
    const fraction = /\.(\d+)/.exec(value)?.[1] ?? ""
    return (
      Number.isFinite(Date.parse(value)) && !/[1-9]/.test(fraction.slice(3))
    )
  })
const reason = z
  .string()
  .min(1)
  .max(80)
  .refine((value) => Boolean(value.trim()))
const original = { bookingId: id, expectedRevision }
const lifecycle = <const A extends string>(action: A) =>
  z.object({ action: z.literal(action), ...original }).strict()

/** Unexposed intent primitives: no scope, command IDs, tokens, approval or execution. */
export const generalBookingActionSchema = z
  .discriminatedUnion("action", [
    z
      .object({
        action: z.literal("service_booking_hold"),
        source,
        offeringId: id,
        resourceId: id,
        quantity,
        expectedConfigurationRevision: revision,
        slotStartAt: instant,
        slotEndAt: instant,
      })
      .strict(),
    z
      .object({
        action: z.literal("service_booking_confirm"),
        source,
        holdId: id,
        quoteVersionId: id.optional(),
        commercialOrderId: id.optional(),
        serviceJobId: id.optional(),
      })
      .strict(),
    lifecycle("service_booking_arrive"),
    lifecycle("service_booking_start"),
    lifecycle("service_booking_complete"),
    z
      .object({
        action: z.literal("service_booking_cancel"),
        ...original,
        reasonCode: reason,
      })
      .strict(),
    z
      .object({
        action: z.literal("service_booking_no_show"),
        ...original,
        reasonCode: reason,
      })
      .strict(),
    z
      .object({
        action: z.literal("service_booking_reschedule"),
        ...original,
        reasonCode: reason,
        resourceId: id,
        newSlotStartAt: instant,
        newSlotEndAt: instant,
      })
      .strict(),
  ])
  .superRefine((value, context) => {
    const interval =
      value.action === "service_booking_hold"
        ? [value.slotStartAt, value.slotEndAt]
        : value.action === "service_booking_reschedule"
          ? [value.newSlotStartAt, value.newSlotEndAt]
          : null
    if (
      interval &&
      Date.parse(interval[1] ?? "") <= Date.parse(interval[0] ?? "")
    )
      context.addIssue({
        code: "custom",
        message: "Keep the complete positive exact slot interval.",
      })
  })
export type GeneralBookingAction = z.infer<typeof generalBookingActionSchema>

const nativeOperations = {
  service_booking_hold: "hold_slot",
  service_booking_confirm: "confirm",
  service_booking_arrive: "arrive",
  service_booking_start: "start",
  service_booking_complete: "complete",
  service_booking_cancel: "cancel",
  service_booking_no_show: "mark_no_show",
  service_booking_reschedule: "reschedule",
} as const
export function generalBookingNativeOperation(
  action: GeneralBookingAction["action"],
) {
  return nativeOperations[action]
}

const origin = z.object({ tenantId: id, storeId: id }).strict()
const money = z.number().int().min(0).max(2_147_483_647)
/** Exact safe canonical effect projection, not a public capability or native input. */
export const generalBookingEffectReceiptSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("hold_created"),
      holdId: id,
      source,
      offeringId: id,
      origin,
      resourceId: id,
      quantity,
      configurationRevision: revision,
      startAt: instant,
      endAt: instant,
      expiresAt: instant,
      createdAt: instant,
    })
    .strict(),
  z
    .object({
      kind: z.literal("booking_event"),
      operation: z.enum([
        "confirm",
        "arrive",
        "cancel",
        "complete",
        "mark_no_show",
        "reschedule",
        "start",
      ]),
      eventId: id,
      bookingId: id,
      source,
      offeringId: id,
      origin,
      revision,
      fromStatus: z.string().nullable(),
      toStatus: z.string(),
      resourceId: id,
      startAt: instant,
      endAt: instant,
      quantity,
      timezone: z.string().min(1).max(191),
      recordedAt: instant,
      createdAt: instant,
      policyRevisions: z
        .object({
          offering: revision,
          payment: revision,
          cancellation: revision,
        })
        .strict(),
      refundConsequence: z
        .object({
          outcome: z.enum(["none", "refund_eligible", "manual_review"]),
          amountMinor: money.nullable(),
        })
        .strict()
        .nullable(),
      notificationDelivery: z.literal("unverified"),
    })
    .strict(),
])
export const generalBookingReceiptSchema = z
  .object({
    kind: z.literal("service_booking_command"),
    effect: generalBookingEffectReceiptSchema,
  })
  .strict()
export type GeneralBookingReceipt = z.infer<typeof generalBookingReceiptSchema>
