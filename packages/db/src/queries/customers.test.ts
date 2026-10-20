import { describe, expect, test } from "bun:test"

import {
  ensureOrderCustomerInTransaction,
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
