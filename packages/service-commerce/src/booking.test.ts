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

describe("complete half-open booking availability", () => {
  function assess(
    input: Pick<
      Parameters<typeof evaluateServiceCommerceBookingSlot>[0],
      "startAt" | "endAt" | "availability"
    >,
  ) {
    return evaluateServiceCommerceBookingSlot({
      ...input,
      capacity: 2,
      bookings: [],
      holds: [],
      leadTimeMinutes: 0,
      now: new Date("2026-01-01T00:00:00Z"),
    })
  }
  test("adjacent weekly hours form a union but same weekday a week later does not prove the interval", () => {
    const rules = [
      {
        id: "morning",
        daysOfWeek: [1],
        startLocalTime: "09:00",
        endLocalTime: "10:00",
      },
      {
        id: "later",
        daysOfWeek: [1],
        startLocalTime: "10:00",
        endLocalTime: "11:00",
      },
    ]
    expect(
      assess({
        startAt: new Date("2026-10-12T09:30:00Z"),
        endAt: new Date("2026-10-12T10:30:00Z"),
        availability: { rules, timezone: "UTC" },
      }),
    ).toEqual({ eligible: true, remainingCapacity: 2 })
    for (const endAt of ["2026-10-19T10:00:00Z", "2026-11-02T10:00:00Z"])
      expect(
        assess({
          startAt: new Date("2026-10-12T09:00:00Z"),
          endAt: new Date(endAt),
          availability: { rules, timezone: "UTC" },
        }),
      ).toMatchObject({ eligible: false, reason: "outside_availability" })
  })
  test("partial opening never opens uncovered time; adjacent openings can complete recurring hours across midnight", () => {
    const startAt = new Date("2026-10-12T23:30:00Z")
    const endAt = new Date("2026-10-13T00:30:00Z")
    const rules = [
      {
        id: "monday",
        daysOfWeek: [1],
        startLocalTime: "22:00",
        endLocalTime: "23:59",
      },
      {
        id: "tuesday",
        daysOfWeek: [2],
        startLocalTime: "00:00",
        endLocalTime: "01:00",
      },
    ]
    expect(
      assess({
        startAt,
        endAt,
        availability: {
          rules,
          timezone: "UTC",
          exceptions: [
            {
              id: "part",
              kind: "open",
              startAt,
              endAt: new Date("2026-10-12T23:59:30Z"),
            },
          ],
        },
      }),
    ).toMatchObject({ eligible: false, reason: "outside_availability" })
    const opening = {
      id: "bridge",
      kind: "open" as const,
      startAt: new Date("2026-10-12T23:59:00Z"),
      endAt: new Date("2026-10-13T00:00:00Z"),
    }
    expect(
      assess({
        startAt,
        endAt,
        availability: { rules, timezone: "UTC", exceptions: [opening] },
      }),
    ).toEqual({ eligible: true, remainingCapacity: 2 })
    expect(
      assess({
        startAt,
        endAt,
        availability: {
          rules,
          timezone: "UTC",
          exceptions: [
            opening,
            {
              id: "closed",
              kind: "closed",
              startAt: new Date("2026-10-12T23:59:59.999Z"),
              endAt,
            },
          ],
        },
      }),
    ).toMatchObject({ eligible: false, reason: "exception_closed" })
  })
  test("opening unions retain exact subsecond gaps and weekly closing endpoints are exclusive", () => {
    const startAt = new Date("2026-10-12T09:00:00Z")
    const endAt = new Date("2026-10-12T10:00:00Z")
    const rules = [
      {
        id: "elsewhere",
        daysOfWeek: [1],
        startLocalTime: "12:00",
        endLocalTime: "13:00",
      },
    ]
    const openings = [
      {
        id: "first",
        kind: "open" as const,
        startAt,
        endAt: new Date("2026-10-12T09:30:00Z"),
      },
      {
        id: "second",
        kind: "open" as const,
        startAt: new Date("2026-10-12T09:30:00Z"),
        endAt,
      },
    ]
    expect(
      assess({
        startAt,
        endAt,
        availability: { rules, timezone: "UTC", exceptions: openings },
      }),
    ).toMatchObject({ eligible: true })
    const second = openings[1]
    if (!second) throw Error("Expected adjacent opening")
    openings[1] = {
      ...second,
      startAt: new Date("2026-10-12T09:30:00.001Z"),
    }
    expect(
      assess({
        startAt,
        endAt,
        availability: { rules, timezone: "UTC", exceptions: openings },
      }),
    ).toMatchObject({ eligible: false, reason: "outside_availability" })
    const weekly = [
      {
        id: "morning",
        daysOfWeek: [1],
        startLocalTime: "09:00",
        endLocalTime: "10:00",
      },
    ]
    expect(
      assess({
        startAt: new Date("2026-10-12T09:59:59.999Z"),
        endAt,
        availability: { rules: weekly, timezone: "UTC" },
      }),
    ).toMatchObject({ eligible: true })
    expect(
      assess({
        startAt,
        endAt: new Date(endAt.getTime() + 1),
        availability: { rules: weekly, timezone: "UTC" },
      }),
    ).toMatchObject({ eligible: false, reason: "outside_availability" })
  })
  test("DST folds check repeated local minutes and spring gaps keep the supplied exact UTC instants", () => {
    const timezone = "America/New_York"
    expect(
      assess({
        startAt: new Date("2026-11-01T05:45:00Z"),
        endAt: new Date("2026-11-01T06:45:00Z"),
        availability: {
          timezone,
          rules: [
            {
              id: "narrow",
              daysOfWeek: [0],
              startLocalTime: "01:30",
              endLocalTime: "02:30",
            },
          ],
        },
      }),
    ).toMatchObject({ eligible: false, reason: "outside_availability" })
    expect(
      assess({
        startAt: new Date("2026-11-01T05:00:00Z"),
        endAt: new Date("2026-11-01T07:00:00Z"),
        availability: {
          timezone,
          rules: [
            {
              id: "fold",
              daysOfWeek: [0],
              startLocalTime: "01:00",
              endLocalTime: "02:00",
            },
          ],
        },
      }),
    ).toMatchObject({ eligible: true })
    expect(
      assess({
        startAt: new Date("2026-03-08T06:45:00Z"),
        endAt: new Date("2026-03-08T07:15:00Z"),
        availability: {
          timezone,
          rules: [
            {
              id: "gap",
              daysOfWeek: [0],
              startLocalTime: "01:30",
              endLocalTime: "03:30",
            },
          ],
        },
      }),
    ).toMatchObject({ eligible: true })
    expect(
      assess({
        startAt: new Date("2026-03-08T06:30:00Z"),
        endAt: new Date("2026-03-08T07:00:00Z"),
        availability: {
          timezone,
          rules: [
            {
              id: "before-gap",
              daysOfWeek: [0],
              startLocalTime: "01:30",
              endLocalTime: "02:00",
            },
          ],
        },
      }),
    ).toMatchObject({ eligible: true })
  })
  test("conservative overlap-sum capacity and conflicting override policy remain unchanged", () => {
    const startAt = new Date("2026-10-12T09:00:00Z")
    const endAt = new Date("2026-10-12T10:00:00Z")
    const base = {
      startAt,
      endAt,
      now: new Date("2026-10-12T08:00:00Z"),
      leadTimeMinutes: 0,
      capacity: 2,
      availability: { timezone: "UTC", rules: [] },
      holds: [],
    }
    expect(
      evaluateServiceCommerceBookingSlot({
        ...base,
        bookings: [
          {
            startAt,
            endAt: new Date("2026-10-12T09:30:00Z"),
            quantity: 1,
            status: "confirmed",
          },
          {
            startAt: new Date("2026-10-12T09:30:00Z"),
            endAt,
            quantity: 1,
            status: "confirmed",
          },
        ],
      }),
    ).toMatchObject({ eligible: false, reason: "capacity_exhausted" })
    expect(
      evaluateServiceCommerceBookingSlot({
        ...base,
        bookings: [],
        availability: {
          ...base.availability,
          exceptions: [
            {
              id: "one",
              kind: "capacity_override",
              capacity: 2,
              startAt,
              endAt: new Date("2026-10-12T09:30:00Z"),
            },
            {
              id: "two",
              kind: "capacity_override",
              capacity: 3,
              startAt: new Date("2026-10-12T09:30:00Z"),
              endAt,
            },
          ],
        },
      }),
    ).toMatchObject({ eligible: false, reason: "ambiguous_exception" })
  })
})
