import { expect, test } from "bun:test"
import {
  type GeneralBookingAction,
  generalBookingActionSchema,
} from "@ewatrade/assistant/general/booking-action"
import type { StaffServiceCommerceBookingReviewInput } from "@ewatrade/db/service-booking-command-review"
import {
  bookingConfirmationCommandHash,
  bookingHoldCommandHash,
  bookingRevisionCommandHash,
} from "../../../../packages/db/src/queries/service-commerce-bookings/booking-command-inputs"
import {
  confirmationSchema,
  holdSchema,
  revisionSchema,
} from "../../../../packages/db/src/queries/service-commerce-bookings/booking-command-schemas"
import { generalBookingNativeInput } from "./general-booking-input"

const scope = {
  actorUserId: "server-actor",
  tenantId: "server-tenant",
  storeId: "server-store",
}
const commandId = "original-server-operation"
const start = "2031-02-03T13:00:00.123000+01:00"
const end = "2031-02-03T13:30:00.123000+01:00"
const nativeStart = new Date("2031-02-03T12:00:00.123Z")
const nativeEnd = new Date("2031-02-03T12:30:00.123Z")
const reason = " CUSTOMER_REQUEST "
function hold(): GeneralBookingAction {
  return generalBookingActionSchema.parse({
    action: "service_booking_hold",
    source: { kind: "service", id: "request" },
    offeringId: "offering",
    resourceId: "resource",
    quantity: 10_000,
    expectedConfigurationRevision: 0,
    slotStartAt: start,
    slotEndAt: end,
  })
}
function build(
  raw: unknown,
  current: unknown = scope,
  operation: unknown = commandId,
): StaffServiceCommerceBookingReviewInput {
  return Reflect.apply(generalBookingNativeInput, undefined, [
    raw,
    current,
    operation,
  ])
}
function nativeHash(value: StaffServiceCommerceBookingReviewInput) {
  switch (value.kind) {
    case "hold":
      return bookingHoldCommandHash(holdSchema.parse(value.input))
    case "confirm":
      return bookingConfirmationCommandHash(
        confirmationSchema.parse(value.input),
      )
    case "revise":
      return bookingRevisionCommandHash(revisionSchema.parse(value.input))
  }
}
test("all eight actions map complete exact native fields and canonical hashes without IDs or links invented", () => {
  const common = {
    actorUserId: scope.actorUserId,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    clientOperationId: commandId,
  }
  const cases: Array<
    [GeneralBookingAction, StaffServiceCommerceBookingReviewInput]
  > = [
    [
      hold(),
      {
        kind: "hold",
        input: {
          ...common,
          source: { kind: "service", id: "request" },
          offeringId: "offering",
          resourceId: "resource",
          quantity: 10_000,
          expectedConfigurationRevision: 0,
          slotStartAt: nativeStart,
          slotEndAt: nativeEnd,
        },
      },
    ],
    [
      generalBookingActionSchema.parse({
        action: "service_booking_confirm",
        source: { kind: "service", id: "request" },
        holdId: "hold",
        quoteVersionId: "version",
        commercialOrderId: "order",
        serviceJobId: "job",
      }),
      {
        kind: "confirm",
        input: {
          ...common,
          source: { kind: "service", id: "request" },
          holdId: "hold",
          quoteVersionId: "version",
          commercialOrderId: "order",
          serviceJobId: "job",
        },
      },
    ],
    ...[
      "arrive",
      "start",
      "complete",
      "cancel",
      "mark_no_show",
      "reschedule",
    ].map(
      (
        operation,
      ): [GeneralBookingAction, StaffServiceCommerceBookingReviewInput] => {
        const withReason = ["cancel", "mark_no_show", "reschedule"].includes(
          operation,
        )
        const isReschedule = operation === "reschedule"
        const native = revisionSchema.parse({
          ...common,
          bookingId: "booking",
          expectedRevision: 0,
          operation,
          ...(withReason ? { reasonCode: reason } : {}),
          ...(isReschedule
            ? {
                resourceId: "next-resource",
                newSlotStartAt: nativeStart,
                newSlotEndAt: nativeEnd,
              }
            : {}),
        })
        const payload = generalBookingActionSchema.parse({
          action: `service_booking_${operation === "mark_no_show" ? "no_show" : operation}`,
          bookingId: "booking",
          expectedRevision: 0,
          ...(withReason ? { reasonCode: reason } : {}),
          ...(isReschedule
            ? {
                resourceId: "next-resource",
                newSlotStartAt: start,
                newSlotEndAt: end,
              }
            : {}),
        })
        return [payload, { kind: "revise", input: native }]
      },
    ),
  ]
  expect(cases).toHaveLength(8)
  for (const [payload, expected] of cases) {
    const original = structuredClone(payload)
    const actual = generalBookingNativeInput(payload, scope, commandId)
    expect(actual).toEqual(expected)
    expect(nativeHash(actual)).toBe(nativeHash(expected))
    expect(payload).toEqual(original)
    expect(actual.input.clientOperationId).toBe(commandId)
    for (const field of [
      "accessToken",
      "now",
      "issueCapabilityToken",
      "protectRecipient",
      "clientBookingId",
      "grants",
      "approvalToken",
    ])
      expect(Object.hasOwn(actual.input, field)).toBe(false)
  }
})
test("confirm optional native links remain absent unless provided; native canonical booking identity default is retained", () => {
  const payload = generalBookingActionSchema.parse({
    action: "service_booking_confirm",
    source: { kind: "service", id: "request" },
    holdId: "hold",
  })
  const actual = generalBookingNativeInput(payload, scope, commandId)
  expect(Object.keys(actual.input).sort()).toEqual([
    "actorUserId",
    "clientOperationId",
    "holdId",
    "source",
    "storeId",
    "tenantId",
  ])
  if (actual.kind !== "confirm") throw Error("Expected confirm")
  expect(bookingConfirmationCommandHash(actual.input)).toBe(
    bookingConfirmationCommandHash({
      ...actual.input,
      clientBookingId: commandId,
    }),
  )
  expect(Object.hasOwn(actual.input, "clientBookingId")).toBe(false)
})
test("full native191 opaque identities, quantity10000, Int revision boundaries and raw80-character reason survive", () => {
  const max = "原生 /:?=".padEnd(191, "n")
  const current = { actorUserId: max, tenantId: max, storeId: max }
  const held = build(
    {
      action: "service_booking_hold",
      source: { kind: "service", id: max },
      offeringId: max,
      resourceId: max,
      quantity: 10_000,
      expectedConfigurationRevision: 2_147_483_647,
      slotStartAt: start,
      slotEndAt: end,
    },
    current,
    max,
  )
  if (held.kind !== "hold") throw Error("Expected hold")
  expect(held.input).toMatchObject({
    actorUserId: max,
    tenantId: max,
    storeId: max,
    clientOperationId: max,
    source: { id: max },
    offeringId: max,
    resourceId: max,
    quantity: 10_000,
    expectedConfigurationRevision: 2_147_483_647,
  })
  expect(nativeHash(held)).toHaveLength(64)
  const confirm = build(
    {
      action: "service_booking_confirm",
      source: { kind: "service", id: max },
      holdId: max,
      commercialOrderId: max,
      quoteVersionId: max,
      serviceJobId: max,
    },
    current,
    max,
  )
  expect(confirm.input).toMatchObject({
    holdId: max,
    commercialOrderId: max,
    quoteVersionId: max,
    serviceJobId: max,
  })
  const rawReason = ` ${"R".repeat(78)} `
  const cancelled = build(
    {
      action: "service_booking_cancel",
      bookingId: max,
      expectedRevision: 2_147_483_646,
      reasonCode: rawReason,
    },
    current,
    max,
  )
  if (cancelled.kind !== "revise") throw Error("Expected revision")
  expect(cancelled.input.reasonCode).toBe(rawReason)
  expect(cancelled.input.expectedRevision).toBe(2_147_483_646)
  expect(cancelled.input.bookingId).toBe(max)
  expect(nativeHash(cancelled)).toHaveLength(64)
})
test("Date conversion preserves exact offset/milliseconds and never rounds finer nonzero precision", () => {
  for (const value of [
    "2031-02-03T12:00:00.123Z",
    "2031-02-03T12:00:00.123000000Z",
    "2031-02-03T13:00:00.123+01:00",
  ]) {
    const input = build({ ...hold(), slotStartAt: value })
    if (input.kind !== "hold") throw Error("Expected hold")
    expect(input.input.slotStartAt.getTime()).toBe(nativeStart.getTime())
  }
  for (const slotStartAt of [
    "2031-02-03T12:00:00.123001Z",
    "2031-02-03T13:00:00.123001+01:00",
    "2031-02-30T12:00:00Z",
    "not-time",
  ])
    expect(() => build({ ...hold(), slotStartAt })).toThrow()
  expect(() => build({ ...hold(), slotEndAt: start })).toThrow()
})
test("strict scope and editable payload reject smuggled authority/tokens/clocks/callbacks and invalid native bounds", () => {
  for (const extra of [
    { actorUserId: "foreign" },
    { tenantId: "foreign" },
    { storeId: "foreign" },
    { now: new Date() },
    { clientOperationId: "client" },
    { accessToken: "private" },
    { clientBookingId: "client" },
    { grants: [] },
    { issueCapabilityToken: () => "private" },
  ])
    expect(() => build({ ...hold(), ...extra })).toThrow()
  for (const extra of [
    { role: "OWNER" },
    { grants: [] },
    { userId: "foreign" },
    { now: new Date() },
    { accessToken: "private" },
  ])
    expect(() => build(hold(), { ...scope, ...extra })).toThrow()
  for (const field of ["actorUserId", "tenantId", "storeId"])
    for (const invalid of ["", " leading", "x".repeat(192)])
      expect(() => build(hold(), { ...scope, [field]: invalid })).toThrow()
  for (const invalid of ["", " leading", "x".repeat(192)])
    expect(() => build(hold(), scope, invalid)).toThrow()
  for (const change of [
    { quantity: 0 },
    { quantity: 10_001 },
    { quantity: 1.5 },
    { expectedConfigurationRevision: 2_147_483_648 },
    { resourceId: "x".repeat(192) },
    { source: { kind: "inquiry", id: "inquiry" } },
  ])
    expect(() => build({ ...hold(), ...change })).toThrow()
  expect(() =>
    build({
      action: "service_booking_start",
      bookingId: "b",
      expectedRevision: 2_147_483_647,
    }),
  ).toThrow()
  expect(() =>
    build({
      action: "service_booking_cancel",
      bookingId: "b",
      expectedRevision: 0,
      reasonCode: " ",
    }),
  ).toThrow()
  expect(() =>
    build({
      action: "service_booking_reschedule",
      bookingId: "b",
      expectedRevision: 0,
      reasonCode: "R",
      resourceId: "r",
      newSlotStartAt: start,
    }),
  ).toThrow()
})
test("server command identity is used verbatim without truncation, derivation or input/reference mutation", () => {
  const payload = hold()
  const firstId = `${"k".repeat(190)}A`
  const nextId = `${"k".repeat(190)}B`
  const first = generalBookingNativeInput(payload, scope, firstId)
  const next = generalBookingNativeInput(payload, scope, nextId)
  expect(first.input.clientOperationId).toBe(firstId)
  expect(next.input.clientOperationId).toBe(nextId)
  expect(first.input.clientOperationId).not.toBe(next.input.clientOperationId)
  if (first.kind !== "hold") throw Error("Expected hold")
  first.input.source.id = "changed native copy"
  first.input.slotStartAt.setUTCFullYear(2040)
  expect(payload).toEqual(hold())
  expect(scope).toEqual({
    actorUserId: "server-actor",
    tenantId: "server-tenant",
    storeId: "server-store",
  })
})
