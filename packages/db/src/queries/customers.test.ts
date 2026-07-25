import { describe, expect, test } from "bun:test"

import { ensureOrderCustomerInTransaction } from "./customers"
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
