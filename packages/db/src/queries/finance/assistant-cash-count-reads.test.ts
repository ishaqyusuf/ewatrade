import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { listAssistantCashAccountsInTransaction } from "./assistant-cash-count-reads"
const input = {
  tenantId: "tenant",
  actorUserId: "owner",
  storeId: "store",
  bookId: "book",
  search: "Front till",
  afterCode: "1000",
}
test("cash lookup fences explicit Book/Store scope, names and bounded continuation", async () => {
  const calls: Record<string, unknown> = {}
  const tx = {
    $queryRaw: async () => [],
    membership: { findFirst: async () => ({ tenant: { isActive: true } }) },
    store: {
      findFirst: async (query: unknown) => {
        calls.store = query
        return { id: "store" }
      },
    },
    financeBook: {
      findFirst: async (query: unknown) => {
        calls.book = query
        return { id: "book", currencyCode: "NGN" }
      },
    },
    financeAccount: {
      findMany: async (query: unknown) => {
        calls.accounts = query
        return Array.from({ length: 21 }, (_, i) => ({
          id: `cash-${i}`,
          name: `Till ${i}`,
          code: `${1100 + i}`,
        }))
      },
    },
  } as unknown as Prisma.TransactionClient
  const page = await listAssistantCashAccountsInTransaction(tx, input)
  expect(calls.store).toMatchObject({
    where: { id: "store", tenantId: "tenant", status: "ACTIVE" },
  })
  expect(calls.book).toMatchObject({
    where: { id: "book", tenantId: "tenant" },
  })
  expect(calls.accounts).toMatchObject({
    where: {
      bookId: "book",
      purpose: "CASH",
      kind: "ASSET",
      archivedAt: null,
      code: { gt: "1000" },
      OR: [
        { name: { contains: "Front till", mode: "insensitive" } },
        { code: { contains: "Front till", mode: "insensitive" } },
      ],
    },
    take: 21,
  })
  expect(page.accounts).toHaveLength(20)
  expect(page.nextCursor).toBe("1119")
  expect(page.scope).toBe("TENANT_BOOK_CASH_IDENTITIES")
})
test("foreign Store cannot expose cash lookup or Book identity", async () => {
  let bookReads = 0
  const tx = {
    $queryRaw: async () => [],
    membership: { findFirst: async () => ({ tenant: { isActive: true } }) },
    store: { findFirst: async () => null },
    financeBook: {
      findFirst: async () => {
        bookReads++
        return null
      },
    },
  } as unknown as Prisma.TransactionClient
  await expect(
    listAssistantCashAccountsInTransaction(tx, input),
  ).rejects.toThrow("Store not found")
  expect(bookReads).toBe(0)
})
