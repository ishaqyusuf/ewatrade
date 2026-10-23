import { afterAll, beforeEach, expect, mock, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import {
  assertHeldCommerceFinancialOrder,
  lockCommerceFinancialOrder,
} from "../customer-ledger/commerce-locks"

// Child-isolated module stand-ins replace only downstream posting/booking.
// Payment and authentic lock issuance/validation/account guards remain actual.
const downstream = { posted: 0, reconciled: 0 }
mock.module(new URL("../finance/posting.ts", import.meta.url).pathname, () => ({
  postOrderCollectionInTransaction: async (
    tx: Prisma.TransactionClient,
    input: { tenantId: string; orderId: string },
    held: object,
  ) => {
    assertHeldCommerceFinancialOrder(tx, held, input)
    downstream.posted++
  },
}))
mock.module(
  new URL("../service-commerce-bookings.ts", import.meta.url).pathname,
  () => ({
    reconcileServiceCommerceBookingPaymentInTransaction: async () => {
      downstream.reconciled++
    },
  }),
)
const { recordCommercialOrderPaymentInTransaction } = await import(
  "../commercial-payments"
)
const originalFetch = globalThis.fetch
globalThis.fetch = Object.assign(
  async () => {
    throw Error("Network is forbidden in the payment fixture")
  },
  { preconnect: originalFetch.preconnect },
)
afterAll(() => {
  globalThis.fetch = originalFetch
})
beforeEach(() => {
  downstream.posted = downstream.reconciled = 0
})
const input = {
  actorUserId: "rep-a",
  tenantId: "tenant-a",
  orderId: "order-a",
  clientPaymentId: "payment-a",
  amountMinor: 1000,
  method: "cash" as const,
  moneyAccountId: "cash-a",
}
const previous = {
  id: "stored-payment-a",
  tenantId: input.tenantId,
  orderId: input.orderId,
  amountMinor: input.amountMinor,
  method: "CASH",
  moneyAccountId: input.moneyAccountId,
  note: null,
  reference: null,
  type: "PAYMENT",
  customerAllocationId: null,
  customerAllocationReleaseId: null,
}
function fixture(
  options: {
    previous?: Record<string, unknown>
    paused?: boolean
    orderStatus?: string
    uniqueFailure?: Error
    concurrentPayment?: Record<string, unknown>
  } = {},
) {
  const order = {
    id: input.orderId,
    tenantId: input.tenantId,
    storeId: "store-a",
    customerId: null,
    currencyCode: "NGN",
    totalMinor: 1000,
    amountPaidMinor: options.previous ? 1000 : 0,
    paymentStatus: options.previous ? "PAID" : "PENDING",
    status: options.orderStatus ?? "CONFIRMED",
    payments: options.previous ? [{ ...options.previous }] : [],
  }
  const calls = {
    keys: [] as unknown[],
    accountReads: 0,
    creates: [] as unknown[],
    updates: [] as unknown[],
    raw: [] as string[],
  }
  const payments: unknown[] = []
  const committedByOtherOrder: unknown[] = []
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join("?")
      calls.raw.push(sql)
      if (sql.includes('FROM "FinanceBook"')) return [{ id: "book-a" }]
      if (sql.includes('FROM "CommercialOrder"')) return [{ ...order }]
      throw Error("Unexpected raw database port")
    },
    commercialOrder: {
      findFirst: async () => ({ ...order }),
      findUniqueOrThrow: async () => ({ ...order }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        calls.updates.push(structuredClone(data))
        return { ...order, ...data }
      },
    },
    commercialOrderPayment: {
      findUnique: async (args: unknown) => {
        calls.keys.push(structuredClone(args))
        return options.previous ? { ...options.previous } : null
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.creates.push(structuredClone(data))
        // The inert DB models another Order winning this unique identity
        // after our final lookup and before INSERT, without a real DB race.
        if (options.uniqueFailure && options.concurrentPayment) {
          committedByOtherOrder.push(structuredClone(options.concurrentPayment))
          throw options.uniqueFailure
        }
        const row = { id: "created-payment", ...data }
        payments.push(structuredClone(row))
        return row
      },
    },
    collectionIntent: { findFirst: async () => null },
    financeAccount: {
      findFirst: async () => {
        calls.accountReads++
        return {
          id: "cash-a",
          bookId: "book-a",
          name: "Cash",
          kind: "ASSET",
          purpose: "CASH",
          archivedAt: null,
          paymentMethods: ["cash"],
          paymentsPausedAt: options.paused ? new Date() : null,
        }
      },
    },
    serviceJobLine: { findMany: async () => [] },
  } as unknown as Prisma.TransactionClient
  return {
    tx,
    calls,
    payments,
    committedByOtherOrder,
    lock: () => lockCommerceFinancialOrder(tx, input),
  }
}

test("actual new payment performs one scoped key read before create under an authentic lock", async () => {
  const f = fixture()
  const held = await f.lock()
  if (!held) throw Error("Missing authentic lock")
  const result = await recordCommercialOrderPaymentInTransaction(
    f.tx,
    input,
    held,
  )
  expect(result).toMatchObject({
    amountPaidMinor: 1000,
    balanceDueMinor: 0,
    paymentStatus: "paid",
  })
  expect(f.calls.keys).toEqual([
    {
      where: {
        tenantId_clientPaymentId: {
          tenantId: input.tenantId,
          clientPaymentId: input.clientPaymentId,
        },
      },
    },
  ])
  expect(f.calls.creates).toHaveLength(1)
  expect(f.payments).toHaveLength(1)
  expect(f.calls.updates).toEqual([
    { amountPaidMinor: 1000, paymentStatus: "PAID" },
  ])
  expect(f.calls.accountReads).toBe(1)
  expect(downstream).toEqual({ posted: 1, reconciled: 1 })
})

for (const [label, change] of [
  ["Order", { orderId: "other-order" }],
  ["amount", { amountMinor: 999 }],
  ["method", { method: "POS" }],
  ["account", { moneyAccountId: "foreign-cash" }],
  ["note", { note: "Different note" }],
  ["reference", { reference: "Different reference" }],
  ["type", { type: "REFUND" }],
] as const) {
  test(`previous ${label} mismatch refuses without writes or account validation`, async () => {
    const f = fixture({ previous: { ...previous, ...change }, paused: true })
    const held = await f.lock()
    if (!held) throw Error("Missing authentic lock")
    await expect(
      recordCommercialOrderPaymentInTransaction(f.tx, input, held),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
    expect(f.calls.keys).toHaveLength(1)
    expect(f.calls.creates).toHaveLength(0)
    expect(f.calls.updates).toHaveLength(0)
    expect(f.calls.accountReads).toBe(0)
    expect(downstream).toEqual({ posted: 0, reconciled: 0 })
  })
}

test("exact previous retry succeeds after receiving account is paused without posting again", async () => {
  const f = fixture({ previous, paused: true })
  const held = await f.lock()
  if (!held) throw Error("Missing authentic lock")
  await expect(
    recordCommercialOrderPaymentInTransaction(f.tx, input, held),
  ).resolves.toEqual({
    id: previous.id,
    amountPaidMinor: 1000,
    balanceDueMinor: 0,
    paymentStatus: "paid",
  })
  expect(f.calls.keys).toHaveLength(1)
  expect(f.calls.accountReads).toBe(0)
  expect(f.calls.creates).toHaveLength(0)
  expect(f.calls.updates).toHaveLength(0)
  expect(downstream).toEqual({ posted: 0, reconciled: 0 })
})

test("a new payment still refuses a freshly paused receiving account", async () => {
  const f = fixture({ paused: true })
  const held = await f.lock()
  if (!held) throw Error("Missing authentic lock")
  await expect(
    recordCommercialOrderPaymentInTransaction(f.tx, input, held),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  expect(f.calls.keys).toHaveLength(1)
  expect(f.calls.accountReads).toBe(1)
  expect(f.calls.creates).toHaveLength(0)
  expect(f.calls.updates).toHaveLength(0)
  expect(downstream).toEqual({ posted: 0, reconciled: 0 })
})

test("a key claimed by another Order after the read retains the unique failure before downstream effects", async () => {
  const unique = Object.assign(new Error("Inert unique-constraint collision"), {
    code: "P2002",
  })
  // Simulate the DB unique constraint after a miss: this is not PostgreSQL or
  // concurrency acceptance. The actual helper must not swallow this failure.
  const foreignPayment = {
    ...previous,
    orderId: "other-order",
    clientPaymentId: input.clientPaymentId,
  }
  const f = fixture({
    uniqueFailure: unique,
    concurrentPayment: foreignPayment,
  })
  const held = await f.lock()
  if (!held) throw Error("Missing authentic lock")
  await expect(
    recordCommercialOrderPaymentInTransaction(f.tx, input, held),
  ).rejects.toBe(unique)
  expect(f.calls.keys).toHaveLength(1)
  expect(f.calls.creates).toHaveLength(1)
  expect(f.payments).toHaveLength(0)
  expect(f.calls.updates).toHaveLength(0)
  expect(f.committedByOtherOrder).toEqual([foreignPayment])
  expect(downstream).toEqual({ posted: 0, reconciled: 0 })
})

test("payment cannot reuse another transaction's authentic lock", async () => {
  const owner = fixture()
  const held = await owner.lock()
  if (!held) throw Error("Missing authentic lock")
  const other = fixture()
  await expect(
    recordCommercialOrderPaymentInTransaction(other.tx, input, held),
  ).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
  expect(other.calls.keys).toHaveLength(0)
  expect(other.calls.raw).toHaveLength(0)
  expect(other.calls.creates).toHaveLength(0)
})

test("late payment settles an already completed Order without changing work or fulfillment status", async () => {
  const f = fixture({ orderStatus: "COMPLETED" })
  const held = await f.lock()
  if (!held) throw Error("Missing authentic lock")
  const result = await recordCommercialOrderPaymentInTransaction(
    f.tx,
    input,
    held,
  )
  expect(result).toMatchObject({
    amountPaidMinor: 1000,
    balanceDueMinor: 0,
    paymentStatus: "paid",
  })
  expect(f.calls.updates).toEqual([
    { amountPaidMinor: 1000, paymentStatus: "PAID" },
  ])
  expect(f.payments).toHaveLength(1)
  expect(downstream).toEqual({ posted: 1, reconciled: 1 })
})
