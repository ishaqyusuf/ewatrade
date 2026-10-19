import { describe, expect, spyOn, test } from "bun:test"
import { serviceCommerceBookingConfigurationSchema } from "@ewatrade/service-commerce"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  ServiceCommerceBookingError,
  bookingTokenDigest,
  claimServiceCommerceBookingNotificationIntent,
  confirmServiceCommerceBooking,
  createServiceCommerceBookingHold,
  failServiceCommerceBookingNotificationIntent,
  getPublicServiceCommerceBooking,
  getPublicServiceCommerceBookingSlots,
  getServiceCommerceBookingConfiguration,
  listServiceCommerceBookingReminderScopes,
  reconcileServiceCommerceBookingPaymentInTransaction,
  reviseServiceCommerceBooking,
  scheduleDueServiceCommerceBookingReminderIntents,
  updateServiceCommerceBookingConfiguration,
} from "./service-commerce-bookings"
import { readStaffServiceCommerceBookingAvailabilityInTransaction } from "./service-commerce-bookings/staff-availability"
import {
  bookingAvailabilityFixture,
  field as bookingField,
  matches as bookingMatches,
} from "./test-helpers/booking-availability"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"

const scope = {
  storeId: "store-1",
  tenantId: "tenant-1",
}

const source = { id: "request-1", kind: "service" as const }
const now = new Date("2031-02-03T08:00:00.000Z")
const slot = {
  endAt: new Date("2031-02-03T11:00:00.000Z"),
  startAt: new Date("2031-02-03T10:00:00.000Z"),
}

function issueCapabilityToken(input: { clientOperationId: string }) {
  return `capability:${input.clientOperationId}`
}

function allowedPolicyFakes() {
  return {
    serviceCommercePolicyAuditEvent: { createMany: async () => ({ count: 1 }) },
    serviceCommercePolicyDecision: {
      findMany: async () => allowedServiceCommercePolicyDecisionRows(),
    },
    serviceCommerceStoreProfile: {
      findFirst: async () => ({
        bookingEnabled: true,
        id: "profile-1",
        status: "ACTIVE",
      }),
    },
    serviceCommerceStoreTeamAssignment: {
      findFirst: async () => ({ membership: { userId: "attendant-1" } }),
    },
  }
}

function activeConfiguration(overrides: Record<string, unknown> = {}) {
  return {
    cancellationPolicyRevision: 3,
    cancellationRefundPercent: 100,
    cancellationWindowMinutes: 120,
    capacity: 1,
    depositAmountMinor: 5_000,
    durationMinutes: 60,
    id: "config-1",
    leadTimeMinutes: 0,
    bookingHorizonMinutes: 43_200,
    holdDurationMinutes: 10,
    offeringId: "offering-1",
    paymentPolicyRevision: 2,
    paymentRequirement: "DEPOSIT",
    revision: 4,
    refundPolicy: "FULL_BEFORE_CUTOFF",
    resources: [{ resourceId: "resource-1", resource: activeResource() }],
    store: {
      serviceBookingAvailabilityExceptions: [],
      serviceBookingAvailabilityRules: [],
      serviceBookingSettings: {
        id: "settings-1",
        reminderLeadMinutes: 1_440,
        revision: 2,
        timezone: "Africa/Lagos",
      },
    },
    status: "ACTIVE",
    ...scope,
    ...overrides,
  }
}

function activeResource(overrides: Record<string, unknown> = {}) {
  return {
    availability: [],
    capacity: 1,
    exceptions: [],
    id: "resource-1",
    name: "Room one",
    revision: 7,
    status: "ACTIVE",
    ...scope,
    ...overrides,
  }
}

function holdRow(overrides: Record<string, unknown> = {}) {
  return {
    accessCapability: { id: "confirm-capability-1", tokenDigest: "irrelevant" },
    accessCapabilityId: "confirm-capability-1",
    bookingPolicyRevision: 4,
    capacity: 1,
    clientHoldId: "hold-operation-1",
    expiresAt: new Date("2031-02-03T09:00:00.000Z"),
    id: "hold-1",
    payloadHash: "hold-payload-1",
    resourceId: "resource-1",
    sourceId: source.id,
    sourceType: "SERVICE_REQUEST",
    status: "HELD",
    ...scope,
    offeringConfig: activeConfiguration(),
    ...slot,
    ...overrides,
  }
}

function bookingRow(overrides: Record<string, unknown> = {}) {
  return {
    cancellationPolicyRevisionSnapshot: 3,
    capacity: 1,
    cancellationRefundPercentSnapshot: 100,
    cancellationWindowSnapshot: 120,
    customerContactCiphertext: "private-contact",
    customerName: "Private customer",
    id: "booking-1",
    offeringConfig: activeConfiguration(),
    offeringConfigId: "config-1",
    paymentRequirementSnapshot: "DEPOSIT",
    paymentPolicyRevisionSnapshot: 2,
    paymentStatus: "PENDING",
    notificationChannelSnapshot: "SMS",
    notificationPolicyChannelSnapshot: "WEB",
    reminderLeadMinutesSnapshot: 1_440,
    revision: 5,
    requiredPaymentMinorSnapshot: 5_000,
    resource: { name: "Room one" },
    resourceId: "resource-1",
    refundPolicySnapshot: "FULL_BEFORE_CUTOFF",
    status: "CONFIRMED",
    timezoneSnapshot: "Africa/Lagos",
    ...scope,
    ...slot,
    ...overrides,
  }
}

describe("Service Commerce booking repository boundary", () => {
  test("schema-valid repeated rule IDs preserve distinct weekday times in actual configuration, staff and public projections", async () => {
    const f = bookingAvailabilityFixture()
    const configuration = serviceCommerceBookingConfigurationSchema.parse({
      ...scope,
      offeringId: "offering-1",
      availabilityRules: [
        {
          id: "same-rule",
          daysOfWeek: [1],
          startLocalTime: "09:00",
          endLocalTime: "10:00",
        },
        {
          id: "same-rule",
          daysOfWeek: [2, 3],
          startLocalTime: "12:00",
          endLocalTime: "13:00",
        },
      ],
      exceptions: [],
      bookingHorizonMinutes: 43_200,
      cancellationPolicy: {
        allowedUntilMinutesBeforeStart: 0,
        refundPolicy: "none",
        revision: 0,
      },
      holdDurationMinutes: 10,
      leadTimeMinutes: 0,
      paymentPolicy: { depositMinor: null, requirement: "none", revision: 0 },
      reminderLeadMinutes: 0,
      resources: [{ capacity: 2, id: "resource-1", label: "Exact room" }],
      slotDurationMinutes: 30,
      timezone: "UTC",
    })
    for (const rule of configuration.availabilityRules)
      for (const dayOfWeek of rule.daysOfWeek)
        f.state.resource.availability.push({
          ...scope,
          resourceId: "resource-1",
          id: `row-${dayOfWeek}`,
          clientRuleId: rule.id,
          dayOfWeek,
          startMinute: Number(rule.startLocalTime.slice(0, 2)) * 60,
          endMinute: Number(rule.endLocalTime.slice(0, 2)) * 60,
          status: "ACTIVE",
        })
    Reflect.set(
      f.state.config.store,
      "serviceBookingAvailabilityRules",
      f.state.resource.availability,
    )
    Reflect.set(
      f.state.config.store,
      "serviceBookingAvailabilityExceptions",
      [],
    )
    Object.assign(f.state.config, {
      cancellationPolicyRevision: 0,
      cancellationWindowMinutes: 0,
      refundPolicy: "NONE",
      holdDurationMinutes: 10,
      paymentPolicyRevision: 0,
      paymentRequirement: "NONE",
      depositAmountMinor: null,
    })
    Reflect.set(f.state.settings, "reminderLeadMinutes", 0)
    const saved = await getServiceCommerceBookingConfiguration(f.tx, {
      ...scope,
      actorUserId: "actor-1",
      offeringId: "offering-1",
    })
    expect(saved.availabilityRules).toEqual(configuration.availabilityRules)
    expect(saved.availabilityRules.map((rule) => rule.id)).toEqual([
      "same-rule",
      "same-rule",
    ])
    const from = new Date("2026-10-20T09:00:00Z")
    const to = new Date("2026-10-20T13:00:00Z")
    const currentTime = new Date("2026-10-19T08:00:00Z")
    const clock = spyOn(Date, "now").mockReturnValue(currentTime.getTime())
    try {
      const staff =
        await readStaffServiceCommerceBookingAvailabilityInTransaction(f.tx, {
          ...scope,
          actorUserId: "actor-1",
          source,
          offeringId: "offering-1",
          resourceId: "resource-1",
          from,
          to,
        })
      expect(staff.slots.map((slot) => slot.startAt)).toEqual([
        "2026-10-20T12:00:00.000Z",
        "2026-10-20T12:30:00.000Z",
      ])
      const accessToken = "existing-public-rule-fixture"
      const capability = {
        id: "rule-capability",
        ...scope,
        offeringConfigId: "config-1",
        offeringConfig: f.state.config,
        sourceId: "request-1",
        sourceType: "SERVICE_REQUEST",
        purpose: "VIEW_SLOTS",
        status: "ACTIVE",
        stateRevision: 0,
        expiresAt: new Date("2026-10-24T00:00:00Z"),
        tokenDigest: bookingTokenDigest(accessToken),
      }
      const tx = new Proxy(f.tx, {
        get(target, table, receiver) {
          if (table === "serviceBookingAccessCapability")
            return {
              findFirst: async (args: unknown) =>
                bookingMatches(capability, bookingField(args, "where"))
                  ? capability
                  : null,
              updateMany: async () => ({ count: 1 }),
            }
          if (table === "serviceCommercePolicyAuditEvent")
            return { createMany: async () => ({ count: 1 }) }
          return Reflect.get(target, table, receiver)
        },
      })
      const publicRead: unknown = await Reflect.apply(
        getPublicServiceCommerceBookingSlots,
        undefined,
        [
          {
            $transaction: async (
              run: (client: typeof tx) => Promise<unknown>,
            ) => run(tx),
          },
          { accessToken, from, to, now: currentTime },
        ],
      )
      const publicRows = bookingField(publicRead, "slots")
      if (!Array.isArray(publicRows))
        throw Error("Expected actual public slot projection")
      expect(publicRows.map((row) => bookingField(row, "startAt"))).toEqual(
        staff.slots.map((slot) => new Date(slot.startAt)),
      )
      expect(f.denied).toEqual([])
    } finally {
      clock.mockRestore()
    }
  })

  test("native hold/reschedule and pure staff availability share the complete-interval partial OPEN refusal", async () => {
    const f = bookingAvailabilityFixture()
    const slotStartAt = new Date("2026-10-15T09:00:00Z")
    const slotEndAt = new Date("2026-10-15T09:30:00Z")
    f.state.resource.availability.push({
      ...scope,
      id: "later",
      resourceId: "resource-1",
      clientRuleId: "later",
      dayOfWeek: 4,
      startMinute: 12 * 60,
      endMinute: 13 * 60,
      status: "ACTIVE",
    })
    f.state.resource.exceptions.push({
      ...scope,
      id: "partial",
      resourceId: "resource-1",
      clientExceptionId: "partial",
      kind: "OPEN",
      startAt: slotStartAt,
      endAt: new Date("2026-10-15T09:15:00Z"),
      capacity: null,
      status: "ACTIVE",
    })
    const clock = spyOn(Date, "now").mockReturnValue(
      new Date("2026-10-15T08:00:00Z").getTime(),
    )
    try {
      const read =
        await readStaffServiceCommerceBookingAvailabilityInTransaction(f.tx, {
          ...scope,
          actorUserId: "actor-1",
          source,
          offeringId: "offering-1",
          resourceId: "resource-1",
          from: slotStartAt,
          to: slotEndAt,
        })
      expect(read.slots).toEqual([])
      expect(read.coverage).toMatchObject({
        scannedCandidates: 1,
        reachedEnd: true,
      })
    } finally {
      clock.mockRestore()
    }
    const writes: string[] = []
    const tx = new Proxy(f.tx, {
      get(target, table, receiver) {
        if (table === "$queryRaw") return async () => [{ id: "resource-1" }]
        if (table === "serviceBookingEvent")
          return { findFirst: async () => null }
        if (table === "serviceCommercePolicyAuditEvent")
          return {
            createMany: async () => {
              writes.push("canonical-policy-audit")
              return { count: 1 }
            },
          }
        return Reflect.get(target, table, receiver)
      },
    })
    const result = Reflect.apply(createServiceCommerceBookingHold, undefined, [
      {
        $transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
          run(tx),
      },
      {
        ...scope,
        actorUserId: "actor-1",
        source,
        clientOperationId: "partial-opening-native-hold",
        expectedConfigurationRevision: 0,
        issueCapabilityToken,
        now: new Date("2026-10-15T08:00:00Z"),
        offeringId: "offering-1",
        quantity: 1,
        resourceId: "resource-1",
        slotStartAt,
        slotEndAt,
      },
    ])
    await expect(result).rejects.toMatchObject({
      code: "BOOKING_CAPACITY_CONFLICT",
    })
    expect(writes).toEqual(["canonical-policy-audit"])
    const existingBooking = {
      ...scope,
      id: "existing-booking",
      resourceId: "resource-1",
      offeringConfigId: "config-1",
      offeringConfig: f.state.config,
      resource: f.state.resource,
      commercialOrderId: null,
      startAt: new Date("2026-10-16T09:00:00Z"),
      endAt: new Date("2026-10-16T09:30:00Z"),
      status: "CONFIRMED",
      revision: 4,
      capacity: 1,
    }
    f.state.bookings.push(existingBooking)
    const reschedule = Reflect.apply(reviseServiceCommerceBooking, undefined, [
      {
        $transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
          run(tx),
      },
      {
        ...scope,
        actorUserId: "actor-1",
        bookingId: existingBooking.id,
        clientOperationId: "partial-opening-reschedule",
        expectedRevision: 4,
        issueCapabilityToken,
        now: new Date("2026-10-15T08:00:00Z"),
        operation: "reschedule",
        reasonCode: "requested_time",
        resourceId: "resource-1",
        newSlotStartAt: slotStartAt,
        newSlotEndAt: slotEndAt,
      },
    ])
    await expect(reschedule).rejects.toMatchObject({
      code: "BOOKING_CAPACITY_CONFLICT",
    })
    expect(writes).toEqual(["canonical-policy-audit", "canonical-policy-audit"])
    expect(f.denied).toEqual([])
  })

  test("public slot projection advertises only ACTIVE resources in the exact capability Store and Tenant", async () => {
    const f = bookingAvailabilityFixture()
    const from = new Date("2026-10-15T09:00:00Z")
    const to = new Date("2026-10-15T10:00:00Z")
    f.state.config.resources.push(
      {
        resourceId: "inactive",
        resource: { ...f.state.resource, id: "inactive", status: "INACTIVE" },
      },
      {
        resourceId: "foreign",
        resource: { ...f.state.resource, id: "foreign", tenantId: "foreign" },
      },
    )
    const accessToken = "existing-fixture-public-capability"
    const capability = {
      id: "slot-capability",
      tenantId: "tenant-1",
      storeId: "store-1",
      offeringConfigId: "config-1",
      offeringConfig: f.state.config,
      sourceId: "request-1",
      sourceType: "SERVICE_REQUEST",
      purpose: "VIEW_SLOTS",
      status: "ACTIVE",
      stateRevision: 0,
      expiresAt: new Date("2026-10-16T00:00:00Z"),
      tokenDigest: bookingTokenDigest(accessToken),
    }
    const writes: string[] = []
    const tx = new Proxy(f.tx, {
      get(target, table, receiver) {
        if (table === "serviceBookingAccessCapability")
          return {
            findFirst: async (args: unknown) =>
              bookingMatches(capability, bookingField(args, "where"))
                ? capability
                : null,
            updateMany: async () => {
              writes.push("capability-access")
              return { count: 1 }
            },
          }
        if (table === "serviceCommercePolicyAuditEvent")
          return {
            createMany: async () => {
              writes.push("canonical-policy-audit")
              return { count: 1 }
            },
          }
        return Reflect.get(target, table, receiver)
      },
    })
    const result: unknown = await Reflect.apply(
      getPublicServiceCommerceBookingSlots,
      undefined,
      [
        {
          $transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
            run(tx),
        },
        {
          accessToken,
          from,
          to,
          now: new Date("2026-10-15T08:00:00Z"),
        },
      ],
    )
    expect(result).toMatchObject({
      configurationRevision: 0,
      offeringId: "offering-1",
      timezone: "UTC",
      slots: [
        { resourceId: "resource-1", startAt: from, remainingCapacity: 2 },
        {
          resourceId: "resource-1",
          startAt: new Date("2026-10-15T09:30:00Z"),
          remainingCapacity: 2,
        },
      ],
    })
    const rows = bookingField(result, "slots")
    expect(Array.isArray(rows) && rows.length === 2).toBe(true)
    const configQuery = f.reads.find(
      (read) => read.table === "serviceBookingOfferingConfig",
    )?.args
    const resourceQuery = bookingField(
      bookingField(configQuery, "include"),
      "resources",
    )
    expect(bookingField(resourceQuery, "where")).toEqual({
      resource: { status: "ACTIVE", storeId: "store-1", tenantId: "tenant-1" },
    })
    expect(
      bookingMatches(
        f.state.config.resources[1],
        bookingField(resourceQuery, "where"),
      ),
    ).toBe(false)
    expect(writes).toEqual(["canonical-policy-audit", "capability-access"])
    expect(f.denied).toEqual([])
  })

  test("clamps a page-generated slot window to the server clock", async () => {
    const db = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          serviceBookingAccessCapability: { findFirst: async () => null },
        }),
    } as unknown as PrismaClient

    await expect(
      getPublicServiceCommerceBookingSlots(db, {
        accessToken: "elapsed-page-token",
        from: new Date(now.getTime() - 25),
        now,
        to: new Date(now.getTime() + 7 * 86_400_000),
      }),
    ).rejects.toMatchObject({ code: "BOOKING_NOT_FOUND" })
  })

  test("authorizes before returning an exact Tenant and Store booking configuration", async () => {
    const calls: Array<{ name: string; value: unknown }> = []
    const db = {
      membership: {
        findFirst: async (value: unknown) => {
          calls.push({ name: "membership.findFirst", value })
          return { id: "membership-1" }
        },
      },
      serviceBookingOfferingConfig: {
        findFirst: async (value: unknown) => {
          calls.push({ name: "config.findFirst", value })
          return activeConfiguration()
        },
      },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
      ...allowedPolicyFakes(),
    } as unknown as PrismaClient

    await expect(
      getServiceCommerceBookingConfiguration(db, {
        actorUserId: "attendant-1",
        offeringId: "offering-1",
        ...scope,
      }),
    ).resolves.toMatchObject({ offeringId: "offering-1", revision: 4 })

    expect(calls.map((call) => call.name)).toEqual([
      "membership.findFirst",
      "config.findFirst",
    ])
    expect(calls[0]?.value).toMatchObject({
      where: {
        acceptedAt: { not: null },
        status: "ACTIVE",
        tenantId: "tenant-1",
        userId: "attendant-1",
      },
    })
    expect(JSON.stringify(calls[0]?.value)).toContain('"storeId":"store-1"')
    expect(calls[1]?.value).toMatchObject({
      where: { offeringId: "offering-1", ...scope },
    })
  })

  test("rejects an unauthorized configuration request before it can read Store facts", async () => {
    let configRead = false
    const db = {
      membership: { findFirst: async () => null },
      serviceBookingOfferingConfig: {
        findFirst: async () => {
          configRead = true
          return activeConfiguration()
        },
      },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
      ...allowedPolicyFakes(),
    } as unknown as PrismaClient

    await expect(
      getServiceCommerceBookingConfiguration(db, {
        actorUserId: "outsider-1",
        offeringId: "offering-1",
        ...scope,
      }),
    ).rejects.toMatchObject({ code: "BOOKING_FORBIDDEN" })
    expect(configRead).toBe(false)
  })

  test("updates booking configuration through an authorized revisioned Store command", async () => {
    const writes: unknown[] = []
    let configurationReads = 0
    const tx = {
      membership: { findFirst: async () => ({ id: "manager-membership-1" }) },
      serviceBookingConfigurationEvent: {
        create: async () => ({ id: "configuration-event-1" }),
        findFirst: async () => null,
      },
      serviceBookingOfferingConfig: {
        findFirst: async () => {
          configurationReads += 1
          return activeConfiguration({
            revision: configurationReads === 1 ? 4 : 5,
          })
        },
        updateMany: async (value: unknown) => {
          writes.push(value)
          return { count: 1 }
        },
      },
      serviceBookingOfferingResource: {
        createMany: async () => ({ count: 1 }),
        deleteMany: async () => ({ count: 1 }),
      },
      serviceBookingAvailabilityException: {
        createMany: async () => ({ count: 0 }),
        updateMany: async () => ({ count: 0 }),
      },
      serviceBookingAvailabilityRule: {
        createMany: async () => ({ count: 0 }),
        updateMany: async () => ({ count: 0 }),
      },
      serviceBookingResource: {
        findMany: async () => [activeResource()],
        updateMany: async () => ({ count: 1 }),
      },
      serviceBookingStoreSettings: {
        updateMany: async () => ({ count: 1 }),
      },
      sellableOffering: { findFirst: async () => ({ id: "offering-1" }) },
      store: {
        findFirst: async () => ({
          countryCode: "NG",
          id: "store-1",
          serviceBookingSettings: { id: "settings-1", revision: 2 },
        }),
      },
      ...allowedPolicyFakes(),
    }
    const db = {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PrismaClient

    const updatedConfiguration =
      await updateServiceCommerceBookingConfiguration(db, {
        actorUserId: "manager-1",
        availabilityRules: [],
        bookingHorizonMinutes: 43_200,
        cancellationPolicy: {
          allowedUntilMinutesBeforeStart: 120,
          refundPolicy: "full_before_cutoff",
          revision: 999,
        },
        clientOperationId: "config-operation-1",
        exceptions: [],
        expectedRevision: 4,
        holdDurationMinutes: 10,
        leadTimeMinutes: 30,
        offeringId: "offering-1",
        paymentPolicy: {
          depositMinor: 5_000,
          requirement: "deposit",
          revision: 999,
        },
        reminderLeadMinutes: 1_440,
        resources: [{ capacity: 1, id: "resource-1", label: "Room one" }],
        slotDurationMinutes: 60,
        timezone: "Africa/Lagos",
        ...scope,
      })
    expect(updatedConfiguration).toMatchObject({ revision: 5 })
    expect(writes[0]).toMatchObject({
      data: expect.objectContaining({
        cancellationPolicyRevision: 3,
        paymentPolicyRevision: 2,
        revision: { increment: 1 },
      }),
      where: { id: "config-1", revision: 4, ...scope },
    })
  })

  test("locks the resource, detects payload-bound replay, and rejects an idempotency mismatch", async () => {
    const calls: Array<{ name: string; value: unknown }> = []
    const tx = {
      $queryRaw: async (value: unknown) => {
        calls.push({ name: "lock", value })
        return [{ id: "resource-1" }]
      },
      membership: { findFirst: async () => ({ id: "membership-1" }) },
      serviceBookingHold: {
        findFirst: async (value: unknown) => {
          calls.push({ name: "hold.findFirst", value })
          return holdRow({ payloadHash: "different-payload" })
        },
      },
      serviceBookingOfferingConfig: {
        findFirst: async () => activeConfiguration(),
      },
      serviceBookingResource: { findFirst: async () => activeResource() },
      serviceRequest: {
        findFirst: async () => ({
          channelOrigin: "WEB",
          contactOptIn: true,
          customerName: "Ada",
          customerPhone: "+2348000000000",
          id: "request-1",
          status: "SUBMITTED",
        }),
      },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
      ...allowedPolicyFakes(),
    }
    const db = {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PrismaClient

    await expect(
      createServiceCommerceBookingHold(db, {
        actorUserId: "attendant-1",
        clientOperationId: "hold-operation-1",
        expectedConfigurationRevision: 4,
        issueCapabilityToken,
        now,
        offeringId: "offering-1",
        quantity: 1,
        resourceId: "resource-1",
        slotEndAt: slot.endAt,
        slotStartAt: slot.startAt,
        source,
        ...scope,
      }),
    ).rejects.toMatchObject({ code: "BOOKING_IDEMPOTENCY_MISMATCH" })

    expect(calls.some((call) => call.name === "lock")).toBe(true)
    expect(
      calls.find((call) => call.name === "hold.findFirst")?.value,
    ).toMatchObject({
      where: { clientHoldId: "hold-operation-1", tenantId: "tenant-1" },
    })
  })

  test("holds are capacity-safe and expired holds do not consume a slot", async () => {
    const created: unknown[] = []
    const tx = {
      $queryRaw: async () => [{ id: "resource-1" }],
      membership: { findFirst: async () => ({ id: "membership-1" }) },
      serviceBookingHold: {
        create: async (value: unknown) => {
          created.push(value)
          return holdRow()
        },
        findFirst: async () => null,
        findMany: async () => [
          holdRow({ expiresAt: new Date("2031-02-03T07:00:00.000Z") }),
        ],
      },
      serviceBookingAccessCapability: {
        create: async () => ({ id: "confirm-capability-1" }),
      },
      serviceBooking: { findMany: async () => [] },
      serviceBookingOfferingConfig: {
        findFirst: async () => activeConfiguration(),
      },
      serviceBookingResource: { findFirst: async () => activeResource() },
      serviceRequest: {
        findFirst: async () => ({
          channelOrigin: "WEB",
          contactOptIn: true,
          customerName: "Ada",
          customerPhone: "+2348000000000",
          id: "request-1",
          status: "SUBMITTED",
        }),
      },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
      ...allowedPolicyFakes(),
    }
    const db = {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PrismaClient

    await expect(
      createServiceCommerceBookingHold(db, {
        actorUserId: "attendant-1",
        clientOperationId: "hold-operation-2",
        expectedConfigurationRevision: 4,
        issueCapabilityToken,
        now,
        offeringId: "offering-1",
        quantity: 1,
        resourceId: "resource-1",
        slotEndAt: slot.endAt,
        slotStartAt: slot.startAt,
        source,
        ...scope,
      }),
    ).resolves.toMatchObject({
      accessToken: "capability:hold-operation-2:confirm",
      id: "hold-1",
      status: "held",
    })
    expect(created).toHaveLength(1)
  })

  test("maps a serializable hold retry to a typed capacity conflict", async () => {
    const db = {
      $transaction: async () => {
        throw new Prisma.PrismaClientKnownRequestError("retry", {
          clientVersion: "test",
          code: "P2034",
        })
      },
    } as unknown as PrismaClient

    await expect(
      createServiceCommerceBookingHold(db, {
        actorUserId: "attendant-1",
        clientOperationId: "concurrent-hold-1",
        expectedConfigurationRevision: 4,
        issueCapabilityToken,
        now,
        offeringId: "offering-1",
        quantity: 1,
        resourceId: "resource-1",
        slotEndAt: slot.endAt,
        slotStartAt: slot.startAt,
        source,
        ...scope,
      }),
    ).rejects.toMatchObject({ code: "BOOKING_CAPACITY_CONFLICT" })
  })

  test("confirms an unexpired hold into a booking with immutable policy snapshots and a public capability", async () => {
    const creates: Array<{ name: string; value: unknown }> = []
    const tx = {
      $queryRaw: async (parts: TemplateStringsArray | { strings: readonly string[] }) => ("strings" in parts ? parts.strings : parts).join("").includes('FROM "CommercialOrder"') ? [{ acceptedCommerceQuoteVersion: { id: "version-1" }, currencyCode: "NGN", customerId: null, paymentStatus: "PENDING", storeId: "store-1", totalMinor: 20_000 }] : [{ id: "resource-1" }],
      membership: { findFirst: async () => ({ id: "membership-1" }) },
      serviceBooking: {
        create: async (value: unknown) => {
          creates.push({ name: "booking.create", value })
          return bookingRow()
        },
        findFirst: async () => null,
        findMany: async () => [],
      },
      serviceBookingAccessCapability: {
        create: async (value: unknown) => {
          creates.push({ name: "capability.create", value })
          return { id: "capability-1" }
        },
        updateMany: async () => ({ count: 1 }),
      },
      serviceBookingEvent: { create: async () => ({ id: "event-1" }) },
      serviceBookingHold: {
        findFirst: async () => holdRow(),
        findMany: async () => [],
        updateMany: async () => ({ count: 1 }),
      },
      serviceBookingNotificationIntent: {
        create: async () => ({ id: "intent-1" }),
        updateMany: async () => ({ count: 1 }),
      },
      commercialOrder: {
        findFirst: async () => ({
          acceptedCommerceQuoteVersion: { id: "version-1" },
          currencyCode: "NGN",
          customerId: null,
          paymentStatus: "PENDING",
          storeId: "store-1",
          totalMinor: 20_000,
        }),
      },
      serviceBookingOfferingConfig: {
        findFirst: async () => activeConfiguration(),
      },
      serviceBookingResource: { findFirst: async () => activeResource() },
      serviceRequest: {
        findFirst: async () => ({
          channelOrigin: "WEB",
          contactOptIn: true,
          customerName: "Ada",
          customerPhone: "+2348000000000",
          id: "request-1",
          status: "SUBMITTED",
        }),
      },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
      ...allowedPolicyFakes(),
    }
    const db = {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PrismaClient

    const confirmedBooking = await confirmServiceCommerceBooking(db, {
      actorUserId: "attendant-1",
      clientOperationId: "booking-operation-1",
      holdId: "hold-1",
      issueCapabilityToken,
      now,
      commercialOrderId: "order-1",
      protectRecipient: () => "encrypted-contact",
      source,
      ...scope,
    })
    expect(confirmedBooking).toMatchObject({
      id: "booking-1",
      status: "confirmed",
    })

    expect(
      creates.find((entry) => entry.name === "booking.create")?.value,
    ).toMatchObject({
      data: expect.objectContaining({
        cancellationPolicyRevisionSnapshot: 3,
        paymentRequirementSnapshot: "DEPOSIT",
        refundPolicySnapshot: "FULL_BEFORE_CUTOFF",
        timezoneSnapshot: "Africa/Lagos",
      }),
    })
    expect(creates.some((entry) => entry.name === "capability.create")).toBe(
      true,
    )
    expect(
      creates.find((entry) => entry.name === "capability.create")?.value,
    ).toMatchObject({
      data: expect.objectContaining({ bookingId: "booking-1" }),
    })
  })

  test("requires revision and a structured reason for reschedule/cancel, records a refund consequence, and leaves payment separate", async () => {
    const events: unknown[] = []
    const tx = {
      $queryRaw: async (parts: TemplateStringsArray | { strings: readonly string[] }) => ("strings" in parts ? parts.strings : parts).join("").includes('FROM "CommercialOrder"') ? [{ completedAt: null, status: "FULFILLING", currencyCode: "NGN", customerId: null, storeId: "store-1" }] : [{ id: "booking-1" }],
      membership: { findFirst: async () => ({ id: "membership-1" }) },
      serviceBooking: {
        findFirst: async () => bookingRow({ commercialOrderId: "order-1" }),
        findFirstOrThrow: async () =>
          bookingRow({ revision: 6, status: "CANCELLED" }),
        updateMany: async (value: unknown) => {
          events.push(value)
          return { count: 1 }
        },
      },
      serviceBookingEvent: {
        create: async (value: unknown) => {
          events.push(value)
          return { id: "event-1" }
        },
        findFirst: async () => null,
      },
      serviceBookingNotificationIntent: {
        create: async () => ({ id: "intent-1" }),
        updateMany: async () => ({ count: 1 }),
      },
      commercialOrder: {
        findFirst: async () => ({
          completedAt: null,
          status: "FULFILLING",
          currencyCode: "NGN",
          customerId: null,
          storeId: "store-1",
        }),
      },
      commercialOrderPayment: {
        groupBy: async () => [
          { _sum: { amountMinor: 7_000 }, type: "PAYMENT" },
          { _sum: { amountMinor: 3_000 }, type: "REFUND" },
        ],
      },
      serviceBookingAccessCapability: {
        updateMany: async () => ({ count: 1 }),
      },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
      ...allowedPolicyFakes(),
    }
    const db = {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PrismaClient

    await expect(
      reviseServiceCommerceBooking(db, {
        actorUserId: "attendant-1",
        bookingId: "booking-1",
        clientOperationId: "cancel-operation-1",
        expectedRevision: 5,
        issueCapabilityToken,
        now,
        operation: "cancel",
        reasonCode: "customer_changed_mind",
        ...scope,
      }),
    ).resolves.toMatchObject({
      paymentStatus: "pending",
      refund: { outcome: "full" },
      status: "cancelled",
    })
    expect(JSON.stringify(events)).toContain("customer_changed_mind")
    expect(JSON.stringify(events)).toContain("REFUND_ELIGIBLE")
    expect(JSON.stringify(events)).toContain('"refundAmountMinor":4000')

    await expect(
      reviseServiceCommerceBooking(db, {
        actorUserId: "attendant-1",
        bookingId: "booking-1",
        clientOperationId: "cancel-operation-stale",
        expectedRevision: 4,
        issueCapabilityToken,
        now,
        operation: "cancel",
        reasonCode: "customer_changed_mind",
        ...scope,
      }),
    ).rejects.toMatchObject({ code: "BOOKING_REVISION_CONFLICT" })
  })

  test("returns a safe public projection and claims notifications only after current authorization", async () => {
    const calls: Array<{ name: string; value: unknown }> = []
    const publicDb = {
      serviceBookingAccessCapability: {
        findFirst: async (value: unknown) => {
          calls.push({ name: "capability.findFirst", value })
          return {
            booking: bookingRow(),
            id: "capability-1",
            stateRevision: 5,
            ...scope,
          }
        },
        updateMany: async () => ({ count: 1 }),
      },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
      ...allowedPolicyFakes(),
    } as unknown as PrismaClient
    const projection = await getPublicServiceCommerceBooking(publicDb, {
      accessToken: "public-capability-1",
      now,
    })
    expect(projection).toMatchObject({ id: "booking-1", status: "confirmed" })
    expect(JSON.stringify(projection)).not.toContain("private-contact")
    expect(JSON.stringify(projection)).not.toContain("Private customer")

    const workerDb = {
      $transaction: async (
        callback: (client: {
          membership: { findFirst: (value: unknown) => Promise<unknown> }
          serviceBookingNotificationIntent: {
            findFirst: (value: unknown) => Promise<unknown>
            updateMany: (value: unknown) => Promise<unknown>
          }
        }) => Promise<unknown>,
      ) =>
        callback({
          membership: {
            findFirst: async (value: unknown) => {
              calls.push({ name: "worker.authorize", value })
              return null
            },
          },
          serviceBookingNotificationIntent: {
            findFirst: async (value: unknown) => {
              calls.push({ name: "intent.findFirst", value })
              return {
                booking: bookingRow(),
                id: "intent-1",
                status: "PENDING",
              }
            },
            updateMany: async (value: unknown) => {
              calls.push({ name: "intent.updateMany", value })
              return { count: 1 }
            },
          },
        }),
    } as unknown as PrismaClient

    await expect(
      claimServiceCommerceBookingNotificationIntent(workerDb, {
        actorUserId: "revoked-worker",
        intentId: "intent-1",
        now,
        ...scope,
      }),
    ).rejects.toBeInstanceOf(ServiceCommerceBookingError)
    expect(calls.map((call) => call.name)).toContain("worker.authorize")
    expect(calls.map((call) => call.name)).not.toContain("intent.updateMany")
  })

  test("fails a revoked or expired public capability closed without exposing booking facts", async () => {
    const accessReads: unknown[] = []
    const db = {
      serviceBookingAccessCapability: {
        findFirst: async (value: unknown) => {
          accessReads.push(value)
          return null
        },
      },
    } as unknown as PrismaClient

    await expect(
      getPublicServiceCommerceBooking(db, {
        accessToken: "revoked-or-expired-capability",
        now,
      }),
    ).rejects.toMatchObject({ code: "BOOKING_NOT_FOUND" })
    expect(accessReads[0]).toMatchObject({
      where: expect.objectContaining({
        expiresAt: { gt: now },
        status: "ACTIVE",
      }),
    })
  })

  test("records a bounded delivery failure and safely returns the claimed intent to retry", async () => {
    const writes: unknown[] = []
    const tx = {
      membership: { findFirst: async () => ({ id: "worker-membership-1" }) },
      serviceBookingNotificationIntent: {
        updateMany: async (value: unknown) => {
          writes.push(value)
          return { count: 1 }
        },
      },
    }
    const db = {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PrismaClient
    const retryAt = new Date("2031-02-03T08:10:00.000Z")

    await expect(
      failServiceCommerceBookingNotificationIntent(db, {
        actorUserId: "worker-1",
        failureCode: "provider_timeout",
        intentId: "intent-1",
        retryAt,
        ...scope,
      }),
    ).resolves.toEqual({ id: "intent-1", status: "pending" })
    expect(writes[0]).toMatchObject({
      data: expect.objectContaining({
        failureCode: "provider_timeout",
        scheduledFor: retryAt,
        status: "PENDING",
      }),
      where: {
        authorizationUserId: "worker-1",
        id: "intent-1",
        status: "CLAIMED",
        ...scope,
      },
    })
  })

  test("returns only due reminder identifiers after Store and job-time policy reauthorization", async () => {
    const writes: unknown[] = []
    const tx = {
      membership: { findFirst: async () => ({ id: "worker-membership-1" }) },
      serviceBookingNotificationIntent: {
        findMany: async () => [
          {
            booking: {
              startAt: slot.startAt,
              status: "CONFIRMED",
            },
            deduplicationKey: `booking-reminder:booking-1:5:${slot.startAt.toISOString()}`,
            id: "reminder-intent-1",
            policyChannel: "WEB",
            type: "REMINDER",
          },
        ],
        updateMany: async (value: unknown) => {
          writes.push(value)
          return { count: 1 }
        },
      },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
      ...allowedPolicyFakes(),
    }
    const db = {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PrismaClient

    await expect(
      scheduleDueServiceCommerceBookingReminderIntents(db, {
        actorUserId: "worker-1",
        now,
        ...scope,
      }),
    ).resolves.toEqual({
      notificationDispatches: [
        { actorUserId: "worker-1", intentId: "reminder-intent-1" },
      ],
    })
    expect(writes[0]).toMatchObject({
      data: { authorizationUserId: "worker-1" },
      where: expect.objectContaining({
        id: "reminder-intent-1",
        status: "PENDING",
        ...scope,
      }),
    })
  })

  test("supersedes a delayed reminder once its appointment has begun", async () => {
    const writes: unknown[] = []
    const tx = {
      membership: { findFirst: async () => ({ id: "worker-membership-1" }) },
      serviceBookingNotificationIntent: {
        findMany: async () => [
          {
            booking: {
              startAt: new Date("2031-02-03T07:59:00.000Z"),
              status: "ARRIVED",
            },
            deduplicationKey:
              "booking-reminder:booking-1:5:2031-02-03T07:59:00.000Z",
            id: "late-reminder-1",
            policyChannel: "WEB",
            type: "REMINDER",
          },
        ],
        updateMany: async (value: unknown) => {
          writes.push(value)
          return { count: 1 }
        },
      },
      ...allowedPolicyFakes(),
    }
    const db = {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PrismaClient

    await expect(
      scheduleDueServiceCommerceBookingReminderIntents(db, {
        actorUserId: "worker-1",
        now,
        ...scope,
      }),
    ).resolves.toEqual({ notificationDispatches: [] })
    expect(writes[0]).toMatchObject({
      data: { status: "CANCELLED" },
      where: { id: "late-reminder-1", status: "PENDING", ...scope },
    })
  })

  test("enumerates only active booking Stores with an active attendant identifier", async () => {
    const reads: unknown[] = []
    const db = {
      serviceCommerceStoreProfile: {
        findMany: async (value: unknown) => {
          reads.push(value)
          return [
            {
              id: "profile-1",
              store: {
                serviceCommerceStoreTeamAssignments: [
                  { membership: { userId: "attendant-1" } },
                ],
              },
              ...scope,
            },
            {
              id: "profile-2",
              store: { serviceCommerceStoreTeamAssignments: [] },
              storeId: "store-2",
              tenantId: "tenant-2",
            },
          ]
        },
      },
    } as unknown as PrismaClient

    await expect(
      listServiceCommerceBookingReminderScopes(db, { limit: 2 }),
    ).resolves.toEqual({
      nextProfileId: null,
      scopes: [{ actorUserId: "attendant-1", ...scope }],
    })
    expect(reads[0]).toMatchObject({
      take: 3,
      where: { bookingEnabled: true, status: "ACTIVE" },
    })
  })

  test("reconciles deposit payment independently from the booking lifecycle revision", async () => {
    const writes: unknown[] = []
    const tx = {
      serviceBooking: {
        findMany: async () => [
          {
            id: "booking-1",
            paymentStatus: "PENDING",
            requiredPaymentMinorSnapshot: 5_000,
          },
        ],
        updateMany: async (value: unknown) => {
          writes.push(value)
          return { count: 1 }
        },
      },
      serviceBookingEvent: {
        create: async (value: unknown) => {
          writes.push(value)
          return { id: "event-1" }
        },
      },
    }

    await reconcileServiceCommerceBookingPaymentInTransaction(tx as never, {
      actorUserId: "cashier-1",
      amountPaidMinor: 5_000,
      commercialPaymentId: "payment-1",
      isRefund: false,
      orderId: "order-1",
      ...scope,
    })
    expect(writes[0]).toMatchObject({
      data: { paymentStatus: "PAID" },
      where: {
        id: "booking-1",
        paymentStatus: "PENDING",
        ...scope,
      },
    })
    expect(writes[0]).not.toHaveProperty("data.revision")
    expect(writes[1]).toMatchObject({
      data: expect.objectContaining({
        commercialPaymentId: "payment-1",
        type: "PAYMENT_STATUS_CHANGED",
      }),
    })
  })

  test("starts only authorized linked Service work inside the booking transaction", async () => {
    const workWrites: unknown[] = []
    const linkedBooking = bookingRow({
      commercialOrderId: "order-1",
      customerContactCiphertext: null,
      serviceJobId: "job-1",
      status: "ARRIVED",
    })
    const tx = {
      $queryRaw: async (parts: TemplateStringsArray | { strings: readonly string[] }) => ("strings" in parts ? parts.strings : parts).join("").includes('FROM "CommercialOrder"') ? [{ completedAt: null, status: "FULFILLING", currencyCode: "NGN", customerId: null, storeId: "store-1" }] : [{ id: "locked" }],
      membership: { findFirst: async () => ({ id: "membership-1" }) },
      serviceBooking: {
        findFirst: async () => linkedBooking,
        findFirstOrThrow: async () =>
          bookingRow({ ...linkedBooking, revision: 6, status: "IN_SERVICE" }),
        updateMany: async () => ({ count: 1 }),
      },
      serviceBookingAccessCapability: {
        create: async () => ({ id: "capability-1" }),
        updateMany: async () => ({ count: 1 }),
      },
      serviceBookingEvent: {
        create: async () => ({ id: "booking-event-1" }),
        findFirst: async () => null,
      },
      commercialOrder: {
        findFirst: async () => ({
          completedAt: null,
          status: "FULFILLING",
          currencyCode: "NGN",
          customerId: null,
          storeId: "store-1",
        }),
      },
      serviceJob: {
        findFirst: async () => ({
          commercialOrderId: "order-1",
          id: "job-1",
          lines: [
            {
              authorizationStatus: "AUTHORIZED",
              id: "line-1",
              revision: 3,
              status: "QUEUED",
            },
          ],
        }),
        update: async () => ({ id: "job-1" }),
      },
      serviceJobLine: {
        count: async () => 1,
        updateMany: async (value: unknown) => {
          workWrites.push(value)
          return { count: 1 }
        },
      },
      serviceWorkEvent: {
        create: async (value: unknown) => {
          workWrites.push(value)
          return { id: "work-event-1" }
        },
      },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
      ...allowedPolicyFakes(),
    }
    const db = {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PrismaClient

    await expect(
      reviseServiceCommerceBooking(db, {
        actorUserId: "attendant-1",
        bookingId: "booking-1",
        clientOperationId: "start-operation-1",
        expectedRevision: 5,
        issueCapabilityToken,
        now,
        operation: "start",
        ...scope,
      }),
    ).resolves.toMatchObject({ status: "in_service" })
    expect(workWrites[0]).toMatchObject({
      data: expect.objectContaining({ status: "IN_PROGRESS" }),
      where: { id: "line-1", revision: 3 },
    })
    expect(workWrites[1]).toMatchObject({
      data: expect.objectContaining({
        source: "service_commerce_booking",
        toStatus: "IN_PROGRESS",
      }),
    })
  })

  test("booking completion leaves its Order incomplete while Product quantity remains unfulfilled", async () => {
    const orderWrites: unknown[] = []
    const workWrites: unknown[] = []
    const linkedBooking = bookingRow({
      commercialOrderId: "order-1",
      customerContactCiphertext: null,
      serviceJobId: "job-1",
      status: "IN_SERVICE",
    })
    const tx = {
      $queryRaw: async (parts: TemplateStringsArray | { strings: readonly string[] }) => ("strings" in parts ? parts.strings : parts).join("").includes('FROM "CommercialOrder"') ? [{ completedAt: null, status: "FULFILLING", currencyCode: "NGN", customerId: null, storeId: "store-1" }] : [{ id: "locked" }],
      commercialOrder: {
        findFirst: async (args: { select?: unknown }) =>
          args.select
            ? { customerId: null, currencyCode: "NGN" }
            : {
                completedAt: null,
                status: "FULFILLING",
                currencyCode: "NGN",
                customerId: null,
                storeId: "store-1",
              },
        updateMany: async (value: unknown) => {
          orderWrites.push(value)
          return { count: 1 }
        },
      },
      commercialOrderLine: {
        findMany: async () => [
          {
            kind: "PRODUCT_UNIT",
            productFulfillments: [],
            quantity: { toString: () => "1" },
            serviceJobLines: [],
          },
        ],
      },
      membership: { findFirst: async () => ({ id: "membership-1" }) },
      serviceBooking: {
        findFirst: async () => linkedBooking,
        findFirstOrThrow: async () =>
          bookingRow({ ...linkedBooking, revision: 6, status: "COMPLETED" }),
        updateMany: async () => ({ count: 1 }),
      },
      serviceBookingAccessCapability: {
        updateMany: async () => ({ count: 1 }),
      },
      serviceBookingEvent: {
        create: async () => ({ id: "booking-event-1" }),
        findFirst: async () => null,
      },
      serviceJob: {
        findFirst: async () => ({
          commercialOrderId: "order-1",
          id: "job-1",
          lines: [
            {
              authorizationStatus: "AUTHORIZED",
              id: "line-1",
              revision: 3,
              status: "IN_PROGRESS",
            },
          ],
        }),
        update: async () => ({ id: "job-1" }),
      },
      serviceJobLine: {
        updateMany: async (value: unknown) => {
          workWrites.push(value)
          return { count: 1 }
        },
      },
      serviceWorkEvent: {
        create: async (value: unknown) => {
          workWrites.push(value)
          return { id: "service-event-1" }
        },
      },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
      ...allowedPolicyFakes(),
    }
    const db = {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PrismaClient

    await expect(
      reviseServiceCommerceBooking(db, {
        actorUserId: "attendant-1",
        bookingId: "booking-1",
        clientOperationId: "complete-operation-1",
        expectedRevision: 5,
        issueCapabilityToken,
        now,
        operation: "complete",
        ...scope,
      }),
    ).resolves.toMatchObject({ status: "completed" })

    expect(workWrites[0]).toMatchObject({
      data: expect.objectContaining({ status: "COMPLETED" }),
      where: { id: "line-1", revision: 3 },
    })
    expect(orderWrites).toEqual([])
  })
})
