import { afterEach, beforeEach, expect, setSystemTime, test } from "bun:test"
import {
  bookingAvailabilityFixture,
  field,
  bookingAvailabilityScope as scope,
} from "../test-helpers/booking-availability"
import {
  type StaffServiceCommerceBookingAvailabilityInput,
  readStaffServiceCommerceBookingAvailabilityInTransaction as read,
} from "./staff-availability"

beforeEach(() => setSystemTime(new Date("2026-10-15T08:00:00Z")))
afterEach(() => setSystemTime())
function input(): StaffServiceCommerceBookingAvailabilityInput {
  return {
    ...scope,
    source: { kind: "service", id: "request-1" },
    offeringId: "offering-1",
    resourceId: "resource-1",
    from: new Date("2026-10-15T09:00:00Z"),
    to: new Date("2026-10-15T12:00:00Z"),
  }
}
test("actual canonical capacity reads exact current staff source/config/resource without capability, audits or mutation", async () => {
  const f = bookingAvailabilityFixture()
  const result = await read(f.tx, input())
  expect(result).toMatchObject({
    ...scope,
    source: { kind: "service", id: "request-1", revision: 1 },
    resource: {
      id: "resource-1",
      label: "Exact room",
      capacity: 2,
      revision: 2,
    },
    configuration: { id: "config-1", revision: 0 },
    settingsRevision: 0,
    timezone: "UTC",
    asOf: "2026-10-15T08:00:00.000Z",
    quantity: 1,
    capacityAssessment: "live_unreserved",
    paymentReadiness: "not_checked",
    providerSettlement: "not_checked",
    nextCursor: null,
    coverage: { reachedEnd: true, scannedCandidates: 6, livePage: true },
  })
  expect(result.slots).toHaveLength(6)
  expect(result.slots[0]).toEqual({
    resourceId: "resource-1",
    startAt: "2026-10-15T09:00:00.000Z",
    endAt: "2026-10-15T09:30:00.000Z",
    remainingCapacity: 2,
  })
  expect(JSON.stringify(result)).not.toMatch(
    /PRIVATE|token|Token|cipher|customer|policy-|membershipId/,
  )
  expect(f.denied).toEqual([])
  expect(
    f.reads.every(
      (row) =>
        !row.table.includes("Capability") &&
        row.table !== "serviceCommercePolicyAuditEvent",
    ),
  ).toBe(true)
  expect(
    field(
      f.reads.find((row) => row.table === "serviceRequest")?.args,
      "select",
    ),
  ).toEqual({
    id: true,
    tenantId: true,
    storeId: true,
    status: true,
    revision: true,
  })
  for (const table of ["serviceBooking", "serviceBookingHold"]) {
    const query = f.reads.find((row) => row.table === table)?.args
    expect(field(query, "take")).toBe(1001)
    expect(field(query, "select")).not.toHaveProperty(
      "customerContactCiphertext",
    )
    expect(field(query, "where")).toMatchObject({
      resourceId: "resource-1",
      tenantId: scope.tenantId,
      storeId: scope.storeId,
    })
  }
})
test("expired holds do not consume capacity; requested quantity and conservative live reservations are evaluated exactly", async () => {
  const f = bookingAvailabilityFixture()
  const base = {
    ...scope,
    resourceId: "resource-1",
    startAt: new Date("2026-10-15T09:00:00Z"),
    endAt: new Date("2026-10-15T09:30:00Z"),
    capacity: 1,
  }
  f.state.holds.push(
    {
      ...base,
      id: "active-hold",
      status: "HELD",
      expiresAt: new Date("2026-10-15T08:30:00Z"),
    },
    {
      ...base,
      id: "expired",
      startAt: new Date("2026-10-15T09:30:00Z"),
      endAt: new Date("2026-10-15T10:00:00Z"),
      status: "HELD",
      expiresAt: new Date("2026-10-15T07:59:59Z"),
    },
  )
  f.state.bookings.push({
    ...base,
    id: "current",
    startAt: new Date("2026-10-15T10:00:00Z"),
    endAt: new Date("2026-10-15T10:30:00Z"),
    capacity: 2,
    status: "CONFIRMED",
  })
  const result = await read(f.tx, { ...input(), quantity: 2 })
  expect(result.slots.map((row) => row.startAt)).toEqual([
    "2026-10-15T09:30:00.000Z",
    "2026-10-15T10:30:00.000Z",
    "2026-10-15T11:00:00.000Z",
    "2026-10-15T11:30:00.000Z",
  ])
  expect(f.state.holds[0]?.status).toBe("HELD")
  expect(f.state.bookings[0]?.status).toBe("CONFIRMED")
  expect(f.denied).toEqual([])
})
test("native Owner/Admin or accepted explicitly assigned attendant and current scoped grant remain mandatory", async () => {
  for (const role of ["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"]) {
    const f = bookingAvailabilityFixture()
    f.state.member.role = role
    if (["OWNER", "ADMIN"].includes(role))
      f.state.member.serviceCommerceStoreTeamAssignments.length = 0
    expect((await read(f.tx, input())).slots).toHaveLength(6)
  }
  const defects: Array<
    (f: ReturnType<typeof bookingAvailabilityFixture>) => void
  > = [
    (f) => {
      f.state.member.role = "SUPPORT"
    },
    (f) => {
      f.state.member.status = "SUSPENDED"
    },
    (f) => {
      Reflect.set(f.state.member, "acceptedAt", null)
    },
    (f) => {
      f.state.member.serviceCommerceStoreTeamAssignments.length = 0
    },
    (f) => {
      f.state.member.staffStoreAssignments.length = 0
    },
    (f) => {
      f.state.member.staffAccessRevision = 0
    },
    (f) => {
      f.state.tenant.isActive = false
    },
    (f) => {
      f.state.store.status = "INACTIVE"
    },
  ]
  for (const defect of defects) {
    const f = bookingAvailabilityFixture()
    defect(f)
    await expect(read(f.tx, input())).rejects.toMatchObject({
      code: "BOOKING_FORBIDDEN",
    })
    expect(
      f.reads.some((row) => row.table === "serviceBookingOfferingConfig"),
    ).toBe(false)
    expect(f.denied).toEqual([])
  }
})
test("disabled runtime, denied current policy, clinical/withdrawn source and foreign exact identities fail closed", async () => {
  for (const defect of [
    "runtime",
    "policy",
    "withdrawn",
    "clinical",
    "source",
    "offering",
    "resource",
    "tenant",
    "actor",
    "store",
  ]) {
    const f = bookingAvailabilityFixture()
    const request = input()
    if (defect === "runtime") f.state.profile.bookingEnabled = false
    if (defect === "policy") f.state.policies.length = 0
    if (defect === "withdrawn") f.state.source.status = "WITHDRAWN"
    if (defect === "clinical")
      Reflect.set(request.source, "kind", "prescription")
    if (defect === "source") request.source.id = "foreign"
    if (defect === "offering") request.offeringId = "foreign"
    if (defect === "resource") request.resourceId = "foreign"
    if (defect === "tenant") request.tenantId = "foreign"
    if (defect === "actor") request.actorUserId = "foreign"
    if (defect === "store") request.storeId = "foreign"
    await expect(read(f.tx, request)).rejects.toThrow()
    expect(f.denied).toEqual([])
  }
})
test("empty bounded candidate pages retain exact continuation rather than claiming no availability", async () => {
  const f = bookingAvailabilityFixture()
  f.state.settings.defaultSlotInterval = 1
  f.state.config.durationMinutes = 1
  f.state.resource.availability.push({
    ...scope,
    id: "friday",
    resourceId: "resource-1",
    clientRuleId: "friday",
    dayOfWeek: 5,
    startMinute: 0,
    endMinute: 1439,
    status: "ACTIVE",
  })
  const request = { ...input(), to: new Date("2026-10-15T20:00:00Z") }
  const first = await read(f.tx, request)
  expect(first.slots).toEqual([])
  expect(first.coverage).toMatchObject({
    scannedCandidates: 500,
    scanLimit: 500,
    reachedEnd: false,
  })
  expect(first.nextCursor).toBeString()
  if (!first.nextCursor) throw Error("Expected empty-page continuation")
  const second = await read(f.tx, { ...request, cursor: first.nextCursor })
  expect(second.slots).toEqual([])
  expect(second.coverage).toMatchObject({
    scannedCandidates: 160,
    reachedEnd: true,
  })
  expect(second.nextCursor).toBeNull()
  expect(f.denied).toEqual([])
})
test("eligible paging has exact stable positions and rechecks current live capacity without accumulating totals", async () => {
  const f = bookingAvailabilityFixture()
  const request = { ...input(), limit: 2 }
  const first = await read(f.tx, request)
  if (!first.nextCursor) throw Error("Expected more exact slots")
  f.state.bookings.push({
    ...scope,
    id: "now-taken",
    resourceId: "resource-1",
    startAt: new Date("2026-10-15T10:00:00Z"),
    endAt: new Date("2026-10-15T10:30:00Z"),
    capacity: 2,
    status: "CONFIRMED",
  })
  const second = await read(f.tx, { ...request, cursor: first.nextCursor })
  expect(second.slots.map((row) => row.startAt)).toEqual([
    "2026-10-15T10:30:00.000Z",
    "2026-10-15T11:00:00.000Z",
  ])
  if (!second.nextCursor) throw Error("Expected final live page")
  expect(
    (await read(f.tx, { ...request, cursor: second.nextCursor })).slots.map(
      (row) => row.startAt,
    ),
  ).toEqual(["2026-10-15T11:30:00.000Z"])
  expect(first.slots.map((row) => row.startAt)).toEqual([
    "2026-10-15T09:00:00.000Z",
    "2026-10-15T09:30:00.000Z",
  ])
})
test("cursor binds exact filters, current actor/source/config/resource/settings and authorization revisions", async () => {
  for (const defect of [
    "quantity",
    "window",
    "limit",
    "role",
    "source-revision",
    "config",
    "resource",
    "settings",
    "access",
  ]) {
    const f = bookingAvailabilityFixture()
    const request = { ...input(), limit: 1 }
    const first = await read(f.tx, request)
    if (!first.nextCursor) throw Error("Expected continuation")
    if (defect === "quantity") request.quantity = 2
    if (defect === "window") request.to = new Date("2026-10-15T13:00:00Z")
    if (defect === "limit") request.limit = 2
    if (defect === "role") f.state.member.role = "OWNER"
    if (defect === "source-revision") f.state.source.revision++
    if (defect === "config") f.state.config.revision++
    if (defect === "resource") f.state.resource.revision++
    if (defect === "settings") f.state.settings.revision++
    if (defect === "access") f.state.member.staffAccessRevision++
    await expect(
      read(f.tx, { ...request, cursor: first.nextCursor }),
    ).rejects.toMatchObject({ code: "BOOKING_CONFIGURATION_CONFLICT" })
    expect(f.denied).toEqual([])
  }
})
test("oversized/malformed cursors, forbidden clock/token/exclusion inputs and invalid windows never invent availability", async () => {
  for (const defect of [
    "cursor",
    "oversized",
    "position",
    "now",
    "accessToken",
    "excludeBookingId",
    "negative",
    "fraction",
    "window",
    "invalid-date",
    "invalid-zone",
  ]) {
    const f = bookingAvailabilityFixture()
    const request = input()
    if (defect === "cursor") request.cursor = "not-json"
    if (defect === "oversized") request.cursor = "a".repeat(4097)
    if (defect === "position")
      request.cursor = Buffer.from(
        JSON.stringify({
          version: 1,
          binding: "a".repeat(64),
          next: "2026-10-15T09:00:00.000Z",
          extra: "unsupported",
        }),
      ).toString("base64url")
    if (["now", "accessToken", "excludeBookingId"].includes(defect))
      Reflect.set(request, defect, "untrusted")
    if (defect === "negative") request.quantity = -1
    if (defect === "fraction") request.quantity = 0.5
    if (defect === "window") request.to = new Date("2026-12-01T00:00:00Z")
    if (defect === "invalid-date") request.from = new Date(Number.NaN)
    if (defect === "invalid-zone")
      f.state.settings.timezone = "unavailable/zone"
    await expect(read(f.tx, request)).rejects.toThrow()
    expect(f.denied).toEqual([])
  }
})
test("all complete overlap/rule/exception sets are bounded with explicit unknown overflow, never a partial capacity sum", async () => {
  for (const kind of ["hold", "booking", "rule", "exception"]) {
    const f = bookingAvailabilityFixture()
    for (let index = 0; index <= 1000; index++) {
      const base = {
        ...scope,
        id: `fact-${index}`,
        resourceId: "resource-1",
        startAt: new Date("2026-10-15T09:00:00Z"),
        endAt: new Date("2026-10-15T09:30:00Z"),
        capacity: 1,
      }
      if (kind === "hold")
        f.state.holds.push({
          ...base,
          status: "HELD",
          expiresAt: new Date("2026-10-15T08:30:00Z"),
        })
      if (kind === "booking")
        f.state.bookings.push({ ...base, status: "CONFIRMED" })
      if (kind === "rule")
        f.state.resource.availability.push({
          ...base,
          clientRuleId: `rule-${index}`,
          dayOfWeek: 4,
          startMinute: 0,
          endMinute: 1439,
          status: "ACTIVE",
        })
      if (kind === "exception")
        f.state.resource.exceptions.push({
          ...base,
          clientExceptionId: `exception-${index}`,
          kind: "OPEN",
          status: "ACTIVE",
        })
    }
    await expect(read(f.tx, input())).rejects.toMatchObject({
      code: "BOOKING_CAPACITY_CONFLICT",
      message: expect.stringContaining("unknown"),
    })
    expect(f.denied).toEqual([])
  }
})

test("native 191-character source, Offering, resource and configuration identities survive the bounded projection", async () => {
  const f = bookingAvailabilityFixture()
  const request = input()
  request.source.id = f.state.source.id = "s".repeat(191)
  request.offeringId = f.state.config.offeringId = "o".repeat(191)
  request.resourceId = f.state.resource.id = "r".repeat(191)
  f.state.config.id = "c".repeat(191)
  const link = f.state.config.resources[0]
  if (!link) throw Error("Expected exact Offering resource")
  link.resourceId = request.resourceId
  const result = await read(f.tx, { ...request, limit: 1 })
  expect(result.source.id).toBe(request.source.id)
  expect(result.offeringId).toBe(request.offeringId)
  expect(result.resource.id).toBe(request.resourceId)
  expect(result.configuration.id).toBe(f.state.config.id)
  expect(result.slots[0]?.resourceId).toBe(request.resourceId)
  expect(result.nextCursor && result.nextCursor.length <= 4096).toBe(true)
})
test("server clock, lead time and configured horizon bound exact UTC slot instants independently of payment", async () => {
  const f = bookingAvailabilityFixture()
  f.state.config.leadTimeMinutes = 60
  f.state.config.bookingHorizonMinutes = 120
  const result = await read(f.tx, {
    ...input(),
    from: new Date("2026-10-15T07:00:00Z"),
  })
  expect(result.effectiveWindow).toEqual({
    from: "2026-10-15T08:00:00.000Z",
    to: "2026-10-15T10:00:00.000Z",
  })
  expect(result.slots.map((row) => row.startAt)).toEqual([
    "2026-10-15T09:00:00.000Z",
    "2026-10-15T09:30:00.000Z",
  ])
  expect(result.paymentReadiness).toBe("not_checked")
  expect(f.denied).toEqual([])
})
test("continuation uses a fresh server clock and expired capacity while preserving exact filters", async () => {
  const f = bookingAvailabilityFixture()
  f.state.holds.push({
    ...scope,
    id: "expiring",
    resourceId: "resource-1",
    startAt: new Date("2026-10-15T09:30:00Z"),
    endAt: new Date("2026-10-15T10:00:00Z"),
    expiresAt: new Date("2026-10-15T08:15:00Z"),
    status: "HELD",
    capacity: 2,
  })
  const first = await read(f.tx, { ...input(), limit: 1 })
  if (!first.nextCursor) throw Error("Expected exact continuation")
  setSystemTime(new Date("2026-10-15T08:16:00Z"))
  const second = await read(f.tx, {
    ...input(),
    limit: 1,
    cursor: first.nextCursor,
  })
  expect(second.slots[0]?.startAt).toBe("2026-10-15T09:30:00.000Z")
  expect(second.slots[0]?.remainingCapacity).toBe(2)
  expect(second.asOf).toBe("2026-10-15T08:16:00.000Z")
  expect(second.requestedWindow).toEqual(first.requestedWindow)
})

test("malformed saved capacity facts refuse as unknown instead of fabricating availability", async () => {
  for (const defect of ["capacity", "quantity", "rule", "exception"]) {
    const f = bookingAvailabilityFixture()
    if (defect === "capacity") f.state.resource.capacity = Number.NaN
    if (defect === "quantity")
      f.state.bookings.push({
        ...scope,
        id: "bad",
        resourceId: "resource-1",
        startAt: new Date("2026-10-15T09:00:00Z"),
        endAt: new Date("2026-10-15T09:30:00Z"),
        capacity: -1,
        status: "CONFIRMED",
      })
    if (defect === "rule")
      f.state.resource.availability.push({
        ...scope,
        id: "bad",
        resourceId: "resource-1",
        clientRuleId: "bad",
        dayOfWeek: 4,
        startMinute: 600,
        endMinute: 500,
        status: "ACTIVE",
      })
    if (defect === "exception")
      f.state.resource.exceptions.push({
        ...scope,
        id: "bad",
        resourceId: "resource-1",
        clientExceptionId: "bad",
        startAt: new Date("2026-10-15T09:00:00Z"),
        endAt: new Date("2026-10-15T09:30:00Z"),
        kind: "CAPACITY_OVERRIDE",
        capacity: -1,
        status: "ACTIVE",
      })
    await expect(read(f.tx, input())).rejects.toMatchObject({
      code: "BOOKING_CONFIGURATION_CONFLICT",
    })
    expect(f.denied).toEqual([])
  }
})
