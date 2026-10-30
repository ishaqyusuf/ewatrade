import { expect, test } from "bun:test"
import type { PrismaClient } from "../../../generated/prisma/client"
import { listFinanceBills } from "./bill-reads"

function reader() {
  const where: unknown[] = []
  const effects: string[] = []
  const tx = {
    $queryRaw: async (_query: TemplateStringsArray, ...values: unknown[]) => {
      effects.push("lock")
      expect(values).toEqual(["tenant-a", "actor-a"])
      return []
    },
    membership: {
      findFirst: async () => {
        effects.push("admission")
        return {
          tenant: {
            id: "tenant-a",
            currencyCode: "NGN",
            isActive: true,
            timezone: "UTC",
          },
        }
      },
    },
    financeBook: {
      findFirst: async (args: unknown) => {
        where.push(args)
        effects.push("book")
        return { id: "book-a", currencyCode: "NGN" }
      },
    },
    financeBill: {
      findMany: async () => {
        effects.push("rows")
        return []
      },
      aggregate: async () => ({
        _sum: { totalMinor: 9007199254740993n, paidMinor: 3n },
      }),
      count: async () => 7,
    },
  }
  const db = {
    $transaction: async (work: (tx: unknown) => unknown, options: unknown) => {
      expect(options).toEqual({
        maxWait: 10000,
        timeout: 30000,
        isolationLevel: "RepeatableRead",
      })
      return work(tx)
    },
  } as unknown as PrismaClient
  return { db, where, effects }
}
const actor = { tenantId: "tenant-a", actorUserId: "actor-a" }
test("current spending keeps the canonical exact summary/rows and identifies its selected Book", async () => {
  const a = reader()
  const b = reader()
  const legacy = await listFinanceBills(a.db, {
    ...actor,
    bookId: "book-a",
    limit: 5,
  })
  const current = await listFinanceBills(b.db, {
    ...actor,
    currentCurrency: "NGN",
    limit: 5,
  })
  expect(Object.hasOwn(legacy, "resolvedBookId")).toBe(false)
  expect(current).toEqual({ ...legacy, resolvedBookId: "book-a" })
  expect(current.summary).toEqual({
    incurredMinor: "9007199254740993",
    paidAgainstBillsMinor: "3",
    outstandingMinor: "9007199254740990",
  })
  expect(a.where).toEqual([{ where: { id: "book-a", tenantId: "tenant-a" } }])
  expect(b.where).toEqual([
    { where: { tenantId: "tenant-a", currencyCode: "NGN" } },
  ])
  expect(b.effects).toEqual(a.effects)
})
test("stale spending currency cannot select another Book or execute the expense query", async () => {
  const f = reader()
  await expect(
    listFinanceBills(f.db, { ...actor, currentCurrency: "USD", limit: 5 }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  expect(f.where).toEqual([])
  expect(f.effects).toEqual(["lock", "admission"])
})
