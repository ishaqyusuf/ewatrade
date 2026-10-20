import { describe, expect, test } from "bun:test"

import {
  ensureOrderCustomerInTransaction,
  listCustomerBook,
  listCustomerOrderDirectory,
} from "./customers"
import type { DbClient } from "./types"

function createMockDb(existing: unknown = null) {
  const calls: Array<{ data?: unknown; kind: string; where?: unknown }> = []
  const timestamp = new Date("2026-07-24T10:00:00.000Z")
  const created = {
    createdAt: timestamp,
    email: "ADA@EXAMPLE.COM",
    id: "customer_123",
    name: "Ada Okafor",
    phone: "0800 000 0000",
    updatedAt: timestamp,
  }
  const db = {
    customer: {
      create: async ({ data }: { data: unknown }) => {
        calls.push({ data, kind: "customer.create" })
        return created
      },
      createMany: async ({ data }: { data: unknown }) => {
        calls.push({ data, kind: "customer.createMany" })
        return { count: existing ? 0 : 1 }
      },
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "customer.findFirst", where })
        return existing ?? created
      },
    },
  }

  return { calls, client: db as unknown as DbClient }
}

describe("Order customer directory projection", () => {
  test("loads an unbounded, store-scoped aggregate and maps its last order", async () => {
    const queryCalls: unknown[] = []
    const timestamp = new Date("2026-07-24T10:00:00.000Z")
    const db = {
      $queryRaw: async (query: unknown) => {
        queryCalls.push(query)
        return [
          {
            customerId: "customer_123",
            email: "ada@example.com",
            firstSeenAt: new Date("2026-01-01T10:00:00.000Z"),
            id: "08000000000",
            identityType: "phone",
            lastOrderCreatedAt: timestamp,
            lastOrderNumber: "ORD-2",
            lastOrderPaymentStatus: "PAID",
            lastOrderStatus: "COMPLETED",
            lastOrderTotalMinor: 2500,
            lastSeenAt: timestamp,
            name: "Ada Okafor",
            orderCount: 2,
            phone: "0800 000 0000",
            totalMinor: "9007199254740993",
          },
        ]
      },
    }

    const result = await listCustomerOrderDirectory(
      db as unknown as Parameters<typeof listCustomerOrderDirectory>[0],
      {
        query: "ada",
        storeId: "store_123",
        tenantId: "tenant_123",
      },
    )

    expect(queryCalls).toHaveLength(1)
    const queryValues = (queryCalls[0] as { values: unknown[] }).values
    expect(queryValues).toContain("tenant_123")
    expect(queryValues).toContain("store_123")
    expect(queryValues).toContain("%ada%")
    const querySql = (queryCalls[0] as { sql: string }).sql
    expect(querySql).toContain('SUM("totalMinor")::text')
    expect(querySql).not.toContain('SUM("totalMinor")::integer')
    expect(result).toEqual([
      {
        customerId: "customer_123",
        email: "ada@example.com",
        firstSeenAt: new Date("2026-01-01T10:00:00.000Z"),
        id: "08000000000",
        identityType: "phone",
        lastOrder: {
          createdAt: timestamp,
          orderNumber: "ORD-2",
          paymentStatus: "PAID",
          status: "COMPLETED",
          totalMinor: 2500,
        },
        lastSeenAt: timestamp,
        name: "Ada Okafor",
        orderCount: 2,
        phone: "0800 000 0000",
        totalMinor: "9007199254740993",
      },
    ])
  })

  test("creates a normalized tenant customer from Order facts", async () => {
    const db = createMockDb()

    await ensureOrderCustomerInTransaction(db.client, {
      email: " ADA@EXAMPLE.COM ",
      name: " Ada Okafor ",
      phone: "0800 000 0000",
      tenantId: "tenant_123",
    })

    expect(db.calls[0]).toEqual({
      data: {
        email: "ADA@EXAMPLE.COM",
        name: "Ada Okafor",
        normalizedEmail: "ada@example.com",
        normalizedPhone: "08000000000",
        phone: "0800 000 0000",
        tenantId: "tenant_123",
      },
      kind: "customer.createMany",
    })
    expect(db.calls[1]?.kind).toBe("customer.findFirst")
  })

  test("reuses an existing contact instead of creating a duplicate", async () => {
    const timestamp = new Date("2026-07-24T10:00:00.000Z")
    const existing = {
      createdAt: timestamp,
      email: null,
      id: "customer_existing",
      name: "Ada Okafor",
      phone: "08000000000",
      updatedAt: timestamp,
    }
    const db = createMockDb(existing)

    await expect(
      ensureOrderCustomerInTransaction(db.client, {
        name: "Ada Okafor",
        phone: "08000000000",
        tenantId: "tenant_123",
      }),
    ).resolves.toBe(existing)
    expect(db.calls.map((call) => call.kind)).toEqual([
      "customer.createMany",
      "customer.findFirst",
    ])
  })
})

describe("Customer book", () => {
  const ordered = (row: Record<string, unknown>) => ({
    customerId: null,
    email: null,
    firstSeenAt: new Date("2026-01-01T10:00:00.000Z"),
    identityType: "phone",
    lastOrderCreatedAt: new Date("2026-07-24T10:00:00.000Z"),
    lastOrderNumber: "ORD-2",
    lastOrderPaymentStatus: "PAID",
    lastOrderStatus: "COMPLETED",
    lastOrderTotalMinor: 2500,
    lastSeenAt: new Date("2026-07-24T10:00:00.000Z"),
    name: "Ada Okafor",
    orderCount: 2,
    phone: null,
    totalMinor: "5000",
    ...row,
  })
  const savedCustomer = (row: Record<string, unknown>) => ({
    createdAt: new Date("2026-07-01T10:00:00.000Z"),
    email: null,
    name: "Saved",
    phone: null,
    updatedAt: new Date("2026-07-01T10:00:00.000Z"),
    ...row,
  })
  function bookDb(orders: unknown[], saved: unknown[]) {
    const findManyCalls: unknown[] = []
    const db = {
      $queryRaw: async () => orders,
      customer: {
        findMany: async (args: unknown) => {
          findManyCalls.push(args)
          return saved
        },
      },
    }
    return {
      db: db as unknown as Parameters<typeof listCustomerBook>[0],
      findManyCalls,
    }
  }
  const input = { storeId: "store_1", tenantId: "tenant_1" }

  test("links order customers by phone and adds saved customers without orders", async () => {
    const { db } = bookDb(
      [ordered({ id: "+2348031234567", phone: "+234 803 123 4567" })],
      [
        savedCustomer({ id: "c_ada", name: "Ada", phone: "+2348031234567" }),
        savedCustomer({ id: "c_new", name: "New Customer", email: "n@x.io" }),
      ],
    )
    const rows = await listCustomerBook(db, {
      ...input,
      includeSavedCustomers: true,
    })
    expect(rows.map((row) => [row.id, row.customerId, row.orderCount])).toEqual(
      [
        ["+2348031234567", "c_ada", 2],
        ["customer:c_new", "c_new", 0],
      ],
    )
    expect(rows[1]?.lastOrder).toBeNull()
    expect(rows[1]?.identityType).toBe("email")
  })

  test("keeps the order link and skips saved customers for own-sales books", async () => {
    const { db, findManyCalls } = bookDb(
      [ordered({ id: "ada", customerId: "c_linked" })],
      [savedCustomer({ id: "c_other" })],
    )
    const rows = await listCustomerBook(db, {
      ...input,
      createdByUserId: "user_1",
      includeSavedCustomers: false,
    })
    expect(rows.map((row) => row.customerId)).toEqual(["c_linked"])
    expect(findManyCalls).toHaveLength(0)
  })
})
