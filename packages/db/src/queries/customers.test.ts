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
  function bookDb(
    orders: unknown[],
    saved: unknown[],
    gates: { orders?: Promise<void>; saved?: Promise<void> } = {},
  ) {
    const findManyCalls: unknown[] = []
    const db = {
      $queryRaw: async () => {
        await gates.orders
        return orders
      },
      customer: {
        findMany: async (args: unknown) => {
          findManyCalls.push(args)
          await gates.saved
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

  test("starts saved-customer reading while order projection is pending and waits for both", async () => {
    const orders = Promise.withResolvers<void>()
    const saved = Promise.withResolvers<void>()
    const { db, findManyCalls } = bookDb(
      [ordered({ id: "ada", email: "ADA@EXAMPLE.COM" })],
      [savedCustomer({ id: "c_ada", email: "ada@example.com" })],
      { orders: orders.promise, saved: saved.promise },
    )
    const read = listCustomerBook(db, {
      ...input,
      includeSavedCustomers: true,
    })
    let settled = false
    void read.then(() => {
      settled = true
    })
    try {
      expect(findManyCalls).toHaveLength(1)
      saved.resolve()
      await Promise.resolve()
      expect(settled).toBe(false)
    } finally {
      orders.resolve()
      saved.resolve()
    }
    const rows = await read
    expect(rows.map((row) => [row.id, row.customerId])).toEqual([
      ["ada", "c_ada"],
    ])
    expect(rows[0]?.totalMinor).toBe("5000")
  })

  for (const failedRead of ["orders", "saved"] as const) {
    test(`propagates a ${failedRead} failure without waiting for the other read`, async () => {
      const orders = Promise.withResolvers<void>()
      const saved = Promise.withResolvers<void>()
      const { db } = bookDb([], [], {
        orders: orders.promise,
        saved: saved.promise,
      })
      const read = listCustomerBook(db, {
        ...input,
        includeSavedCustomers: true,
      })
      const failure = new Error(`inert ${failedRead} failure`)
      const failedGate = failedRead === "orders" ? orders : saved
      try {
        failedGate.reject(failure)
        await expect(read).rejects.toBe(failure)
      } finally {
        orders.resolve()
        saved.resolve()
      }
    })
  }

  test("retains exact saved scope, literal search and deterministic contact precedence", async () => {
    const { db, findManyCalls } = bookDb(
      [
        ordered({
          id: "linked",
          customerId: "c_linked",
          phone: "0900",
          email: "older@example.com",
        }),
        ordered({
          id: "unlinked",
          phone: "0800 0000",
          email: "older@example.com",
        }),
      ],
      [
        savedCustomer({ id: "c_newer", phone: "08000000" }),
        savedCustomer({
          id: "c_older",
          phone: "08000000",
          email: "older@example.com",
        }),
        savedCustomer({ id: "c_linked", phone: "0900" }),
      ],
    )
    const rows = await listCustomerBook(db, {
      ...input,
      query: "  a%b_  ",
      includeSavedCustomers: true,
    })
    expect(findManyCalls).toEqual([
      {
        where: {
          tenantId: "tenant_1",
          OR: ["name", "email", "phone"].map((field) => ({
            [field]: { contains: "a\\%b\\_", mode: "insensitive" },
          })),
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        select: {
          createdAt: true,
          email: true,
          id: true,
          name: true,
          phone: true,
          updatedAt: true,
        },
      },
    ])
    expect(rows.map((row) => [row.id, row.customerId])).toEqual([
      ["linked", "c_linked"],
      ["unlinked", "c_newer"],
      ["customer:c_older", "c_older"],
    ])
    expect(rows.map((row) => row.totalMinor)).toEqual(["5000", "5000", "0"])
    expect(rows[2]?.lastOrder).toBeNull()
  })

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
