import { expect, test } from "bun:test"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { listFinanceCashCounts } from "./cash-counts"

test("cash history pages backward to nearest newer originals with stable ties and scoped cursor", async () => {
  const originals = [
    ["a", 1],
    ["b", 2],
    ["c", 2],
    ["d", 3],
    ["e", 3],
    ["f", 4],
    ["g", 5],
    ["h", 5],
  ].map(([id, day]) => ({
    id: String(id),
    bookId: "book",
    accountId: "cash",
    account: { name: "Till", purpose: "CASH" },
    asOf: new Date(`2026-01-0${day}T00:00:00.000Z`),
    createdAt: new Date("2026-01-06Z"),
    reference: String(id),
    actorUserId: "owner",
    snapshotSequence: 8n,
    expectedBalanceMinor: 10n,
    observedBalanceMinor: 9n,
  }))
  const sample = originals[0]
  if (!sample) throw Error("Original pagination rows required")
  const rows = [
    ...originals,
    { ...sample, id: "foreign-account", accountId: "other" },
    { ...sample, id: "foreign-book", bookId: "other" },
    {
      ...sample,
      id: "bank",
      account: { name: "Bank", purpose: "BANK" },
    },
  ]
  // A small read-only Prisma predicate adapter exercises the real reader, not a
  // second paging implementation. Dates/IDs use ordinary scalar comparisons.
  function matches(
    row: Record<string, unknown>,
    where: Record<string, unknown>,
  ): boolean {
    return Object.entries(where).every(([key, value]) => {
      if (value === undefined) return true
      if (key === "AND" || key === "OR") {
        const terms = value as Record<string, unknown>[]
        return key === "AND"
          ? terms.every((term) => matches(row, term))
          : terms.some((term) => matches(row, term))
      }
      const actual = row[key]
      if (value instanceof Date)
        return actual instanceof Date && actual.getTime() === value.getTime()
      if (value && typeof value === "object") {
        const rule = value as Record<string, unknown>
        if ("lt" in rule || "gt" in rule) {
          const a = actual instanceof Date ? actual.getTime() : String(actual)
          const target = rule.lt ?? rule.gt
          const b = target instanceof Date ? target.getTime() : String(target)
          return "lt" in rule ? a < b : a > b
        }
        return matches(actual as Record<string, unknown>, rule)
      }
      return actual === value
    })
  }
  const queries: Array<{ orderBy: unknown; take: number }> = []
  const tx = {
    $queryRaw: async () => [],
    membership: { findFirst: async () => ({ tenant: { isActive: true } }) },
    financeBook: {
      findFirst: async ({
        where,
      }: { where: { tenantId: string; id: string } }) =>
        where.tenantId === "tenant" && where.id === "book"
          ? { id: "book", currencyCode: "NGN" }
          : null,
    },
    financeReconciliation: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        rows.find((row) => matches(row, where)) ?? null,
      findMany: async (query: {
        where: Record<string, unknown>
        orderBy: Array<Record<string, "asc" | "desc">>
        take: number
      }) => {
        queries.push(query)
        return rows
          .filter((row) => matches(row, query.where))
          .sort((a, b) => {
            for (const order of query.orderBy)
              for (const [key, direction] of Object.entries(order)) {
                if (key !== "asOf" && key !== "id")
                  throw Error("Unexpected order field")
                const x = key === "asOf" ? a.asOf.getTime() : a.id
                const y = key === "asOf" ? b.asOf.getTime() : b.id
                const comparison = x < y ? -1 : x > y ? 1 : 0
                if (comparison)
                  return direction === "asc" ? comparison : -comparison
              }
            return 0
          })
          .slice(0, query.take)
      },
    },
  }
  const db = {
    $transaction: async (
      operation: (reader: Prisma.TransactionClient) => unknown,
      options: unknown,
    ) => {
      expect(options).toEqual({
        maxWait: 10000,
        timeout: 30000,
        isolationLevel: "RepeatableRead",
      })
      return operation(tx as unknown as Prisma.TransactionClient)
    },
  } as unknown as PrismaClient
  const scope = {
    tenantId: "tenant",
    actorUserId: "owner",
    bookId: "book",
    accountId: "cash",
    limit: 2,
  }
  const backward = { ...scope, cursor: "c", direction: "backward" as const }
  const page = await listFinanceCashCounts(db, backward)
  expect(page.items.map((row) => row.id)).toEqual(["e", "d"])
  expect(page.nextCursor).toBe("e")
  if (!page.nextCursor) throw Error("Backward continuation cursor required")
  const next = await listFinanceCashCounts(db, {
    ...backward,
    cursor: page.nextCursor,
  })
  expect(next.items.map((row) => row.id)).toEqual(["g", "f"])
  expect(next.nextCursor).toBe("g")
  if (!next.nextCursor)
    throw Error("Second backward continuation cursor required")
  const end = await listFinanceCashCounts(db, {
    ...backward,
    cursor: next.nextCursor,
  })
  expect(end.items.map((row) => row.id)).toEqual(["h"])
  expect(end.nextCursor).toBeNull()
  const oldest = await listFinanceCashCounts(db, {
    ...backward,
    cursor: undefined,
  })
  expect(oldest.items.map((row) => row.id)).toEqual(["b", "a"])
  expect(oldest.nextCursor).toBe("b")
  const forward = await listFinanceCashCounts(db, { ...scope, cursor: "e" })
  expect(forward.items.map((row) => row.id)).toEqual(["d", "c"])
  expect(forward.nextCursor).toBe("c")
  expect(queries[0]).toMatchObject({
    orderBy: [{ asOf: "asc" }, { id: "asc" }],
    take: 3,
  })
  const reads = queries.length
  for (const cursor of ["foreign-account", "foreign-book", "bank"])
    await expect(
      listFinanceCashCounts(db, { ...backward, cursor }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  expect(queries).toHaveLength(reads)
})
