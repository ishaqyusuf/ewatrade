import { describe, expect, test } from "bun:test"

import {
  serviceCommerceBookingConfigurationUpdateSchema,
  serviceCommercePublicBookingHoldSchema,
  serviceCommercePublicBookingReviseSchema,
  serviceCommerceStaffBookingConfirmSchema,
} from "./service-commerce-bookings"

describe("Service Commerce booking API schemas", () => {
  test("keeps public hold scope capability-only", () => {
    const parsed = serviceCommercePublicBookingHoldSchema.parse({
      accessToken: "x".repeat(20),
      clientOperationId: "hold-1",
      expectedConfigurationRevision: 1,
      offeringId: "offering-1",
      quantity: 1,
      resourceId: "resource-1",
      slotEndAt: "2026-08-12T11:00:00.000Z",
      slotStartAt: "2026-08-12T10:00:00.000Z",
    })
    expect(parsed).not.toHaveProperty("tenantId")
    expect(
      serviceCommercePublicBookingHoldSchema.safeParse({
        ...parsed,
        tenantId: "tenant-1",
      }).success,
    ).toBe(false)
  })

  test("requires operational reasons and a full reschedule slot", () => {
    expect(
      serviceCommercePublicBookingReviseSchema.safeParse({
        accessToken: "x".repeat(20),
        bookingId: "booking-1",
        clientOperationId: "cancel-1",
        expectedRevision: 1,
        operation: "cancel",
      }).success,
    ).toBe(false)
    expect(
      serviceCommercePublicBookingReviseSchema.safeParse({
        accessToken: "x".repeat(20),
        bookingId: "booking-1",
        clientOperationId: "complete-1",
        expectedRevision: 1,
        operation: "complete",
      }).success,
    ).toBe(false)
  })

  test("rejects caller-provided customer contact", () => {
    expect(
      serviceCommerceStaffBookingConfirmSchema.safeParse({
        clientOperationId: "confirm-1",
        customerContact: "+2348000000000",
        holdId: "hold-1",
        source: { id: "request-1", kind: "service" },
      }).success,
    ).toBe(false)
  })

  test("discards echoed client policy revisions", () => {
    const base = {
      availabilityRules: [],
      bookingHorizonMinutes: 43_200,
      cancellationPolicy: {
        allowedUntilMinutesBeforeStart: 60,
        refundPolicy: "full_before_cutoff",
      },
      clientOperationId: "configuration-1",
      exceptions: [],
      expectedRevision: 2,
      holdDurationMinutes: 10,
      leadTimeMinutes: 0,
      offeringId: "offering-1",
      paymentPolicy: { depositMinor: 5_000, requirement: "deposit" },
      reminderLeadMinutes: 1_440,
      resources: [{ capacity: 1, id: "resource-1", label: "Room" }],
      slotDurationMinutes: 60,
      timezone: "Africa/Lagos",
    }
    expect(
      serviceCommerceBookingConfigurationUpdateSchema.parse(base),
    ).toMatchObject(base)
    const parsed = serviceCommerceBookingConfigurationUpdateSchema.parse({
      ...base,
      cancellationPolicy: { ...base.cancellationPolicy, revision: 999 },
      paymentPolicy: { ...base.paymentPolicy, revision: 999 },
    })
    expect(parsed.cancellationPolicy).not.toHaveProperty("revision")
    expect(parsed.paymentPolicy).not.toHaveProperty("revision")
  })
})
