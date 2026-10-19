import { expect, test } from "bun:test"
import {
  generalBookingReviewDecimalSchema as decimal,
  generalBookingReviewObservationsSchema,
  generalBookingReviewSchema as schema,
} from "./booking-review"

function hold() {
  const at = "2031-02-03T10:00:00.000Z"
  return {
    format: "general_booking_review_v1",
    action: "service_booking_hold",
    draft: {
      ref: "draft",
      revision: 1,
      conversationId: " 原始 chat /? ",
      expiresAt: at,
    },
    source: { id: "request", revision: 1, status: "SUBMITTED" },
    coverage: {
      complete: true,
      workLines: 0,
      workChanges: 0,
      obligations: null,
      obligationWorkLines: 0,
      productFulfillments: 0,
      pendingReminders: 0,
    },
    details: {
      kind: "hold",
      slot: {
        configuration: {
          offeringId: "offering",
          revision: 0,
          status: "ACTIVE",
          durationMinutes: 30,
          leadTimeMinutes: 0,
          bookingHorizonMinutes: 1440,
          holdDurationMinutes: 10,
          paymentRequirement: "NONE",
          depositAmountMinor: null,
          paymentPolicyRevision: 0,
          cancellationPolicyRevision: 0,
          cancellationWindowMinutes: 120,
          refundPolicy: "NONE",
          capacity: 1,
          createdAt: at,
          updatedAt: at,
          resources: [{ resourceId: "resource", capacityRequired: 1 }],
        },
        resource: {
          id: "resource",
          name: "Exact room",
          kind: "ROOM",
          capacity: 2,
          revision: 0,
        },
        settings: {
          revision: 0,
          timezone: "UTC",
          defaultSlotInterval: 30,
          defaultHoldMinutes: 10,
          reminderLeadMinutes: 0,
        },
        evaluation: { eligible: true, reason: null, remainingCapacity: 2 },
      },
      effects: {
        quantity: 10_000,
        source: { kind: "service", id: "request" },
        offeringId: "offering",
        resourceId: "resource",
        startAt: at,
        endAt: "2031-02-03T10:30:00.000Z",
        expiryRule: { beforeSlotMilliseconds: 1, holdDurationMinutes: 10 },
        reservation: "temporary_hold",
        bookingCreated: false,
        payment: "not_checked",
        notification: "none",
        privateAccess: "private_confirm_created",
      },
    },
  }
}
test("strict safe display preserves native191 exact opaque business refs and existing opaque conversation128", () => {
  const value = hold()
  const exact = " 订单 /? 🌍 ".padEnd(191, "x")
  value.source.id = exact
  value.draft.conversationId = " chat /? ".padEnd(128, " ")
  const parsed = schema.parse(value)
  expect(parsed.source.id).toBe(exact)
  expect(parsed.draft.conversationId).toBe(value.draft.conversationId)
  expect(schema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed)
  value.source.id += "x"
  expect(schema.safeParse(value).success).toBe(false)
  value.source.id = exact
  value.draft.conversationId += "x"
  expect(schema.safeParse(value).success).toBe(false)
})
test("Decimal38,6 lexical validation preserves exact values and scientific notation without float conversion", () => {
  for (const value of [
    "0",
    "0.000001",
    "9007199254740993.000001",
    `${"9".repeat(32)}.123456`,
    "1e+31",
    "1.000000e-6",
    "0001.000000",
  ])
    expect(decimal.parse(value)).toBe(value)
  for (const value of [
    "1e+32",
    "9".repeat(33),
    "0.0000001",
    "1e-7",
    "-1",
    "NaN",
    "Infinity",
    " 1",
    "1_000",
    "1.",
    "1e9999",
  ])
    expect(decimal.safeParse(value).success).toBe(false)
  expect(decimal.safeParse(0.1).success).toBe(false)
})
test("private extras, unknown variants, coercions and fabricated complete section counts refuse", () => {
  for (const value of [
    { ...hold(), authority: {} },
    { ...hold(), target: { id: "x", revision: "PRIVATE" } },
    { ...hold(), action: "service_booking_future" },
    { ...hold(), coverage: { ...hold().coverage, workLines: 1 } },
    { ...hold(), source: { ...hold().source, status: "FUTURE" } },
    { ...hold(), draft: { ...hold().draft, revision: "1" } },
  ])
    expect(schema.safeParse(value).success).toBe(false)
  const nested = hold()
  Reflect.set(nested.details.slot, "reservationFacts", {
    holds: ["PRIVATE_OTHER_CUSTOMER"],
  })
  expect(schema.safeParse(nested).success).toBe(false)
})
test("generated observations are explicit separate display facts, not semantic document fields", () => {
  const observations = {
    asOf: "2031-02-03T08:00:00.000Z",
    observedHoldExpiresAt: "2031-02-03T08:10:00.000Z",
  }
  expect(generalBookingReviewObservationsSchema.parse(observations)).toEqual(
    observations,
  )
  expect(
    generalBookingReviewObservationsSchema.safeParse({
      ...observations,
      targetRevision: "PRIVATE",
    }).success,
  ).toBe(false)
  expect(schema.safeParse({ ...hold(), asOf: observations.asOf }).success).toBe(
    false,
  )
  const value = hold()
  Reflect.set(
    value.details.effects,
    "observedExpiresAt",
    observations.observedHoldExpiresAt,
  )
  expect(schema.safeParse(value).success).toBe(false)
})
