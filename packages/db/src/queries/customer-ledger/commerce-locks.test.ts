import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import {
  assertHeldCommerceFinancialOrder,
  lockCommerceFinancialOrder,
} from "./commerce-locks"

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
  findFirst: Array<OrderIdentity | null>
  financeBooks?: Array<{ id: string }>
  customerAccounts?: Array<{ id: string }>
  orderLocks?: CommerceOrder[]
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
        if (!args.select) throw Error("Redundant unlocked ORM reread")
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

test("scopes the planning read and authoritative row lock to the requested Tenant", async () => {
  const order: CommerceOrder = {
    id: "order-a",
    tenantId: "tenant-a",
    customerId: "customer-a",
    currencyCode: "NGN",
    orderNumber: "A-1",
    totalMinor: 2500,
  }
  const fixture = transactionFixture({
    findFirst: [{ customerId: "customer-a", currencyCode: "NGN" }],
    financeBooks: [{ id: "book-a" }],
    customerAccounts: [{ id: "account-a" }],
    orderLocks: [order],
  })

  const result = await lockCommerceFinancialOrder(fixture.tx, {
    tenantId: "tenant-a",
    orderId: "order-a",
  })

  expect(fixture.findFirstCalls).toHaveLength(1)
  expect(fixture.findFirstCalls.map(scopedArgs)).toEqual([
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
      findFirst: [{ customerId: "customer-a", currencyCode: "NGN" }],
      financeBooks: [{ id: "book-a" }],
      customerAccounts: [{ id: "account-a" }],
      orderLocks: [
        {
          id: "order-a",
          tenantId: "tenant-a",
          ...changed,
          orderNumber: "A-1",
          totalMinor: 2500,
        },
      ],
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

test("still reads the authoritative locked Order when no finance book exists", async () => {
  const order: CommerceOrder = {
    id: "order-a",
    tenantId: "tenant-a",
    customerId: null,
    currencyCode: "NGN",
    orderNumber: "A-1",
    totalMinor: 2500,
  }
  const fixture = transactionFixture({
    findFirst: [{ customerId: null, currencyCode: "NGN" }],
    orderLocks: [order],
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

test("returns the authoritative raw locked row and the acquired finance context", async () => {
  const lockedOrder: CommerceOrder = {
    id: "order-a",
    tenantId: "tenant-a",
    customerId: "customer-a",
    currencyCode: "NGN",
    orderNumber: "A-1",
    totalMinor: 2500,
  }
  const fixture = transactionFixture({
    findFirst: [{ customerId: "customer-a", currencyCode: "NGN" }],
    financeBooks: [{ id: "book-a" }],
    customerAccounts: [{ id: "account-a" }],
    orderLocks: [lockedOrder],
  })

  const result = await lockCommerceFinancialOrder(fixture.tx, {
    tenantId: "tenant-a",
    orderId: "order-a",
  })

  expect(result?.context).toEqual({ bookId: "book-a", accountId: "account-a" })
  expect(Object.is(result?.order, lockedOrder)).toBe(true)
  expect(fixture.rawCalls.map((call) => call.query)).toEqual([
    expect.stringContaining('FROM "FinanceBook"'),
    expect.stringContaining('FROM "CustomerLedgerAccount"'),
    expect.stringContaining('FROM "CommercialOrder"'),
  ])
})

test("plain forged lock evidence is refused without any database read", () => {
  const fixture = transactionFixture({ findFirst: [] })
  expect(() =>
    assertHeldCommerceFinancialOrder(
      fixture.tx,
      {},
      {
        tenantId: "tenant-a",
        orderId: "order-a",
      },
    ),
  ).toThrow()
  expect(fixture.findFirstCalls).toHaveLength(0)
  expect(fixture.rawCalls).toHaveLength(0)
})

test("authentic evidence cannot be cloned, moved to another transaction or rebound", async () => {
  const order: CommerceOrder = {
    id: "order-a",
    tenantId: "tenant-a",
    customerId: null,
    currencyCode: "NGN",
    orderNumber: "A-1",
    totalMinor: 2500,
  }
  const fixture = transactionFixture({
    findFirst: [{ customerId: null, currencyCode: "NGN" }],
    financeBooks: [{ id: "book-a" }],
    orderLocks: [order],
  })
  const lock = await lockCommerceFinancialOrder(fixture.tx, {
    tenantId: "tenant-a",
    orderId: "order-a",
  })
  if (!lock) throw Error("Expected authentic held lock")
  const scope = { tenantId: "tenant-a", orderId: "order-a" }
  expect(() =>
    assertHeldCommerceFinancialOrder(fixture.tx, lock, scope),
  ).not.toThrow()
  expect(() =>
    assertHeldCommerceFinancialOrder(fixture.tx, { ...lock }, scope),
  ).toThrow()
  const other = transactionFixture({ findFirst: [] })
  expect(() =>
    assertHeldCommerceFinancialOrder(other.tx, lock, scope),
  ).toThrow()
  expect(() =>
    assertHeldCommerceFinancialOrder(fixture.tx, lock, {
      ...scope,
      tenantId: "tenant-b",
    }),
  ).toThrow()
  expect(() =>
    assertHeldCommerceFinancialOrder(fixture.tx, lock, {
      ...scope,
      orderId: "order-b",
    }),
  ).toThrow()
  expect(fixture.findFirstCalls).toHaveLength(1)
  expect(other.findFirstCalls).toHaveLength(0)
  expect(other.rawCalls).toHaveLength(0)
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

test("uses a matching expected identity before FinanceBook, account and authoritative Order", async () => {
  const order: CommerceOrder = {
    id: "order-a",
    tenantId: "tenant-a",
    customerId: "customer-a",
    currencyCode: "NGN",
    orderNumber: "A-1",
    totalMinor: 2500,
  }
  const fixture = transactionFixture({
    findFirst: [{ customerId: "customer-a", currencyCode: "NGN" }],
    financeBooks: [{ id: "book-a" }],
    customerAccounts: [{ id: "account-a" }],
    orderLocks: [order],
  })

  const result = await lockCommerceFinancialOrder(fixture.tx, {
    expectedIdentity: { customerId: "customer-a", currencyCode: "NGN" },
    tenantId: "tenant-a",
    orderId: "order-a",
  })

  expect(result?.order).toMatchObject(order)
  expect(result?.context).toEqual({ bookId: "book-a", accountId: "account-a" })
  expect(fixture.findFirstCalls).toHaveLength(1)
  expect(fixture.findFirstCalls[0]?.select).toEqual({
    customerId: true,
    currencyCode: true,
  })
  expect(fixture.rawCalls.map((call) => call.query)).toEqual([
    expect.stringContaining('FROM "FinanceBook"'),
    expect.stringContaining('FROM "CustomerLedgerAccount"'),
    expect.stringContaining('FROM "CommercialOrder"'),
  ])
})
