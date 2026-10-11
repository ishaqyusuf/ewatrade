import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import {
  getCustomerCreditAllocationReview,
  getCustomerAllocationReleaseReview,
} from "./credit-review"
const input = {
  tenantId: "tenant",
  actorUserId: "owner",
  bookId: "book",
  accountId: "account",
  creditEntryId: "credit",
  chargeEntryId: "charge",
  allocationId: "allocation",
  reason: "Correction",
  amountMinor: "100",
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
      findFirst: async (args: { where: { id: string; accountId: string } }) => {
        expect(args.where.accountId).toBe("account")
        return {
          id: args.where.id,
          kind: args.where.id === "credit" ? "RECEIPT" : "OPENING_DEBT",
          amountMinor: args.where.id === "credit" ? 500n : 2000n,
        }
      },
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
      findFirst: async (args: unknown) => {
        expect(args).toMatchObject({
          where: { id: "allocation", accountId: "account" },
        })
        return {
          id: "allocation",
          creditEntryId: "credit",
          chargeEntryId: "charge",
          amountMinor: 200n,
          credit: { kind: "RECEIPT" },
          charge: { kind: "OPENING_DEBT" },
        }
      },
      aggregate: async () => ({ _sum: { amountMinor: 200n } }),
    },
    customerLedgerAllocationRelease: {
      aggregate: async () => ({ _sum: { amountMinor: 0n } }),
    },
  } as unknown as Prisma.TransactionClient
}
test("apply review caps the selected credit and debt without collecting money", async () => {
  expect(
    await getCustomerCreditAllocationReview(fixture(), input),
  ).toMatchObject({
    customerName: "QA Customer",
    sourceCreditBeforeMinor: "300",
    sourceCreditAfterMinor: "200",
    sourceDebtBeforeMinor: "1800",
    sourceDebtAfterMinor: "1700",
    accountRevision: "4",
    monetaryCollection: "NOT_PERFORMED",
  })
  await expect(
    getCustomerCreditAllocationReview(fixture(), {
      ...input,
      amountMinor: "301",
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
})
test("release review restores debt and available credit without refunding money", async () => {
  expect(
    await getCustomerAllocationReleaseReview(fixture(), input),
  ).toMatchObject({
    allocatedBeforeMinor: "200",
    allocatedAfterMinor: "100",
    accountCreditBeforeMinor: "300",
    accountCreditAfterMinor: "400",
    accountDebtBeforeMinor: "1800",
    accountDebtAfterMinor: "1900",
    monetaryRefund: "NOT_PERFORMED",
  })
  await expect(
    getCustomerAllocationReleaseReview(fixture(), {
      ...input,
      amountMinor: "201",
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  await expect(
    getCustomerAllocationReleaseReview(fixture(), { ...input, reason: " " }),
  ).rejects.toThrow()
})
test("both previews refuse revoked access, missing Book, currency mismatch and closed period", async () => {
  for (const review of [
    getCustomerCreditAllocationReview,
    getCustomerAllocationReleaseReview,
  ]) {
    for (const options of [
      { denied: true },
      { missingBook: true },
      { currency: "USD" },
      { closed: true },
      { missingAdvance: true },
    ]) {
      await expect(review(fixture(options), input)).rejects.toThrow()
    }
  }
})
