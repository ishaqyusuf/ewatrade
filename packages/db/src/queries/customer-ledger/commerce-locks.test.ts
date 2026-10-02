import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { lockCommerceFinancialOrder } from "./commerce-locks"

type OrderIdentity = { customerId: string | null; currencyCode: string }
type CommerceOrder = OrderIdentity & {
  id: string
  tenantId: string
  orderNumber: string
  totalMinor: number
}

type FindFirstArgs = {
  where: { id: string; tenantId: string }
  select?: Record<string, boolean>
}

type RawCall = { query: string; values: unknown[] }

function transactionFixture(options: {
  findFirst: Array<OrderIdentity | CommerceOrder | null>
  financeBooks?: Array<{ id: string }>
  customerAccounts?: Array<{ id: string }>
  orderLocks?: Array<{ id: string }>
}) {
  const findFirstCalls: FindFirstArgs[] = []
  const rawCalls: RawCall[] = []
  const findFirstResults = [...options.findFirst]
  const financeBooks = [...(options.financeBooks ?? [])]
  const customerAccounts = [...(options.customerAccounts ?? [])]
  const orderLocks = [...(options.orderLocks ?? [])]

  const tx = {
    commercialOrder: {
      findFirst: async (args: FindFirstArgs) => {
        findFirstCalls.push(args)
        return findFirstResults.shift() ?? null
      },
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join("?")
      rawCalls.push({ query, values })
      if (query.includes('FROM "FinanceBook"')) {
        const book = financeBooks.shift()
        return book ? [book] : []
      }
      if (query.includes('FROM "CustomerLedgerAccount"'))
        return customerAccounts.length ? [customerAccounts.shift()] : []
      if (query.includes('FROM "CommercialOrder"'))
        return orderLocks.length ? [orderLocks.shift()] : []
      throw new Error(`Unexpected raw query: ${query}`)
    },
  }

  // The structural fixture deliberately implements only the transaction surface
  // used by this helper; keep the cast at this test-fixture boundary.
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    findFirstCalls,
    rawCalls,
  }
}

const scopedArgs = (call: FindFirstArgs) => call.where

test("returns null before any finance or Order lock when the scoped Order is missing", async () => {
  const fixture = transactionFixture({ findFirst: [null] })

  const result = await lockCommerceFinancialOrder(fixture.tx, {
    tenantId: "tenant-a",
    orderId: "order-a",
  })

  expect(result).toBeNull()
  expect(fixture.findFirstCalls).toHaveLength(1)
  expect(fixture.findFirstCalls[0]?.where).toEqual({
    id: "order-a",
    tenantId: "tenant-a",
  })
  expect(fixture.rawCalls).toHaveLength(0)
})

test("scopes both identity reads and all lock queries to the requested Tenant", async () => {
  const order: CommerceOrder = {
    id: "order-a",
    tenantId: "tenant-a",
    customerId: "customer-a",
    currencyCode: "NGN",
    orderNumber: "A-1",
    totalMinor: 2500,
  }
  const fixture = transactionFixture({
    findFirst: [{ customerId: "customer-a", currencyCode: "NGN" }, order],
    financeBooks: [{ id: "book-a" }],
    customerAccounts: [{ id: "account-a" }],
    orderLocks: [{ id: "order-a" }],
  })

  const result = await lockCommerceFinancialOrder(fixture.tx, {
    tenantId: "tenant-a",
    orderId: "order-a",
  })

  expect(fixture.findFirstCalls).toHaveLength(2)
  expect(fixture.findFirstCalls.map(scopedArgs)).toEqual([
    { id: "order-a", tenantId: "tenant-a" },
    { id: "order-a", tenantId: "tenant-a" },
  ])
  expect(fixture.rawCalls.map((call) => call.values)).toEqual([
    ["tenant-a", "NGN"],
    ["tenant-a", "customer-a", "NGN"],
    ["order-a", "tenant-a"],
  ])
  expect(result?.order.id).toBe(order.id)
})

for (const changed of [
  { customerId: "customer-b", currencyCode: "NGN" },
  { customerId: "customer-a", currencyCode: "USD" },
  { customerId: null, currencyCode: "NGN" },
]) {
  test(`rejects changed financial identity ${JSON.stringify(changed)}`, async () => {
    const fixture = transactionFixture({
      findFirst: [
        { customerId: "customer-a", currencyCode: "NGN" },
        {
          id: "order-a",
          tenantId: "tenant-a",
          ...changed,
          orderNumber: "A-1",
          totalMinor: 2500,
        },
      ],
      financeBooks: [{ id: "book-a" }],
      customerAccounts: [{ id: "account-a" }],
      orderLocks: [{ id: "order-a" }],
    })

    await expect(
      lockCommerceFinancialOrder(fixture.tx, {
        tenantId: "tenant-a",
        orderId: "order-a",
      }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT", name: "CatalogError" })

    expect(fixture.rawCalls.map((call) => call.values)).toEqual([
      ["tenant-a", "NGN"],
      ["tenant-a", "customer-a", "NGN"],
      ["order-a", "tenant-a"],
    ])
    expect(
      fixture.rawCalls.some((call) => call.values.includes("customer-b")),
    ).toBe(false)
    expect(fixture.rawCalls.some((call) => call.values.includes("USD"))).toBe(
      false,
    )
  })
}

test("returns null if the Order disappears before its row can be locked", async () => {
  const fixture = transactionFixture({
    findFirst: [{ customerId: null, currencyCode: "NGN" }],
    financeBooks: [{ id: "book-a" }],
  })
  expect(
    await lockCommerceFinancialOrder(fixture.tx, {
      tenantId: "tenant-a",
      orderId: "order-a",
    }),
  ).toBeNull()
  expect(fixture.findFirstCalls).toHaveLength(1)
})

test("still locks and rereads the Order when no finance book exists", async () => {
  const order: CommerceOrder = {
    id: "order-a",
    tenantId: "tenant-a",
    customerId: null,
    currencyCode: "NGN",
    orderNumber: "A-1",
    totalMinor: 2500,
  }
  const fixture = transactionFixture({
    findFirst: [{ customerId: null, currencyCode: "NGN" }, order],
    orderLocks: [{ id: "order-a" }],
  })

  const result = await lockCommerceFinancialOrder(fixture.tx, {
    tenantId: "tenant-a",
    orderId: "order-a",
  })

  expect(result?.order.id).toBe(order.id)
  expect(result?.context).toBeNull()
  expect(fixture.rawCalls).toHaveLength(2)
  expect(fixture.rawCalls[0]?.query).toContain('FROM "FinanceBook"')
  expect(fixture.rawCalls[1]?.query).toContain('FROM "CommercialOrder"')
  expect(fixture.rawCalls[1]?.values).toEqual(["order-a", "tenant-a"])
})

test("returns the locked reread and the acquired finance context", async () => {
  const lockedOrder: CommerceOrder = {
    id: "order-a",
    tenantId: "tenant-a",
    customerId: "customer-a",
    currencyCode: "NGN",
    orderNumber: "A-1",
    totalMinor: 2500,
  }
  const fixture = transactionFixture({
    findFirst: [{ customerId: "customer-a", currencyCode: "NGN" }, lockedOrder],
    financeBooks: [{ id: "book-a" }],
    customerAccounts: [{ id: "account-a" }],
    orderLocks: [{ id: "order-a" }],
  })

  const result = await lockCommerceFinancialOrder(fixture.tx, {
    tenantId: "tenant-a",
    orderId: "order-a",
  })

  expect(result?.order.id).toBe(lockedOrder.id)
  expect(result?.context).toEqual({ bookId: "book-a", accountId: "account-a" })
  expect(fixture.findFirstCalls[1]?.select).toBeUndefined()
  expect(fixture.rawCalls.map((call) => call.query)).toEqual([
    expect.stringContaining('FROM "FinanceBook"'),
    expect.stringContaining('FROM "CustomerLedgerAccount"'),
    expect.stringContaining('FROM "CommercialOrder"'),
  ])
})

for (const changed of [
  { customerId: "customer-b", currencyCode: "NGN" },
  { customerId: "customer-a", currencyCode: "USD" },
]) {
  test(`rejects an unplanned initial identity ${JSON.stringify(changed)} before locking`, async () => {
    const fixture = transactionFixture({
      findFirst: [changed],
    })

    await expect(
      lockCommerceFinancialOrder(fixture.tx, {
        expectedIdentity: {
          customerId: "customer-a",
          currencyCode: "NGN",
        },
        tenantId: "tenant-a",
        orderId: "order-a",
      }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT", name: "CatalogError" })

    expect(fixture.findFirstCalls).toHaveLength(1)
    expect(fixture.rawCalls).toHaveLength(0)
  })
}

test("uses a matching expected identity before FinanceBook, account, Order, and reread", async () => {
  const order: CommerceOrder = {
    id: "order-a",
    tenantId: "tenant-a",
    customerId: "customer-a",
    currencyCode: "NGN",
    orderNumber: "A-1",
    totalMinor: 2500,
  }
  const fixture = transactionFixture({
    findFirst: [{ customerId: "customer-a", currencyCode: "NGN" }, order],
    financeBooks: [{ id: "book-a" }],
    customerAccounts: [{ id: "account-a" }],
    orderLocks: [{ id: "order-a" }],
  })

  const result = await lockCommerceFinancialOrder(fixture.tx, {
    expectedIdentity: { customerId: "customer-a", currencyCode: "NGN" },
    tenantId: "tenant-a",
    orderId: "order-a",
  })

  expect(result?.order).toMatchObject(order)
  expect(result?.context).toEqual({ bookId: "book-a", accountId: "account-a" })
  expect(fixture.findFirstCalls).toHaveLength(2)
  expect(fixture.findFirstCalls[1]?.select).toBeUndefined()
  expect(fixture.rawCalls.map((call) => call.query)).toEqual([
    expect.stringContaining('FROM "FinanceBook"'),
    expect.stringContaining('FROM "CustomerLedgerAccount"'),
    expect.stringContaining('FROM "CommercialOrder"'),
  ])
})
