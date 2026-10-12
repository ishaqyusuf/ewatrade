import { expect, test } from "bun:test"
import type { PrismaClient } from "../../../generated/prisma/client"
import { listFinanceMoneyAccounts } from "./money-account-reads"

function fixture(options: { denied?: boolean; missingBook?: boolean } = {}) {
  const calls: unknown[] = []
  const tx = {
    $queryRaw: async () => [],
    membership: {
      findFirst: async () =>
        options.denied ? null : { tenant: { isActive: true } },
    },
    financeBook: {
      findFirst: async (args: unknown) => {
        expect(args).toMatchObject({
          where: { id: "book", tenantId: "tenant" },
        })
        return options.missingBook
          ? null
          : {
              id: "book",
              currencyCode: "USD",
              startsAt: new Date(),
              closedThrough: null,
            }
      },
    },
    financeAccount: {
      findMany: async (args: unknown) => {
        calls.push(args)
        return [
          {
            id: "bank",
            code: "1001",
            name: "Bank",
            purpose: "BANK",
            paymentMethods: ["POS"],
            paymentsPausedAt: new Date(),
          },
          {
            id: "cash",
            code: "1002",
            name: "Cash",
            purpose: "CASH",
            paymentMethods: [],
            paymentsPausedAt: null,
          },
        ]
      },
    },
  }
  const db = {
    $transaction: async (work: (tx: unknown) => unknown, options: unknown) => {
      expect(options).toEqual({
        isolationLevel: "RepeatableRead",
        maxWait: 10_000,
        timeout: 30_000,
      })
      return work(tx)
    },
  } as unknown as PrismaClient
  return { db, calls }
}
const input = { tenantId: "tenant", actorUserId: "owner", bookId: "book" }

test("money identity lookup scopes the Book and excludes archived/non-money accounts", async () => {
  const { db, calls } = fixture()
  const page = await listFinanceMoneyAccounts(db, {
    ...input,
    afterCode: "1000",
    limit: 1,
  })
  expect(calls[0]).toMatchObject({
    where: {
      bookId: "book",
      archivedAt: null,
      kind: "ASSET",
      purpose: { in: ["CASH", "BANK", "CLEARING"] },
      code: { gt: "1000" },
    },
    orderBy: { code: "asc" },
    take: 2,
  })
  expect(page.accounts).toEqual([
    {
      id: "bank",
      code: "1001",
      name: "Bank",
      purpose: "BANK",
      paymentMethods: ["pos"],
      availableForPayments: false,
    },
  ])
  expect(page.nextCursor).toBe("1001")
  expect(page.book.currencyCode).toBe("USD")
  expect(page.coverage).toBe("ACTIVE_MONEY_ACCOUNT_IDENTITIES")
  expect(page).not.toHaveProperty("balanceMinor")
})

test("money lookup refuses missing Book or inactive authority before loading accounts", async () => {
  for (const options of [{ denied: true }, { missingBook: true }]) {
    const { db, calls } = fixture(options)
    await expect(listFinanceMoneyAccounts(db, input)).rejects.toMatchObject({
      code: options.denied ? "FORBIDDEN" : "NOT_FOUND",
    })
    expect(calls).toHaveLength(0)
  }
})

test("money lookup refuses invalid paging and returns no cursor at list end", async () => {
  const { db } = fixture()
  for (const page of [
    { limit: 0 },
    { limit: 51 },
    { limit: 1.5 },
    { afterCode: "bad cursor" },
  ]) {
    await expect(
      listFinanceMoneyAccounts(db, { ...input, ...page }),
    ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
  }
  expect((await listFinanceMoneyAccounts(db, input)).nextCursor).toBeNull()
})
