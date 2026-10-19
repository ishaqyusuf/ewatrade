import { expect, test } from "bun:test"
import {
  generalBookingActionSchema,
  generalBookingNativeOperation,
  generalBookingReceiptSchema,
} from "./booking-action"

const source = { kind: "service", id: "request" }
const start = "2031-02-03T13:00:00.123+01:00"
const end = "2031-02-03T13:30:00.123+01:00"
const hold = {
  action: "service_booking_hold",
  source,
  offeringId: "offering",
  resourceId: "resource",
  quantity: 10_000,
  expectedConfigurationRevision: 0,
  slotStartAt: start,
  slotEndAt: end,
}
test("all eight exact intentions retain full native fields and capacities without creating execution authority", () => {
  const cases = [
    hold,
    {
      action: "service_booking_confirm",
      source,
      holdId: "hold",
      quoteVersionId: "version",
      commercialOrderId: "order",
      serviceJobId: "job",
    },
    ...["arrive", "start", "complete"].map((op) => ({
      action: `service_booking_${op}`,
      bookingId: "booking",
      expectedRevision: 0,
    })),
    ...["cancel", "no_show"].map((op) => ({
      action: `service_booking_${op}`,
      bookingId: "booking",
      expectedRevision: 0,
      reasonCode: " CUSTOMER_REQUEST ",
    })),
    {
      action: "service_booking_reschedule",
      bookingId: "booking",
      expectedRevision: 0,
      reasonCode: "CUSTOMER_REQUEST",
      resourceId: "next-resource",
      newSlotStartAt: start,
      newSlotEndAt: end,
    },
  ]
  expect(cases).toHaveLength(8)
  expect(
    cases.map((raw) =>
      generalBookingNativeOperation(
        generalBookingActionSchema.parse(raw).action,
      ),
    ),
  ).toEqual([
    "hold_slot",
    "confirm",
    "arrive",
    "start",
    "complete",
    "cancel",
    "mark_no_show",
    "reschedule",
  ])
  for (const raw of cases)
    expect<unknown>(generalBookingActionSchema.parse(raw)).toEqual(raw)
})
test("native191 opaque IDs preserve exact punctuation;192, whitespace, fractional quantity and Int overflow refuse", () => {
  const id = "原生:?=".padEnd(191, "n")
  expect(
    generalBookingActionSchema.parse({ ...hold, resourceId: id }),
  ).toHaveProperty("resourceId", id)
  for (const change of [
    { resourceId: `${id}x` },
    { resourceId: " resource" },
    { quantity: 10_001 },
    { quantity: 1.1 },
    { quantity: 0 },
    { expectedConfigurationRevision: 2_147_483_648 },
    { slotEndAt: start },
    { slotStartAt: "invalid" },
    { slotStartAt: "2031-02-03T12:00:00.1234Z" },
  ])
    expect(
      generalBookingActionSchema.safeParse({ ...hold, ...change }).success,
    ).toBe(false)
  expect(
    generalBookingActionSchema.safeParse({
      ...hold,
      expectedConfigurationRevision: 2_147_483_647,
    }).success,
  ).toBe(true)
})
test("strict actions reject authority, tokens, omitted reschedule interval and unsupported lifecycle fields", () => {
  for (const extra of [
    { tenantId: "other" },
    { actorUserId: "actor" },
    { storeId: "store" },
    { accessToken: "private" },
    { now: start },
    { clientOperationId: "new" },
    { approve: true },
    { excludeBookingId: "other" },
  ])
    expect(
      generalBookingActionSchema.safeParse({ ...hold, ...extra }).success,
    ).toBe(false)
  for (const raw of [
    {
      action: "service_booking_cancel",
      bookingId: "booking",
      expectedRevision: 0,
      reasonCode: " ",
    },
    {
      action: "service_booking_arrive",
      bookingId: "booking",
      expectedRevision: 0,
      resourceId: "other",
    },
    {
      action: "service_booking_start",
      bookingId: "booking",
      expectedRevision: 2_147_483_647,
    },
    {
      action: "service_booking_reschedule",
      bookingId: "booking",
      expectedRevision: 0,
      reasonCode: "R",
      resourceId: "r",
      newSlotStartAt: start,
    },
    { ...hold, source: { kind: "inquiry", id: "inquiry" } },
  ])
    expect(generalBookingActionSchema.safeParse(raw).success).toBe(false)
})
test("safe exact canonical hold/event receipts survive JSON history without delivery/payment claims or credentials", () => {
  const common = {
    source,
    offeringId: "offering",
    origin: { tenantId: "tenant", storeId: "store" },
    resourceId: "resource",
    quantity: 10_000,
    startAt: start,
    endAt: end,
    createdAt: start,
  }
  const effects = [
    {
      ...common,
      kind: "hold_created",
      holdId: "hold",
      configurationRevision: 0,
      expiresAt: start,
    },
    {
      ...common,
      kind: "booking_event",
      operation: "cancel",
      eventId: "event",
      bookingId: "booking",
      revision: 2_147_483_647,
      fromStatus: "confirmed",
      toStatus: "cancelled",
      timezone: "Africa/Lagos",
      recordedAt: start,
      policyRevisions: { offering: 0, payment: 0, cancellation: 0 },
      refundConsequence: { outcome: "refund_eligible", amountMinor: 0 },
      notificationDelivery: "unverified",
    },
  ]
  for (const effect of effects) {
    const raw = { kind: "service_booking_command", effect }
    expect<unknown>(
      generalBookingReceiptSchema.parse(JSON.parse(JSON.stringify(raw))),
    ).toEqual(raw)
    for (const extra of [
      { accessToken: "token" },
      { recipientCiphertext: "cipher" },
      { delivered: true },
      { paymentSettled: true },
      { notificationDispatches: [] },
    ])
      expect(
        generalBookingReceiptSchema.safeParse({
          ...raw,
          effect: { ...effect, ...extra },
        }).success,
      ).toBe(false)
  }
})
