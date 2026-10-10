import { expect, test } from "bun:test"
import { listCommercialOrdersPage } from "@ewatrade/db/queries"
import type { PrismaClient } from "@ewatrade/db/types"
import { commercialOrderListPageSchema } from "../schemas/orders"

test("assistant date window reaches the canonical order list with both boundaries and scope", async () => {
  const input = commercialOrderListPageSchema.parse({
    createdAfter: "2026-10-01T00:00:00Z",
    createdBefore: "2026-10-10T00:00:00Z",
    storeId: "store",
    limit: 10,
  })
  const calls: unknown[] = []
  const counts: unknown[] = []
  const db = {
    commercialOrder: {
      findMany: async (args: unknown) => {
        calls.push(args)
        return []
      },
      count: async (args: unknown) => {
        counts.push(args)
        return 0
      },
    },
  } as unknown as PrismaClient
  const result = await listCommercialOrdersPage(db, {
    ...input,
    tenantId: "tenant",
    createdByUserId: "rep",
  })
  expect(result.items).toEqual([])
  expect(calls).toHaveLength(1)
  expect(counts).toEqual([
    {
      where: {
        tenantId: "tenant",
        storeId: "store",
        createdByUserId: "rep",
        status: undefined,
        createdAt: { gte: input.createdAfter, lt: input.createdBefore },
      },
    },
  ])
  expect(calls[0]).toMatchObject({
    where: {
      tenantId: "tenant",
      storeId: "store",
      createdByUserId: "rep",
      createdAt: {
        gte: new Date("2026-10-01T00:00:00Z"),
        lt: new Date("2026-10-10T00:00:00Z"),
      },
    },
    take: 11,
  })
})
test("order list rejects empty or reversed date windows", () => {
  for (const createdBefore of [
    "2026-10-01T00:00:00Z",
    "2026-09-30T00:00:00Z",
  ]) {
    expect(
      commercialOrderListPageSchema.safeParse({
        createdAfter: "2026-10-01T00:00:00Z",
        createdBefore,
      }).success,
    ).toBe(false)
  }
})
