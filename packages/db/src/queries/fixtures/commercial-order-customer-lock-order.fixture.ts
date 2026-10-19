import { expect, test } from "bun:test"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { CatalogError } from "../catalog-errors"
import {
  type CreateCommercialOrderInput,
  createCommercialOrder,
} from "../commercial-orders"

// Actual canonical composition and customer provisioning over deterministic ports.
// Valid requests stop at the next catalog provisioning port; these tests establish
// prefix ordering and rollback, not completed Order/ledger or PostgreSQL locking.
const stop = Error("Inert boundary after customer and financial coordination")
type Customer = { id: string; name: string; tenantId: string }
function request(): CreateCommercialOrderInput {
  return {
    actorUserId: "author",
    tenantId: "tenant",
    storeId: "store",
    clientOrderId: "new-customer-order",
    schemaVersion: 1,
    customerMode: "create",
    customerName: "New customer",
    customerEmail: "new@example.invalid",
    customerPhone: "+234000000",
    lines: [{ custom: "quick_sale", amountMinor: 500, description: "Rice" }],
  }
}
function fixture(options: {
  book: boolean
  appeared?: boolean
  existingCustomer?: boolean
}) {
  const events: Array<{ name: string; values?: unknown[] }> = []
  let customers: Customer[] = options.existingCustomer
    ? [{ id: "existing-customer", name: "New customer", tenantId: "tenant" }]
    : []
  let rollbacks = 0
  let attempts = 0
  let orderWrites = 0
  const db = {
    $transaction: async <T>(
      run: (tx: Prisma.TransactionClient) => Promise<T>,
      settings: unknown,
    ): Promise<T> => {
      expect(settings).toEqual({ maxWait: 10000, timeout: 30000 })
      const local = structuredClone(customers)
      const tx = {
        $queryRaw: async (query: unknown, ...values: unknown[]) => {
          const sql = Array.isArray(query)
            ? query.join(" ")
            : ((query as { strings?: string[] }).strings?.join(" ") ?? "")
          if (sql.includes('FROM "FinanceBook"')) {
            const locking = sql.includes("FOR UPDATE")
            events.push({ name: locking ? "Book" : "Book-presence", values })
            return options.book || (!locking && options.appeared)
              ? [{ id: "book" }]
              : []
          }
          if (sql.includes('FROM "CustomerLedgerAccount"')) {
            events.push({ name: "Account", values })
            return []
          }
          if (sql.includes('FROM "Tenant"')) {
            events.push({ name: "Tenant", values })
            return [{ id: "tenant" }]
          }
          throw Error("Unexpected inert canonical SQL port")
        },
        commercialOrder: {
          findUnique: async () => {
            events.push({ name: "previous-order" })
            return null
          },
          create: async () => {
            orderWrites++
            throw Error("Unexpected Order creation past bounded catalog seam")
          },
        },
        store: {
          findFirst: async () => {
            events.push({ name: "Store" })
            return { id: "store", currencyCode: "NGN" }
          },
        },
        customer: {
          createMany: async () => {
            events.push({ name: "customer-provision" })
            attempts++
            if (!local.length)
              local.push({
                id: "created-customer",
                tenantId: "tenant",
                name: "New customer",
              })
            return { count: options.existingCustomer ? 0 : 1 }
          },
          create: async () => {
            events.push({ name: "customer-provision" })
            attempts++
            const row = {
              id: "created-customer",
              tenantId: "tenant",
              name: "New customer",
            }
            local.push(row)
            return row
          },
          findFirst: async () => {
            events.push({ name: "customer-read" })
            return local[0] ?? null
          },
        },
        sellableOffering: {
          findFirst: async () => {
            events.push({ name: "catalog-seam" })
            throw stop
          },
        },
      } as unknown as Prisma.TransactionClient
      try {
        const result = await run(tx)
        customers = local
        return result
      } catch (error) {
        rollbacks++
        throw error
      }
    },
  } as unknown as PrismaClient
  return {
    db,
    events,
    customers: () => customers,
    rollbacks: () => rollbacks,
    attempts: () => attempts,
    orderWrites: () => orderWrites,
  }
}
function before(f: ReturnType<typeof fixture>, earlier: string, later: string) {
  const names = f.events.map((event) => event.name)
  expect(names).toContain(earlier)
  expect(names).toContain(later)
  expect(names.indexOf(earlier)).toBeLessThan(names.indexOf(later))
}
function noLateFinancialLock(f: ReturnType<typeof fixture>) {
  const names = f.events.map((event) => event.name)
  expect(names).toContain("customer-provision")
  const afterProvision = names.slice(names.indexOf("customer-provision") + 1)
  expect(afterProvision).not.toContain("Book")
  expect(afterProvision).not.toContain("Account")
}

for (const book of [true, false]) {
  test(`${book ? "existing" : "absent"} Book coordination precedes identity-based customer provisioning`, async () => {
    const f = fixture({ book })
    const input = request()
    const original = structuredClone(input)
    await expect(createCommercialOrder(f.db, input)).rejects.toBe(stop)
    before(f, "Book", "customer-provision")
    if (book) {
      before(f, "customer-provision", "Account")
      expect(
        f.events.find((event) => event.name === "Account")?.values,
      ).toEqual(["tenant", "created-customer", "NGN"])
    }
    if (!book) {
      before(f, "Tenant", "Book-presence")
      before(f, "Book-presence", "customer-provision")
      noLateFinancialLock(f)
    }
    expect(f.attempts()).toBe(1)
    expect(f.customers()).toEqual([])
    expect(f.rollbacks()).toBe(1)
    expect(f.orderWrites()).toBe(0)
    expect(input).toEqual(original)
  })

  test(`${book ? "existing" : "absent"} Book coordination precedes name-only customer provisioning`, async () => {
    const f = fixture({ book })
    const input = request()
    input.customerEmail = undefined
    input.customerPhone = undefined
    await expect(createCommercialOrder(f.db, input)).rejects.toBe(stop)
    before(f, "Book", "customer-provision")
    if (!book) noLateFinancialLock(f)
    expect(f.attempts()).toBe(1)
    expect(f.customers()).toEqual([])
    expect(f.orderWrites()).toBe(0)
  })

  test(`${book ? "existing" : "absent"} Book locks precede even a duplicate-safe customer insertion attempt`, async () => {
    const f = fixture({ book, existingCustomer: true })
    const original = structuredClone(f.customers())
    await expect(createCommercialOrder(f.db, request())).rejects.toBe(stop)
    before(f, "Book", "customer-provision")
    if (!book) noLateFinancialLock(f)
    expect(f.customers()).toEqual(original)
    if (book) {
      before(f, "customer-provision", "Account")
      expect(
        f.events.find((event) => event.name === "Account")?.values,
      ).toEqual(["tenant", "existing-customer", "NGN"])
    }
    expect(f.orderWrites()).toBe(0)
  })

  test(`actual later blank-line validation rolls customer creation back with ${book ? "existing" : "absent"} Book`, async () => {
    const f = fixture({ book })
    const input = request()
    input.lines = [{ custom: "quick_sale", amountMinor: 500 }]
    await expect(createCommercialOrder(f.db, input)).rejects.toMatchObject({
      code: "INVALID_ORDER",
    })
    expect(f.attempts()).toBe(1)
    if (!book) noLateFinancialLock(f)
    expect(f.customers()).toEqual([])
    expect(f.rollbacks()).toBe(1)
    expect(f.orderWrites()).toBe(0)
    expect(f.events.map((event) => event.name)).not.toContain("catalog-seam")
  })
}

test("Book appearing after absence planning refuses before customer provisioning", async () => {
  const f = fixture({ book: false, appeared: true })
  let caught: unknown
  try {
    await createCommercialOrder(f.db, request())
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(CatalogError)
  expect(caught).not.toBe(stop)
  expect(f.attempts()).toBe(0)
  expect(f.customers()).toEqual([])
  expect(f.orderWrites()).toBe(0)
  expect(f.rollbacks()).toBe(1)
  before(f, "Book", "Tenant")
  before(f, "Tenant", "Book-presence")
})

for (const invalid of ["missing-name", "both-identity-and-create"] as const)
  test(`invalid customer intent ${invalid} retains canonical refusal and zero provisioning`, async () => {
    const f = fixture({ book: true })
    const input = request()
    if (invalid === "missing-name") input.customerName = "   "
    else input.customerId = "existing-customer"
    await expect(createCommercialOrder(f.db, input)).rejects.toMatchObject({
      code: "INVALID_ORDER",
    })
    expect(f.attempts()).toBe(0)
    expect(f.customers()).toEqual([])
    expect(f.orderWrites()).toBe(0)
    expect(f.rollbacks()).toBe(1)
    expect(f.events.map((event) => event.name)).not.toContain("Book")
  })

test("explicit Customer retains Book/account coordination without provisioning a directory record", async () => {
  const f = fixture({ book: true, existingCustomer: true })
  const input = request()
  input.customerMode = undefined
  input.customerId = "existing-customer"
  await expect(createCommercialOrder(f.db, input)).rejects.toBe(stop)
  before(f, "Book", "Account")
  expect(f.events.find((event) => event.name === "Account")?.values).toEqual([
    "tenant",
    "existing-customer",
    "NGN",
  ])
  expect(f.attempts()).toBe(0)
  expect(f.customers()).toHaveLength(1)
  expect(f.orderWrites()).toBe(0)
})

for (const selectedCustomer of [false, true]) {
  const customer = selectedCustomer ? "selected Customer" : "walk-in"
  for (const appeared of [false, true]) {
    test(`${customer} ${appeared ? "refuses an appearing Book" : "pins absent Book before catalog resolution"} without creating a Customer`, async () => {
      const f = fixture({
        book: false,
        appeared,
        existingCustomer: selectedCustomer,
      })
      const input = request()
      input.customerMode = undefined
      input.customerId = selectedCustomer ? "existing-customer" : undefined
      input.customerName = undefined
      input.customerEmail = undefined
      input.customerPhone = undefined
      const original = structuredClone(input)
      if (appeared) {
        await expect(createCommercialOrder(f.db, input)).rejects.toMatchObject({
          code: "REVISION_CONFLICT",
        })
        expect(f.events.map((event) => event.name)).not.toContain(
          "catalog-seam",
        )
      } else {
        await expect(createCommercialOrder(f.db, input)).rejects.toBe(stop)
        before(f, "Book-presence", "catalog-seam")
      }
      before(f, "Book", "Tenant")
      before(f, "Tenant", "Book-presence")
      expect(f.attempts()).toBe(0)
      expect(f.customers()).toEqual(
        selectedCustomer
          ? [
              {
                id: "existing-customer",
                name: "New customer",
                tenantId: "tenant",
              },
            ]
          : [],
      )
      expect(f.orderWrites()).toBe(0)
      expect(f.rollbacks()).toBe(1)
      expect(input).toEqual(original)
    })
  }
}
