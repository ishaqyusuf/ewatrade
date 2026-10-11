import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { getCustomerLedgerReceiptReview } from "./receipt-review"
const input = {
  tenantId: "tenant",
  actorUserId: "owner",
  bookId: "book",
  accountId: "account",
  moneyAccountId: "cash",
  amountMinor: "1000",
  method: "CASH" as const,
  description: "Deposit received",
  storeId: "store",
}
function fixture(
  options: {
    denied?: boolean
    missingBook?: boolean
    missingMoney?: boolean
    missingAdvance?: boolean
    missingStore?: boolean
    currency?: string
    closed?: boolean
    purpose?: string
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
              closedThrough: options.closed ? new Date("2099-01-01") : null,
            }
      },
    },
    customerLedgerAccount: {
      findFirst: async (args: unknown) => {
        expect(args).toMatchObject({
          where: { id: "account", tenantId: "tenant" },
        })
        return {
          id: "account",
          customerId: "customer",
          customer: { name: "QA Customer" },
          currencyCode: options.currency ?? "NGN",
          revision: 4n,
          lastSequence: 3n,
        }
      },
    },
    financeAccount: {
      findFirst: async (args: { where: { id?: string } }) =>
        args.where.id
          ? options.missingMoney
            ? null
            : {
                id: "cash",
                name: "Shop cash",
                purpose: options.purpose ?? "CASH",
              }
          : options.missingAdvance
            ? null
            : { id: "advance" },
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
    customerLedgerEntry: {
      aggregate: async (args: {
        where: { side: string; sequence: unknown }
      }) => {
        expect(args.where.sequence).toEqual({ lte: 3n })
        return {
          _sum: { amountMinor: args.where.side === "CREDIT" ? 500n : 2000n },
        }
      },
    },
    customerLedgerAllocation: {
      aggregate: async () => ({ _sum: { amountMinor: 200n } }),
    },
    customerLedgerAllocationRelease: {
      aggregate: async () => ({ _sum: { amountMinor: 0n } }),
    },
  } as unknown as Prisma.TransactionClient
}
test("receipt review previews new credit while preserving debt and server timestamp semantics", async () => {
  expect(await getCustomerLedgerReceiptReview(fixture(), input)).toMatchObject({
    customerName: "QA Customer",
    availableBeforeMinor: "300",
    availableAfterMinor: "1300",
    outstandingDebtMinor: "1800",
    accountRevision: "4",
    timestampPolicy: "SERVER_NOW",
    effect: "RECORD_MONEY_ALREADY_RECEIVED",
    allocation: "NOT_PERFORMED",
    orderPayment: "NOT_RECORDED",
  })
})
test("receipt preview refuses authority, Book, currency, closed period, account and Store mismatches", async () => {
  for (const options of [
    { denied: true },
    { missingBook: true },
    { currency: "USD" },
    { closed: true },
    { missingMoney: true },
    { missingAdvance: true },
    { missingStore: true },
    { purpose: "BANK" },
  ]) {
    await expect(
      getCustomerLedgerReceiptReview(fixture(options), input),
    ).rejects.toThrow()
  }
})
