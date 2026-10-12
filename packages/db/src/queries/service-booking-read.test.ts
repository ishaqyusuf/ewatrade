import { expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import { getAssistantServiceBookingInTransaction } from "./service-booking-read"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"

const scope = {
  actorUserId: "attendant-user",
  tenantId: "tenant-1",
  storeId: "store-1",
}
const input = {
  ...scope,
  bookingId: "booking-1",
  sourceId: "request-1",
  offeringId: "offering-1",
}

function fixture() {
  const state = {
    activeMember: true,
    accepted: true,
    attendant: true,
    role: "OPERATOR",
    scoped: false,
    storeGranted: true,
    storeActive: true,
    runtimeReady: true,
    policyAllowed: true,
    sourceStatus: "QUOTED",
    quoteExists: true,
    orderExists: true,
  }
  const booking = {
    id: input.bookingId,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    sourceId: input.sourceId,
    sourceType: "SERVICE_REQUEST",
    resourceId: "resource-1",
    quoteVersionId: "version-1" as string | null,
    commercialOrderId: "order-1" as string | null,
    serviceJobId: "job-1",
    status: "CONFIRMED",
    revision: 7,
    startAt: new Date("2026-11-01T09:00:00Z"),
    endAt: new Date("2026-11-01T09:30:00Z"),
    capacity: 1,
    timezoneSnapshot: "Africa/Lagos",
    paymentStatus: "PARTIALLY_PAID",
    paymentRequirementSnapshot: "DEPOSIT",
    depositAmountMinorSnapshot: 2000,
    payableAmountMinorSnapshot: 8000,
    requiredPaymentMinorSnapshot: 2000,
    currencyCodeSnapshot: "NGN",
    paymentPolicyRevisionSnapshot: 3,
    cancellationWindowSnapshot: 90,
    refundPolicySnapshot: "MANUAL_REVIEW",
    cancellationPolicyRevisionSnapshot: 2,
    offeringPolicyRevisionSnapshot: 4,
    confirmedAt: new Date("2026-10-12T10:00:00Z"),
    arrivedAt: null,
    serviceStartedAt: null,
    completedAt: null,
    cancelledAt: null,
    noShowAt: null,
    customerContactCiphertext: "private-never-return",
    payloadHash: "private-never-return",
    resource: {
      id: "resource-1",
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      name: "Chair A",
      kind: "EQUIPMENT",
      status: "ACTIVE",
      capacity: 4,
      revision: 12,
    },
    offeringConfig: {
      id: "config-1",
      offeringId: input.offeringId,
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      status: "ACTIVE",
      revision: 9,
    },
  }
  const quote = {
    id: "version-1",
    quoteId: "quote-1",
    acceptedOrderId: "order-1",
  }
  const order = {
    id: "order-1",
    orderNumber: "ORD-001",
    status: "CONFIRMED",
    currencyCode: "NGN",
    totalMinor: 7500,
    amountPaidMinor: 1000,
    paymentStatus: "AUTHORIZED",
    acceptedCommerceQuoteVersion: { id: "version-1" },
  }
  const calls: Array<{ table: string; args: any }> = []
  const writes: string[] = []
  function delegate(table: string, findFirst: (args: any) => unknown) {
    return new Proxy(
      { findFirst },
      {
        get(target, method: string) {
          if (method === "findFirst")
            return async (args: any) => {
              calls.push({ table, args })
              return target.findFirst(args)
            }
          if (table === "policy" && method === "findMany")
            return async (args: any) => {
              calls.push({ table, args })
              return state.policyAllowed
                ? allowedServiceCommercePolicyDecisionRows()
                : []
            }
          return async () => {
            writes.push(`${table}.${method}`)
            throw new Error(`Unexpected access/write: ${table}.${method}`)
          }
        },
      },
    )
  }
  const client = {
    membership: delegate("membership", ({ where }) => {
      if (
        !state.activeMember ||
        where.tenantId !== scope.tenantId ||
        (where.userId && where.userId !== scope.actorUserId) ||
        (where.id && where.id !== "actor-member")
      )
        return null
      if (
        where.acceptedAt &&
        (!state.accepted ||
          (!state.attendant && !["OWNER", "ADMIN"].includes(state.role)))
      )
        return null
      return {
        id: "actor-member",
        role: state.role,
        status: "ACTIVE",
        staffAccessMode: state.scoped ? "SCOPED" : "LEGACY",
        staffStoreAssignments: state.storeGranted
          ? [{ storeId: scope.storeId, role: "OPERATOR", status: "ACTIVE" }]
          : [],
      }
    }),
    store: delegate("store", ({ where }) =>
      state.storeActive &&
      where.id === scope.storeId &&
      where.tenantId === scope.tenantId
        ? { id: scope.storeId, countryCode: "NG" }
        : null,
    ),
    serviceCommerceStoreProfile: delegate("profile", () =>
      state.runtimeReady ? { bookingEnabled: true, status: "ACTIVE" } : null,
    ),
    serviceCommercePolicyDecision: delegate("policy", () => null),
    serviceCommercePolicyAuditEvent: delegate("policy-audit", () => null),
    serviceBooking: delegate("booking", ({ where }) =>
      booking.id === where.id &&
      booking.tenantId === where.tenantId &&
      booking.storeId === where.storeId &&
      booking.sourceId === where.sourceId &&
      booking.sourceType === where.sourceType &&
      booking.offeringConfig.offeringId === where.offeringConfig.offeringId
        ? booking
        : null,
    ),
    serviceRequest: delegate("source", ({ where }) =>
      where.id === booking.sourceId &&
      where.tenantId === scope.tenantId &&
      where.storeId === scope.storeId
        ? {
            id: booking.sourceId,
            status: state.sourceStatus,
            customerPhone: "private-never-return",
          }
        : null,
    ),
    commerceQuoteVersion: delegate("quote", ({ where }) =>
      state.quoteExists &&
      where.id === quote.id &&
      where.quote.sourceId === booking.sourceId &&
      where.quote.sourceType === "SERVICE_REQUEST" &&
      where.quote.tenantId === scope.tenantId &&
      where.quote.storeId === scope.storeId
        ? quote
        : null,
    ),
    commercialOrder: delegate("order", ({ where }) =>
      state.orderExists &&
      where.id === order.id &&
      where.tenantId === scope.tenantId &&
      where.storeId === scope.storeId
        ? order
        : null,
    ),
    serviceBookingAccessCapability: delegate("capability", () => {
      throw new Error("Public capabilities must not be read")
    }),
  }
  return {
    state,
    booking,
    quote,
    order,
    calls,
    writes,
    tx: client as unknown as Prisma.TransactionClient,
  }
}

test("saved time/capacity/payment snapshots remain separate from current configuration and Order facts", async () => {
  const f = fixture()
  const result = await getAssistantServiceBookingInTransaction(f.tx, input)
  expect(result).toMatchObject({
    id: "booking-1",
    sourceId: "request-1",
    offeringId: "offering-1",
    quoteId: "quote-1",
    quoteVersionId: "version-1",
    revision: 7,
    startAt: "2026-11-01T09:00:00.000Z",
    endAt: "2026-11-01T09:30:00.000Z",
    timezone: "Africa/Lagos",
    reservedCapacity: 1,
    resource: { currentCapacity: 4, currentRevision: 12 },
    configuration: { currentRevision: 9, bookedRevision: 4 },
    capacityAssessment: "not_checked",
    payment: {
      storedStatus: "partially_paid",
      payableMinor: 8000,
      requiredMinor: 2000,
      policyRevision: 3,
      currentOrder: {
        totalMinor: 7500,
        recordedAmountPaidMinor: 1000,
        storedPaymentStatus: "authorized",
      },
      providerSettlement: "not_checked",
    },
  })
  expect(result).not.toHaveProperty("nextOperations")
  expect(JSON.stringify(result)).not.toContain("private-never-return")
  const selected = f.calls.find((call) => call.table === "booking")!.args.select
  for (const field of [
    "accessCapabilities",
    "customerContactCiphertext",
    "customerName",
    "payloadHash",
    "notificationIntents",
    "hold",
  ])
    expect(selected).not.toHaveProperty(field)
  expect(f.calls.some((call) => call.table === "capability")).toBe(false)
  expect(f.writes).toEqual([])
})

test("fresh accepted attendant authority, Store status and Store grants are mandatory", async () => {
  const f = fixture()
  for (const field of [
    "activeMember",
    "accepted",
    "attendant",
    "storeActive",
    "storeGranted",
  ] as const) {
    f.state.scoped = true
    f.state[field] = false
    await expect(
      getAssistantServiceBookingInTransaction(f.tx, input),
    ).rejects.toMatchObject({ code: "BOOKING_FORBIDDEN" })
    f.state[field] = true
  }
  const actorPredicate = f.calls.find((call) => call.table === "membership")!
    .args.where
  expect(actorPredicate).toMatchObject({
    acceptedAt: { not: null },
    status: "ACTIVE",
    tenantId: scope.tenantId,
    userId: scope.actorUserId,
  })
  expect(actorPredicate.OR[1]).toMatchObject({
    serviceCommerceStoreTeamAssignments: {
      some: {
        capability: "ATTENDANT",
        status: "ACTIVE",
        storeId: scope.storeId,
        tenantId: scope.tenantId,
      },
    },
  })
  expect(f.writes).toEqual([])
})

test("exact saved booking tuple and linked resource scope cannot redirect to another record", async () => {
  const f = fixture()
  for (const field of [
    "bookingId",
    "sourceId",
    "offeringId",
    "tenantId",
    "storeId",
    "actorUserId",
  ] as const) {
    await expect(
      getAssistantServiceBookingInTransaction(f.tx, {
        ...input,
        [field]: "foreign",
      }),
    ).rejects.toBeInstanceOf(Error)
  }
  f.booking.resource.storeId = "foreign"
  await expect(
    getAssistantServiceBookingInTransaction(f.tx, input),
  ).rejects.toMatchObject({ code: "BOOKING_NOT_FOUND" })
  f.booking.resource.storeId = scope.storeId
  f.booking.offeringConfig.tenantId = "foreign"
  await expect(
    getAssistantServiceBookingInTransaction(f.tx, input),
  ).rejects.toMatchObject({ code: "BOOKING_NOT_FOUND" })
  expect(f.writes).toEqual([])
})

test("closed booking runtime, blocked policy and ineligible/clinical sources fail without writes", async () => {
  const f = fixture()
  f.state.runtimeReady = false
  await expect(
    getAssistantServiceBookingInTransaction(f.tx, input),
  ).rejects.toMatchObject({ code: "BOOKING_BLOCKED" })
  f.state.runtimeReady = true
  f.state.policyAllowed = false
  await expect(
    getAssistantServiceBookingInTransaction(f.tx, input),
  ).rejects.toMatchObject({ code: "POLICY_BLOCKED" })
  f.state.policyAllowed = true
  f.state.sourceStatus = "WITHDRAWN"
  await expect(
    getAssistantServiceBookingInTransaction(f.tx, input),
  ).rejects.toMatchObject({ code: "BOOKING_NOT_FOUND" })
  f.state.sourceStatus = "QUOTED"
  f.booking.sourceType = "PRESCRIPTION_REQUEST"
  await expect(
    getAssistantServiceBookingInTransaction(f.tx, input),
  ).rejects.toMatchObject({ code: "BOOKING_NOT_FOUND" })
  expect(f.writes).toEqual([])
})

test("original Quote/Order linkage is checked; missing payment context is never a paid zero", async () => {
  const f = fixture()
  f.order.acceptedCommerceQuoteVersion.id = "different-version"
  await expect(
    getAssistantServiceBookingInTransaction(f.tx, input),
  ).rejects.toMatchObject({ code: "BOOKING_NOT_FOUND" })
  f.order.acceptedCommerceQuoteVersion.id = "version-1"
  f.quote.acceptedOrderId = "different-order"
  await expect(
    getAssistantServiceBookingInTransaction(f.tx, input),
  ).rejects.toMatchObject({ code: "BOOKING_NOT_FOUND" })
  f.quote.acceptedOrderId = "order-1"
  f.state.orderExists = false
  await expect(
    getAssistantServiceBookingInTransaction(f.tx, input),
  ).rejects.toMatchObject({ code: "BOOKING_NOT_FOUND" })
  f.state.orderExists = true
  f.state.quoteExists = false
  await expect(
    getAssistantServiceBookingInTransaction(f.tx, input),
  ).rejects.toMatchObject({ code: "BOOKING_NOT_FOUND" })
  expect(f.writes).toEqual([])
})

test("unlinked and refunded/cancelled saved facts are preserved without settlement inference", async () => {
  const f = fixture()
  f.booking.commercialOrderId = null
  f.booking.quoteVersionId = null
  f.booking.status = "CANCELLED"
  f.booking.paymentStatus = "PARTIALLY_REFUNDED"
  const result = await getAssistantServiceBookingInTransaction(f.tx, input)
  expect(result).toMatchObject({
    status: "cancelled",
    quoteId: null,
    commercialOrderId: null,
    payment: {
      storedStatus: "partially_refunded",
      currentOrder: null,
      providerSettlement: "not_checked",
    },
  })
  expect(
    f.calls.some((call) => call.table === "quote" || call.table === "order"),
  ).toBe(false)
  expect(f.writes).toEqual([])
})
