import { z } from "zod"
import type { Prisma } from "../../../generated/prisma/client"
import { assertStaffBookingCommandScopeInTransaction } from "./booking-command-authority"
import {
  bookingConfirmationCommandHash,
  bookingHoldCommandHash,
  bookingRevisionCommandHash,
} from "./booking-command-inputs"
import {
  confirmationSchema,
  holdSchema,
  revisionSchema,
} from "./booking-command-schemas"
import type {
  StaffServiceCommerceBookingConfirmationInput,
  StaffServiceCommerceBookingHoldInput,
  StaffServiceCommerceBookingRevisionInput,
} from "./booking-command-schemas"
import { type BookingTransaction, ServiceCommerceBookingError } from "./shared"
const id = z
  .string()
  .min(1)
  .max(191)
  .refine((value) => value === value.trim())
const count = z.number().int().min(1).max(10_000)
const revision = z.number().int().min(0).max(2_147_483_647)
const instant = z.string().datetime()
const origin = z.object({ tenantId: id, storeId: id }).strict()
const source = z.object({ kind: z.literal("service"), id }).strict()
const holdReceipt = z
  .object({
    kind: z.literal("hold_created"),
    holdId: id,
    source,
    offeringId: id,
    origin,
    resourceId: id,
    quantity: count,
    configurationRevision: revision,
    startAt: instant,
    endAt: instant,
    expiresAt: instant,
    createdAt: instant,
  })
  .strict()
const eventReceipt = z
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
    quantity: count,
    timezone: z.string().min(1).max(191),
    recordedAt: instant,
    createdAt: instant,
    policyRevisions: z
      .object({ offering: revision, payment: revision, cancellation: revision })
      .strict(),
    refundConsequence: z
      .object({
        outcome: z.enum(["none", "refund_eligible", "manual_review"]),
        amountMinor: z.number().int().min(0).max(2_147_483_647).nullable(),
      })
      .strict()
      .nullable(),
    notificationDelivery: z.literal("unverified"),
  })
  .strict()
export type ServiceCommerceBookingCommandReceipt =
  | z.infer<typeof holdReceipt>
  | z.infer<typeof eventReceipt>
function unavailable(): never {
  throw new ServiceCommerceBookingError(
    "BOOKING_IDEMPOTENCY_MISMATCH",
    "The exact saved booking command effect is unavailable.",
  )
}
function iso(value: Date | null) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    unavailable()
  return value.toISOString()
}
function scoped(
  row: { tenantId: string; storeId: string },
  input: { tenantId: string; storeId: string },
) {
  return row.tenantId === input.tenantId && row.storeId === input.storeId
}
// History requires the current exact source boundary, not new-booking eligibility.
// A subsequently declined/withdrawn Request must not erase a saved effect.
async function assertHistoricalSource(
  tx: BookingTransaction,
  input: { tenantId: string; storeId: string },
  sourceId: string,
) {
  const row = await tx.serviceRequest.findFirst({
    where: { id: sourceId, tenantId: input.tenantId, storeId: input.storeId },
    select: { id: true, tenantId: true, storeId: true },
  })
  if (!row || row.id !== sourceId || !scoped(row, input)) unavailable()
}
const eventSelect = {
  id: true,
  tenantId: true,
  storeId: true,
  bookingId: true,
  clientOperationId: true,
  payloadHash: true,
  actorUserId: true,
  type: true,
  fromStatus: true,
  toStatus: true,
  nextEndAt: true,
  nextStartAt: true,
  nextResourceId: true,
  capacitySnapshot: true,
  offeringPolicyRevisionSnapshot: true,
  paymentPolicyRevisionSnapshot: true,
  cancellationPolicyRevisionSnapshot: true,
  refundAmountMinor: true,
  refundOutcome: true,
  effectiveAt: true,
  createdAt: true,
  booking: {
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      sourceId: true,
      sourceType: true,
      holdId: true,
      clientBookingId: true,
      payloadHash: true,
      timezoneSnapshot: true,
      offeringConfig: {
        select: { id: true, tenantId: true, storeId: true, offeringId: true },
      },
    },
  },
} satisfies Prisma.ServiceBookingEventSelect
const eventTypes = {
  arrive: "ARRIVED",
  cancel: "CANCELLED",
  complete: "COMPLETED",
  mark_no_show: "NO_SHOW",
  reschedule: "RESCHEDULED",
  start: "IN_SERVICE",
} as const
const eventStatuses = {
  arrive: "ARRIVED",
  cancel: "CANCELLED",
  complete: "COMPLETED",
  mark_no_show: "NO_SHOW",
  reschedule: "CONFIRMED",
  start: "IN_SERVICE",
} as const

/** Pure recovery: current read authority + exact immutable native proof, never command replay. */
export async function readServiceCommerceBookingHoldEffectInTransaction(
  tx: BookingTransaction,
  rawInput: StaffServiceCommerceBookingHoldInput,
) {
  const input = structuredClone(holdSchema.parse(rawInput))
  await assertStaffBookingCommandScopeInTransaction(tx, input)
  const row = await tx.serviceBookingHold.findFirst({
    where: {
      clientHoldId: input.clientOperationId,
      tenantId: input.tenantId,
      storeId: input.storeId,
    },
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      clientHoldId: true,
      createdByUserId: true,
      payloadHash: true,
      sourceType: true,
      sourceId: true,
      resourceId: true,
      capacity: true,
      bookingPolicyRevision: true,
      startAt: true,
      endAt: true,
      expiresAt: true,
      createdAt: true,
      offeringConfig: {
        select: { id: true, tenantId: true, storeId: true, offeringId: true },
      },
    },
  })
  if (!row) return null
  if (
    !scoped(row, input) ||
    row.clientHoldId !== input.clientOperationId ||
    row.createdByUserId !== input.actorUserId ||
    row.payloadHash !== bookingHoldCommandHash(input) ||
    row.sourceType !== "SERVICE_REQUEST" ||
    row.sourceId !== input.source.id ||
    row.offeringConfig.offeringId !== input.offeringId ||
    !scoped(row.offeringConfig, input) ||
    row.resourceId !== input.resourceId ||
    row.capacity !== input.quantity ||
    row.bookingPolicyRevision !== input.expectedConfigurationRevision ||
    iso(row.startAt) !== iso(input.slotStartAt) ||
    iso(row.endAt) !== iso(input.slotEndAt)
  )
    unavailable()
  await assertHistoricalSource(tx, input, row.sourceId)
  return holdReceipt.parse({
    kind: "hold_created",
    holdId: row.id,
    source: { kind: "service", id: row.sourceId },
    offeringId: row.offeringConfig.offeringId,
    origin: { tenantId: row.tenantId, storeId: row.storeId },
    resourceId: row.resourceId,
    quantity: row.capacity,
    configurationRevision: row.bookingPolicyRevision,
    startAt: iso(row.startAt),
    endAt: iso(row.endAt),
    expiresAt: iso(row.expiresAt),
    createdAt: iso(row.createdAt),
  })
}
function receipt(
  row: Prisma.ServiceBookingEventGetPayload<{ select: typeof eventSelect }>,
  operation: z.infer<typeof eventReceipt>["operation"],
  nextRevision: number,
) {
  const refund =
    operation === "cancel"
      ? {
          outcome:
            row.refundOutcome === "REFUND_ELIGIBLE"
              ? "refund_eligible"
              : row.refundOutcome === "MANUAL_REVIEW"
                ? "manual_review"
                : row.refundOutcome === "NONE"
                  ? "none"
                  : unavailable(),
          amountMinor: row.refundAmountMinor,
        }
      : null
  if (
    refund &&
    (refund.outcome === "refund_eligible") !== (refund.amountMinor !== null)
  )
    unavailable()
  return eventReceipt.parse({
    kind: "booking_event",
    operation,
    eventId: row.id,
    bookingId: row.bookingId,
    source: { kind: "service", id: row.booking.sourceId },
    offeringId: row.booking.offeringConfig.offeringId,
    origin: { tenantId: row.tenantId, storeId: row.storeId },
    revision: nextRevision,
    fromStatus: row.fromStatus?.toLowerCase() ?? null,
    toStatus: row.toStatus?.toLowerCase(),
    resourceId: row.nextResourceId,
    startAt: iso(row.nextStartAt),
    endAt: iso(row.nextEndAt),
    quantity: row.capacitySnapshot,
    timezone: row.booking.timezoneSnapshot,
    recordedAt: iso(row.effectiveAt),
    createdAt: iso(row.createdAt),
    policyRevisions: {
      offering: row.offeringPolicyRevisionSnapshot,
      payment: row.paymentPolicyRevisionSnapshot,
      cancellation: row.cancellationPolicyRevisionSnapshot,
    },
    refundConsequence: refund,
    notificationDelivery: "unverified",
  })
}
function ownedEvent(
  row: Prisma.ServiceBookingEventGetPayload<{ select: typeof eventSelect }>,
  input: {
    actorUserId: string
    tenantId: string
    storeId: string
    clientOperationId: string
  },
  payloadHash: string,
) {
  if (
    !scoped(row, input) ||
    !scoped(row.booking, input) ||
    !scoped(row.booking.offeringConfig, input) ||
    row.booking.id !== row.bookingId ||
    row.actorUserId !== input.actorUserId ||
    row.clientOperationId !== input.clientOperationId ||
    row.payloadHash !== payloadHash ||
    row.booking.sourceType !== "SERVICE_REQUEST"
  )
    unavailable()
}
export async function readServiceCommerceBookingConfirmationEffectInTransaction(
  tx: BookingTransaction,
  rawInput: StaffServiceCommerceBookingConfirmationInput,
) {
  const input = structuredClone(confirmationSchema.parse(rawInput))
  await assertStaffBookingCommandScopeInTransaction(tx, input)
  const row = await tx.serviceBookingEvent.findFirst({
    where: {
      clientOperationId: input.clientOperationId,
      tenantId: input.tenantId,
      storeId: input.storeId,
    },
    select: eventSelect,
  })
  if (!row) return null
  const payloadHash = bookingConfirmationCommandHash(input)
  ownedEvent(row, input, payloadHash)
  if (
    row.type !== "CONFIRMED" ||
    row.toStatus !== "CONFIRMED" ||
    row.booking.sourceId !== input.source.id ||
    row.booking.holdId !== input.holdId ||
    row.booking.clientBookingId !==
      (input.clientBookingId ?? input.clientOperationId) ||
    row.booking.payloadHash !== payloadHash
  )
    unavailable()
  await assertHistoricalSource(tx, input, row.booking.sourceId)
  return receipt(row, "confirm", 0)
}
export async function readServiceCommerceBookingRevisionEffectInTransaction(
  tx: BookingTransaction,
  rawInput: StaffServiceCommerceBookingRevisionInput,
) {
  const input = structuredClone(revisionSchema.parse(rawInput))
  await assertStaffBookingCommandScopeInTransaction(tx, input)
  const row = await tx.serviceBookingEvent.findFirst({
    where: {
      clientOperationId: input.clientOperationId,
      tenantId: input.tenantId,
      storeId: input.storeId,
    },
    select: eventSelect,
  })
  if (!row) return null
  ownedEvent(row, input, bookingRevisionCommandHash(input))
  if (
    row.bookingId !== input.bookingId ||
    row.type !== eventTypes[input.operation] ||
    row.toStatus !== eventStatuses[input.operation]
  )
    unavailable()
  if (
    input.operation === "reschedule" &&
    (row.nextResourceId !== input.resourceId ||
      iso(row.nextStartAt) !== iso(input.newSlotStartAt ?? null) ||
      iso(row.nextEndAt) !== iso(input.newSlotEndAt ?? null))
  )
    unavailable()
  await assertHistoricalSource(tx, input, row.booking.sourceId)
  return receipt(row, input.operation, input.expectedRevision + 1)
}
