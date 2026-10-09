import { expect, test } from "bun:test"
import type { PrismaClient } from "../../../generated/prisma/client"
import { listFinancePurchaseRecognitions as list } from "./purchase-recognition-list"

const input = {
  actorUserId: "owner",
  tenantId: "tenant",
  bookId: "book",
  supplierId: "supplier",
}
function fixture(
  options: {
    denied?: boolean
    missingBook?: boolean
    missingSupplier?: boolean
    corrupt?: boolean
  } = {},
) {
  const at = new Date("2026-10-01T00:00:00Z")
  const rows = Array.from({ length: 73 }, (_, n) => ({
    id: `source-${String(n).padStart(3, "0")}`,
    tenantId: "tenant",
    bookId: "book",
    supplierId: "supplier",
    storeId: "store",
    agreedAt: new Date(at),
    costBillId: `cost-${n}`,
    costBill: {
      id: `cost-${n}`,
      bookId: "book",
      supplierId: "supplier",
      kind: "PURCHASE_ACCRUAL",
      description: `Agreement ${n}`,
      totalMinor: 100n + BigInt(n),
    },
  })).reverse()
  const calls: unknown[] = []
  type Filter = {
    tenantId: string
    bookId: string
    supplierId: string
    OR?: [{ agreedAt: { lt: Date } }, { agreedAt: Date; id: { lt: string } }]
  }
  const db = {
    $transaction: async (
      action: (tx: unknown) => Promise<unknown>,
      config: unknown,
    ) => {
      calls.push(config)
      return action(tx)
    },
  }
  const tx = {
    $queryRaw: async () => [],
    membership: {
      findFirst: async (args: unknown) => {
        calls.push(args)
        return options.denied ? null : { tenant: { isActive: true } }
      },
    },
    financeBook: {
      findFirst: async () =>
        options.missingBook ? null : { id: "book", currencyCode: "NGN" },
    },
    financeSupplierAccount: {
      findFirst: async () =>
        options.missingSupplier ? null : { id: "supplier" },
    },
    financePurchaseRecognition: {
      findFirst: async (args: { where: Filter & { id: string } }) =>
        rows.find(
          (r) =>
            r.id === args.where.id &&
            r.tenantId === args.where.tenantId &&
            r.bookId === args.where.bookId &&
            r.supplierId === args.where.supplierId,
        ) ?? null,
      findMany: async (args: {
        where: Filter
        take: number
        orderBy: unknown
      }) => {
        calls.push(args)
        const filtered = rows.filter(
          (r) =>
            r.tenantId === args.where.tenantId &&
            r.bookId === args.where.bookId &&
            r.supplierId === args.where.supplierId &&
            (!args.where.OR ||
              r.agreedAt < args.where.OR[0].agreedAt.lt ||
              (r.agreedAt.getTime() === args.where.OR[1].agreedAt.getTime() &&
                r.id < args.where.OR[1].id.lt)),
        )
        const result = filtered.slice(0, args.take)
        if (options.corrupt && result[0])
          result[0] = {
            ...result[0],
            costBill: { ...result[0].costBill, bookId: "other" },
          }
        return result
      },
    },
  }
  return { db: db as unknown as PrismaClient, rows, calls }
}

test("all 73 pre-invoice agreements remain reachable with stable tied-date paging", async () => {
  const f = fixture()
  let cursor: string | undefined
  const ids: string[] = []
  do {
    const page = await list(f.db, {
      ...input,
      limit: 20,
      ...(cursor ? { cursor } : {}),
    })
    expect(page.bookId).toBe("book")
    expect(page.supplierId).toBe("supplier")
    expect(page.currencyCode).toBe("NGN")
    expect(page.items.length).toBeLessThanOrEqual(20)
    expect(page.items[0]?.amountMinor).toMatch(/^\d+$/)
    ids.push(...page.items.map((r) => r.id))
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  expect(ids).toEqual(f.rows.map((r) => r.id))
  expect(new Set(ids).size).toBe(73)
  expect(f.calls[0]).toEqual({
    maxWait: 10_000,
    timeout: 30_000,
    isolationLevel: "RepeatableRead",
  })
})

test("current manager, exact Book, supplier and cursor ownership are required", async () => {
  for (const options of [
    { denied: true },
    { missingBook: true },
    { missingSupplier: true },
    { corrupt: true },
  ])
    await expect(list(fixture(options).db, input)).rejects.toThrow()
  const f = fixture()
  await expect(
    list(f.db, { ...input, cursor: "other-supplier-source" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  await expect(
    list(f.db, { ...input, supplierId: "other", cursor: "source-070" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  for (const limit of [0, 51, 1.5])
    await expect(list(f.db, { ...input, limit })).rejects.toThrow("page size")
})

test("agreement listing does not disclose immutable cost bill or command internals", async () => {
  const result = await list(fixture().db, { ...input, limit: 1 })
  const [item] = result.items
  if (!item) throw new Error("Expected one agreement")
  expect(Object.keys(item).sort()).toEqual(
    [
      "id",
      "bookId",
      "supplierId",
      "storeId",
      "agreedAt",
      "description",
      "amountMinor",
    ].sort(),
  )
  expect(result.nextCursor).toBe(item.id)
})
