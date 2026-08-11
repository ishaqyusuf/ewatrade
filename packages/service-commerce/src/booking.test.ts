import { describe, expect, test } from "bun:test"

import {
  assertServiceCommerceBookingTransition,
  deriveServiceCommerceBookingNextOperations,
  evaluateServiceCommerceBookingSlot,
  isServiceCommerceCustomerBookingCapabilityUsable,
  projectServiceCommerceBookingCancellationConsequence,
  projectServiceCommerceBookingNotificationIntent,
  serviceCommerceBookingCommandSchema,
  serviceCommerceBookingConfigurationFormSchema,
  serviceCommerceBookingConfigurationSchema,
  serviceCommerceBookingHoldCommandSchema,
  serviceCommerceBookingHoldSchema,
  serviceCommerceCustomerBookingCapabilitySchema,
} from "."

const scope = {
  source: { id: "request-1", kind: "service" as const },
  storeId: "store-1",
  tenantId: "tenant-1",
}

const configurationScope = {
  storeId: "store-1",
  tenantId: "tenant-1",
}

const configurationPolicies = {
  cancellationPolicy: {
    allowedUntilMinutesBeforeStart: 120,
    refundPolicy: "full_before_cutoff" as const,
    revision: 3,
  },
  paymentPolicy: {
    depositMinor: 5_000,
    requirement: "deposit" as const,
    revision: 4,
  },
}

const policySnapshot = {
  cancellation: {
    allowedUntilMinutesBeforeStart: 120,
    refundPolicy: "full_before_cutoff" as const,
    revision: 3,
  },
  payment: {
    currencyCode: "NGN",
    depositMinor: 5_000,
    payableAmountMinor: 20_000,
    requirement: "deposit" as const,
    requiredPaymentMinor: 5_000,
    revision: 4,
  },
}

describe("Service Commerce booking contracts", () => {
  test("provides a refinement-safe dashboard configuration schema", () => {
    expect(
      serviceCommerceBookingConfigurationFormSchema.parse({
        availabilityRules: [],
        bookingHorizonMinutes: 43_200,
        ...configurationPolicies,
        exceptions: [],
        holdDurationMinutes: 15,
        leadTimeMinutes: 60,
        offeringId: "offering-1",
        reminderLeadMinutes: 1_440,
        resources: [{ capacity: 1, id: "chair-1", label: "Chair 1" }],
        slotDurationMinutes: 30,
        timezone: "Africa/Lagos",
      }),
    ).toMatchObject({ offeringId: "offering-1" })
  })

  test("requires Store-owned timezone, resource capacity, recurring availability and exceptions", () => {
    expect(
      serviceCommerceBookingConfigurationSchema.parse({
        availabilityRules: [
          {
            daysOfWeek: [1, 2, 3, 4, 5],
            endLocalTime: "17:00",
            id: "weekday-hours",
            startLocalTime: "09:00",
          },
        ],
        exceptions: [
          {
            endAt: new Date("2026-08-13T10:00:00.000Z"),
            id: "closed-for-maintenance",
            kind: "closed",
            startAt: new Date("2026-08-13T09:00:00.000Z"),
          },
        ],
        bookingHorizonMinutes: 43_200,
        ...configurationPolicies,
        holdDurationMinutes: 15,
        leadTimeMinutes: 60,
        offeringId: "offering-1",
        paymentPolicy: configurationPolicies.paymentPolicy,
        reminderLeadMinutes: 1_440,
        resources: [{ capacity: 1, id: "chair-1", label: "Chair 1" }],
        slotDurationMinutes: 30,
        ...configurationScope,
        timezone: "Africa/Lagos",
      }),
    ).toMatchObject({ timezone: "Africa/Lagos" })

    expect(
      serviceCommerceBookingConfigurationSchema.safeParse({
        availabilityRules: [],
        exceptions: [],
        bookingHorizonMinutes: 30,
        cancellationPolicy: configurationPolicies.cancellationPolicy,
        holdDurationMinutes: 60,
        leadTimeMinutes: 0,
        reminderLeadMinutes: 1_440,
        offeringId: "offering-1",
        resources: [{ capacity: 0, id: "chair-1", label: "Chair 1" }],
        slotDurationMinutes: 30,
        ...configurationScope,
        timezone: "not/a-timezone",
      }).success,
    ).toBe(false)

    expect(
      serviceCommerceBookingConfigurationSchema.safeParse({
        availabilityRules: [],
        bookingHorizonMinutes: 43_201,
        cancellationPolicy: configurationPolicies.cancellationPolicy,
        exceptions: [],
        holdDurationMinutes: 10,
        leadTimeMinutes: 0,
        offeringId: "offering-1",
        paymentPolicy: configurationPolicies.paymentPolicy,
        reminderLeadMinutes: 1_440,
        resources: [{ capacity: 1, id: "chair-1", label: "Chair 1" }],
        slotDurationMinutes: 30,
        ...configurationScope,
        timezone: "Africa/Lagos",
      }).success,
    ).toBe(false)
  })

  test("projects only slots that meet lead-time, exception and inclusive resource-capacity rules", () => {
    const startAt = new Date("2026-08-12T10:00:00.000Z")
    const endAt = new Date("2026-08-12T10:30:00.000Z")
    const available = evaluateServiceCommerceBookingSlot({
      availability: {
        rules: [
          {
            daysOfWeek: [3],
            endLocalTime: "12:00",
            id: "morning",
            startLocalTime: "09:00",
          },
        ],
        timezone: "Africa/Lagos",
      },
      bookings: [{ endAt, quantity: 1, startAt, status: "confirmed" }],
      capacity: 2,
      endAt,
      holds: [],
      leadTimeMinutes: 30,
      now: new Date("2026-08-12T08:00:00.000Z"),
      startAt,
    })
    expect(available).toMatchObject({ eligible: true, remainingCapacity: 1 })

    expect(
      evaluateServiceCommerceBookingSlot({
        availability: {
          exceptions: [{ endAt, id: "closed-1", kind: "closed", startAt }],
          rules: [],
          timezone: "Africa/Lagos",
        },
        bookings: [],
        capacity: 1,
        endAt,
        holds: [],
        leadTimeMinutes: 0,
        now: new Date("2026-08-12T08:00:00.000Z"),
        startAt,
      }),
    ).toMatchObject({ eligible: false, reason: "exception_closed" })

    expect(
      evaluateServiceCommerceBookingSlot({
        availability: { rules: [], timezone: "Africa/Lagos" },
        bookings: [{ endAt, quantity: 1, startAt, status: "scheduled" }],
        capacity: 1,
        endAt,
        holds: [
          {
            expiresAt: new Date("2026-08-12T09:55:00.000Z"),
            endAt,
            quantity: 1,
            startAt,
            status: "active",
          },
        ],
        leadTimeMinutes: 0,
        now: new Date("2026-08-12T10:00:00.000Z"),
        startAt,
      }),
    ).toMatchObject({ eligible: false, reason: "capacity_exhausted" })
  })

  test("keeps atomic expiring holds distinct from booking and payment state", () => {
    expect(
      serviceCommerceBookingHoldCommandSchema.parse({
        clientOperationId: "hold-command-1",
        expectedConfigurationRevision: 8,
        operation: "hold_slot",
        quantity: 1,
        resourceId: "chair-1",
        slotEndAt: new Date("2026-08-12T10:30:00.000Z"),
        slotStartAt: new Date("2026-08-12T10:00:00.000Z"),
        ...scope,
      }),
    ).toMatchObject({ operation: "hold_slot" })
    expect(
      serviceCommerceBookingHoldSchema.parse({
        bookingPolicyRevision: 8,
        clientOperationId: "hold-1",
        expiresAt: new Date("2026-08-12T09:55:00.000Z"),
        holdId: "hold-1",
        quantity: 1,
        resourceId: "chair-1",
        slotEndAt: new Date("2026-08-12T10:30:00.000Z"),
        slotStartAt: new Date("2026-08-12T10:00:00.000Z"),
        status: "active",
        ...scope,
      }),
    ).toMatchObject({ status: "active" })

    expect(
      serviceCommerceBookingCommandSchema.parse({
        bookingId: "booking-1",
        clientOperationId: "confirm-1",
        expectedRevision: 0,
        holdId: "hold-1",
        operation: "confirm",
        orderId: "order-1",
        policySnapshot,
        quoteVersionId: "quote-version-1",
        serviceJobId: "job-1",
        resourceId: "chair-1",
        ...scope,
      }),
    ).toMatchObject({ operation: "confirm" })

    expect(
      serviceCommerceBookingCommandSchema.safeParse({
        bookingId: "booking-1",
        clientOperationId: "confirm-1",
        expectedRevision: 0,
        holdId: "hold-1",
        operation: "confirm",
        ...scope,
      }).success,
    ).toBe(false)
    expect(
      serviceCommerceBookingCommandSchema.safeParse({
        bookingId: "booking-1",
        clientOperationId: "bad-full-1",
        expectedRevision: 0,
        holdId: "hold-1",
        operation: "confirm",
        policySnapshot: {
          cancellation: policySnapshot.cancellation,
          payment: {
            currencyCode: "NGN",
            depositMinor: 1,
            payableAmountMinor: 20_000,
            requirement: "full",
            requiredPaymentMinor: 5_000,
            revision: 4,
          },
        },
        resourceId: "chair-1",
        ...scope,
      }).success,
    ).toBe(false)
  })

  test("uses revision-guarded lifecycle commands and does not infer payment completion", () => {
    const reschedule = serviceCommerceBookingCommandSchema.parse({
      bookingId: "booking-1",
      clientOperationId: "reschedule-1",
      expectedRevision: 4,
      newSlotEndAt: new Date("2026-08-13T10:30:00.000Z"),
      newSlotStartAt: new Date("2026-08-13T10:00:00.000Z"),
      operation: "reschedule",
      reasonCode: "customer_request",
      resourceId: "chair-1",
      ...scope,
    })
    expect(reschedule).toMatchObject({
      expectedRevision: 4,
      operation: "reschedule",
    })
    expect(
      serviceCommerceBookingCommandSchema.safeParse({
        bookingId: "booking-1",
        clientOperationId: "cancel-1",
        expectedRevision: 4,
        operation: "cancel",
        reasonCode: "",
        resourceId: "chair-1",
        ...scope,
      }).success,
    ).toBe(false)

    expect(() =>
      assertServiceCommerceBookingTransition("completed", "in_service"),
    ).toThrow()
    expect(deriveServiceCommerceBookingNextOperations("confirmed")).toEqual([
      "arrive",
      "reschedule",
      "cancel",
      "mark_no_show",
    ])
  })

  test("evaluates local schedule around DST and releases expired capacity", () => {
    const startAt = new Date("2026-03-08T14:00:00.000Z")
    const endAt = new Date("2026-03-08T14:30:00.000Z")
    expect(
      evaluateServiceCommerceBookingSlot({
        availability: {
          rules: [
            {
              daysOfWeek: [0],
              endLocalTime: "11:00",
              id: "sunday",
              startLocalTime: "09:00",
            },
          ],
          timezone: "America/New_York",
        },
        bookings: [],
        capacity: 1,
        endAt,
        holds: [
          {
            endAt,
            expiresAt: new Date("2026-03-08T13:59:00.000Z"),
            quantity: 1,
            startAt,
            status: "active",
          },
        ],
        leadTimeMinutes: 0,
        now: new Date("2026-03-08T14:00:00.000Z"),
        startAt,
      }),
    ).toEqual({ eligible: true, remainingCapacity: 1 })
  })

  test("permits explicit opening exceptions and applies a single capacity override", () => {
    const startAt = new Date("2026-08-12T10:00:00.000Z")
    const endAt = new Date("2026-08-12T10:30:00.000Z")
    expect(
      evaluateServiceCommerceBookingSlot({
        availability: {
          exceptions: [
            { endAt, id: "open-extra", kind: "open", startAt },
            {
              capacity: 2,
              endAt,
              id: "capacity-extra",
              kind: "capacity_override",
              startAt,
            },
          ],
          rules: [],
          timezone: "Africa/Lagos",
        },
        bookings: [{ endAt, quantity: 1, startAt, status: "confirmed" }],
        capacity: 1,
        endAt,
        holds: [],
        leadTimeMinutes: 0,
        now: new Date("2026-08-12T08:00:00.000Z"),
        startAt,
      }),
    ).toEqual({ eligible: true, remainingCapacity: 1 })
  })

  test("uses expiring revocable customer capabilities and safe refund consequences", () => {
    const capability = {
      bookingId: "booking-1",
      expiresAt: new Date("2026-08-12T11:00:00.000Z"),
      offeringId: "offering-1",
      purpose: "view_and_manage" as const,
      revokedAt: null,
      source: scope.source,
      stateRevision: 4,
      tokenId: "capability-1",
    }
    expect(
      isServiceCommerceCustomerBookingCapabilityUsable({
        capability,
        currentStateRevision: 4,
        now: new Date("2026-08-12T10:00:00.000Z"),
        purpose: "view_and_manage",
      }),
    ).toBe(true)
    expect(
      isServiceCommerceCustomerBookingCapabilityUsable({
        capability: {
          ...capability,
          revokedAt: new Date("2026-08-12T10:01:00.000Z"),
        },
        currentStateRevision: 4,
        now: new Date("2026-08-12T10:02:00.000Z"),
        purpose: "view_and_manage",
      }),
    ).toBe(false)
    expect(
      projectServiceCommerceBookingCancellationConsequence({
        bookingId: "booking-1",
        cancellationAllowed: true,
        policy: "full_before_cutoff",
        refundableAmountMinor: 5_000,
        stateRevision: 4,
      }),
    ).toMatchObject({
      refundAmountMinor: 5_000,
      refundOutcome: "refund_eligible",
    })
  })

  test("creates safe provider-neutral notification intent facts only", () => {
    expect(
      projectServiceCommerceBookingNotificationIntent({
        bookingId: "booking-1",
        event: "rescheduled",
        scheduledEndAt: new Date("2026-08-13T10:30:00.000Z"),
        scheduledStartAt: new Date("2026-08-13T10:00:00.000Z"),
        stateRevision: 5,
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).toEqual({
      bookingId: "booking-1",
      kind: "booking_change",
      scheduledEndAt: new Date("2026-08-13T10:30:00.000Z"),
      scheduledStartAt: new Date("2026-08-13T10:00:00.000Z"),
      stateRevision: 5,
      storeId: "store-1",
      tenantId: "tenant-1",
    })
  })

  test("allows an expiring source-scoped slot capability before a booking exists", () => {
    expect(
      serviceCommerceCustomerBookingCapabilitySchema.parse({
        expiresAt: new Date("2026-08-13T10:00:00.000Z"),
        offeringId: "offering-1",
        purpose: "view_slots",
        revokedAt: null,
        source: scope.source,
        stateRevision: 2,
        tokenId: "slot-capability-1",
      }),
    ).toMatchObject({ purpose: "view_slots" })
  })
})
