import { expect, test } from "bun:test"
import { toPublicError } from "@ewatrade/errors"
import { createCallerFactory } from "../init"
import { ordersRouter } from "./orders"

const createCaller = createCallerFactory(ordersRouter)
const identity = {
  orderId: "order",
  reason: "Customer request",
  clientOperationId: "amend-1",
  expectedReviewDigest: "a".repeat(64),
}
const patch = { notes: "Updated" }
const changes = [{ orderLineId: "line", quantity: "2" }]
function context(role: string, db: unknown, accessible = true) {
  return {
    db,
    requestId: "amendment-test",
    session: {
      session: { id: "session", token: "token" },
      user: { id: "actor" },
    },
    tenantContext: {
      tenant: { id: "server-tenant", qaPurgeStartedAt: null },
      membership: { id: "membership", role },
      activeStore: { id: "server-store" },
      stores: accessible ? [{ id: "server-store" }] : [],
    },
  }
}
function operations(caller: ReturnType<typeof createCaller>) {
  return [
    () => caller.cancellationReview({ orderId: identity.orderId }),
    () => caller.metadataReview({ orderId: identity.orderId, patch }),
    () => caller.replacementReview({ orderId: identity.orderId, changes }),
    () => caller.cancel(identity),
    () => caller.amendMetadata({ ...identity, patch }),
    () => caller.replace({ ...identity, changes }),
  ]
}
test("all amendment routes refuse non-management roles before database access", async () => {
  let accesses = 0
  const db = new Proxy(
    {},
    {
      get() {
        accesses++
        throw Error("Unexpected database access")
      },
    },
  )
  for (const role of ["CASHIER", "OPERATOR", "SUPPORT", "MEMBER"])
    for (const operation of operations(
      createCaller(context(role, db) as never),
    ))
      await expect(operation()).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(accesses).toBe(0)
})
test("amendment routes require an accessible active Store even for owners", async () => {
  let accesses = 0
  const db = new Proxy(
    {},
    {
      get() {
        accesses++
        throw Error("Unexpected database access")
      },
    },
  )
  for (const operation of operations(
    createCaller(context("OWNER", db, false) as never),
  ))
    await expect(operation()).rejects.toMatchObject({ code: "NOT_FOUND" })
  expect(accesses).toBe(0)
})
test("amendment commands reject supplied authority and payment fields", async () => {
  let accesses = 0
  const db = new Proxy(
    {},
    {
      get() {
        accesses++
        throw Error("Unexpected database access")
      },
    },
  )
  const caller = createCaller(context("OWNER", db) as never)
  for (const extra of [
    { tenantId: "foreign" },
    { actorUserId: "foreign" },
    { storeId: "foreign" },
    { amountPaidMinor: 0 },
  ]) {
    await expect(
      caller.cancel({ ...identity, ...extra } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(
      caller.amendMetadata({ ...identity, patch, ...extra } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(
      caller.replace({ ...identity, changes, ...extra } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  }
  expect(accesses).toBe(0)
})

test("a refused amendment tells the person why instead of a generic error", async () => {
  const order = {
    id: identity.orderId,
    tenantId: "server-tenant",
    storeId: "server-store",
    orderNumber: "ORD-001",
    status: "CONFIRMED",
    paymentStatus: "PENDING",
    amountPaidMinor: 0,
    currencyCode: "NGN",
    subtotalMinor: 0,
    totalMinor: 0,
    discountMinor: 0,
    taxMinor: 0,
    serviceChargeMinor: 0,
    customerId: null,
    customerName: null,
    customerPhone: null,
    customerEmail: null,
    deliveryDueAt: null,
    notes: null,
    updatedAt: new Date("2026-10-11T00:00:00.000Z"),
    store: { status: "ACTIVE" },
    acceptedQuoteVersion: null,
    acceptedCommerceQuoteVersion: null,
    serviceIntake: null,
    prescriptionPickupFulfillment: null,
    prescriptionDeliveryAddress: null,
    prescriptionDeliveryAssignment: null,
    _count: {
      lines: 0,
      payments: 0,
      ledgerEntries: 0,
      returns: 0,
      serviceAuthorizations: 0,
      serviceFulfillments: 0,
      serviceJobs: 0,
      prescriptionPaymentIntents: 0,
      serviceBookings: 0,
    },
    lines: [],
  }
  const db = {
    commercialOrder: { findFirst: async () => order },
    customer: { findFirst: async () => null },
  }
  const caller = createCaller(context("OWNER", db) as never)
  const failure = await caller
    .metadataReview({
      orderId: identity.orderId,
      patch: { customerId: "gone" },
    })
    .catch((error: unknown) => error)
  expect(failure).toMatchObject({ code: "BAD_REQUEST" })
  expect(toPublicError(failure)).toMatchObject({
    code: "RULE_REJECTED",
    message: "Selected Customer not found in this business.",
  })
})
