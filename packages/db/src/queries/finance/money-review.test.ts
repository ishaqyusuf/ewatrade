import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { getFinanceMoneyMovementReview } from "./money-review"
const input = {
  tenantId: "tenant",
  actorUserId: "owner",
  bookId: "book",
  accountId: "cash",
  destinationAccountId: "bank",
  kind: "TRANSFER" as const,
  amountMinor: "1250",
  description: "Cash deposited",
  effectiveAt: new Date("2026-10-01"),
  storeId: "store",
}
function fixture(
  options: {
    denied?: boolean
    missingBook?: boolean
    missingAccount?: boolean
    missingStore?: boolean
    closed?: boolean
    archived?: boolean
    same?: boolean
  } = {},
) {
  return {
    $queryRaw: async () => [],
    membership: {
      findFirst: async () =>
        options.denied ? null : { tenant: { isActive: true } },
    },
    financeBook: {
      findFirst: async (args: unknown) => {
        expect(args).toEqual({ where: { id: "book", tenantId: "tenant" } })
        return options.missingBook
          ? null
          : {
              id: "book",
              currencyCode: "NGN",
              startsAt: new Date("2026-01-01"),
              closedThrough: options.closed ? new Date("2026-10-02") : null,
            }
      },
    },
    store: {
      findFirst: async (args: unknown) => {
        expect(args).toEqual({
          where: { id: "store", tenantId: "tenant" },
          select: { id: true },
        })
        return options.missingStore ? null : { id: "store" }
      },
    },
    financeAccount: {
      findFirst: async (args: {
        where: { id: string; bookId: string; archivedAt: null }
      }) => {
        expect(args.where).toMatchObject({ bookId: "book", archivedAt: null })
        return options.missingAccount
          ? null
          : {
              id: options.same ? "cash" : args.where.id,
              name: args.where.id === "cash" ? "Shop cash" : "Bank",
              purpose: args.where.id === "cash" ? "CASH" : "BANK",
              archivedAt: null,
            }
      },
      findUnique: async (args: {
        where: { bookId_code: { bookId: string; code: string } }
      }) => {
        expect(args.where.bookId_code.bookId).toBe("book")
        return {
          id: args.where.bookId_code.code,
          name: "Owner equity",
          purpose: "OWNER_EQUITY",
          archivedAt: options.archived ? new Date() : null,
        }
      },
    },
  } as unknown as Prisma.TransactionClient
}
test("transfer preview identifies balanced direction and records no real transfer", async () => {
  expect(await getFinanceMoneyMovementReview(fixture(), input)).toMatchObject({
    accountName: "Shop cash",
    oppositeAccountName: "Bank",
    currencyCode: "NGN",
    amountMinor: "1250",
    debitAccountId: "bank",
    creditAccountId: "cash",
    effectiveAt: "2026-10-01T00:00:00.000Z",
    moneyTransfer: "NOT_PERFORMED",
  })
})
test("contribution and withdrawal retain distinct equity controls and cash directions", async () => {
  const { destinationAccountId: _destination, ...base } = input
  expect(
    await getFinanceMoneyMovementReview(fixture(), {
      ...base,
      kind: "OWNER_CONTRIBUTION",
    }),
  ).toMatchObject({ debitAccountId: "cash", creditAccountId: "3000" })
  expect(
    await getFinanceMoneyMovementReview(fixture(), {
      ...base,
      kind: "OWNER_WITHDRAWAL",
    }),
  ).toMatchObject({ debitAccountId: "3100", creditAccountId: "cash" })
  await expect(
    getFinanceMoneyMovementReview(fixture({ archived: true }), {
      ...base,
      kind: "OWNER_WITHDRAWAL",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  await expect(
    getFinanceMoneyMovementReview(fixture(), {
      ...base,
      kind: "OPENING_BALANCE",
    }),
  ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
})
test("preview rejects wrong scope, unavailable accounts, same account and closed/invalid dates", async () => {
  for (const options of [
    { denied: true },
    { missingBook: true },
    { missingAccount: true },
    { missingStore: true },
    { closed: true },
    { same: true },
  ])
    await expect(
      getFinanceMoneyMovementReview(fixture(options), input),
    ).rejects.toThrow()
  for (const effectiveAt of [
    new Date("2025-01-01"),
    new Date("2099-01-01"),
    new Date("invalid"),
  ])
    await expect(
      getFinanceMoneyMovementReview(fixture(), { ...input, effectiveAt }),
    ).rejects.toThrow()
  await expect(
    getFinanceMoneyMovementReview(fixture(), { ...input, amountMinor: "0" }),
  ).rejects.toThrow()
})
