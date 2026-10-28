import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { customerCreditBillingCommandId } from "./billing-reclassification"
import { getCustomerOrderReturnReviewInTransaction } from "./order-return-review"

const input = { tenantId: "tenant", actorUserId: "owner", orderId: "order" }
function fixture(
  options: {
    denied?: boolean
    missingOrder?: boolean
    missingCustomer?: boolean
    missingBook?: boolean
    missingAccount?: boolean
    closed?: boolean
    badLineage?: boolean
    replacement?: boolean
    duplicate?: boolean
    tooMany?: boolean
    omitCredit?: boolean
  } = {},
) {
  const order = {
    id: "order",
    tenantId: "tenant",
    storeId: "store",
    customerId: options.missingCustomer ? null : "customer",
    customer: options.missingCustomer
      ? null
      : { id: "customer", name: "Customer Name" },
    currencyCode: "NGN",
    orderNumber: "QA-1",
    totalMinor: 10000,
    amountPaidMinor: 5000,
    paymentStatus: "PARTIALLY_PAID",
    status: "CONFIRMED",
  }
  let accountReads = 0
  let scopeReads = 0
  const allocationId = options.replacement ? "replacement" : "original"
  const candidate = {
    originalAllocationId: "original",
    allocationId,
    remainingMinor: "2000",
    reclassCommandId: options.badLineage
      ? "forged-lineage"
      : options.replacement
        ? customerCreditBillingCommandId("original")
        : null,
  }
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join("")
      if (sql.includes('FROM "CustomerFundsRefundRequest"'))
        return [{ reservedMinor: 500n }]
      if (sql.includes('FROM "CommercialOrderPayment"'))
        return options.omitCredit
          ? []
          : options.tooMany
            ? Array.from({ length: 51 }, (_, index) => ({
                ...candidate,
                allocationId: `source-${index}`,
              }))
            : options.duplicate
              ? [candidate, candidate]
              : [candidate]
      return []
    },
    membership: {
      findFirst: async () =>
        options.denied ? null : { tenant: { isActive: true } },
    },
    commercialOrder: {
      findFirst: async (args: { where: { id: string; tenantId: string } }) => {
        scopeReads++
        expect(args.where).toEqual({ id: "order", tenantId: "tenant" })
        return options.missingOrder ? null : order
      },
    },
    financeBook: {
      findUnique: async () =>
        options.missingBook
          ? null
          : {
              id: "book",
              tenantId: "tenant",
              currencyCode: "NGN",
              startsAt: new Date("2026-01-01"),
              closedThrough: options.closed ? new Date("2099-01-01") : null,
            },
    },
    customerLedgerAccount: {
      findUnique: async () => {
        accountReads++
        return options.missingAccount
          ? null
          : {
              id: "account",
              tenantId: "tenant",
              customerId: "customer",
              currencyCode: "NGN",
              revision: 7n,
              lastSequence: 9n,
            }
      },
    },
    commercialOrderPayment: {
      findMany: async () => [
        { amountMinor: 3000, type: "PAYMENT", method: "CUSTOMER_CREDIT" },
        { amountMinor: 1000, type: "REFUND", method: "CUSTOMER_CREDIT" },
        { amountMinor: 5000, type: "PAYMENT", method: "BANK_TRANSFER" },
        { amountMinor: 2000, type: "REFUND", method: "BANK_TRANSFER" },
      ],
    },
    customerLedgerAllocation: {
      findFirst: async (args: { where: { id: string; accountId: string } }) => {
        expect(args.where).toEqual({ id: allocationId, accountId: "account" })
        return {
          id: allocationId,
          creditEntryId: "credit",
          chargeEntryId: "charge",
          amountMinor: 3000n,
          createdAt: new Date("2026-10-01"),
          credit: { kind: "RECEIPT" },
          charge: {
            id: "charge",
            accountId: "account",
            tenantId: "tenant",
            kind: "ORDER_CHARGE",
            side: "DEBIT",
            sourceKind: "COMMERCIAL_ORDER_BILLED",
            sourceId: "order",
            orderId: "order",
            amountMinor: 10000n,
          },
        }
      },
    },
    customerLedgerAllocationRelease: {
      aggregate: async () => ({ _sum: { amountMinor: 1000n } }),
    },
    financeJournalEntry: { findUnique: async () => ({ id: "billing" }) },
    financeAccount: {
      findFirst: async (args: { where: { purpose: string } }) => ({
        id:
          args.where.purpose === "CUSTOMER_ADVANCE" ? "advance" : "receivable",
      }),
    },
  } as unknown as Prisma.TransactionClient
  return { tx, accountReads: () => accountReads, scopeReads: () => scopeReads }
}

test("mixed return review derives current money/source scope and excludes credit and prior cash returns from cash max", async () => {
  const result = await getCustomerOrderReturnReviewInTransaction(
    fixture().tx,
    input,
  )
  expect(result).toMatchObject({
    status: "AVAILABLE",
    accountId: "account",
    accountRevision: "7",
    bookId: "book",
    customerId: "customer",
    storeId: "store",
    currencyCode: "NGN",
    ordinaryCashMaxMinor: "3000",
    ordinaryCashRemainingMinor: "3000",
    creditMaxMinor: "2000",
    reservedCreditMinor: "500",
    orderPaidMinor: "5000",
    canReturn: true,
    creditSources: [
      {
        allocationId: "original",
        originalAllocationId: "original",
        creditEntryId: "credit",
        remainingMinor: "2000",
        sourceKind: "BILLED",
      },
    ],
  })
})
test("billing replacements retain original lineage and duplicate current allocations appear once", async () => {
  const result = await getCustomerOrderReturnReviewInTransaction(
    fixture({ replacement: true, duplicate: true }).tx,
    input,
  )
  expect(result).toMatchObject({
    status: "AVAILABLE",
    creditMaxMinor: "2000",
    creditSources: [
      { allocationId: "replacement", originalAllocationId: "original" },
    ],
  })
  if (result.status !== "AVAILABLE")
    throw new Error("Expected available source review")
  expect(result.creditSources).toHaveLength(1)
})
test("missing setup/closed book is explicitly unavailable and creates no account", async () => {
  for (const [options, reason] of [
    [{ missingCustomer: true }, "CUSTOMER_REQUIRED"],
    [{ missingBook: true }, "FINANCE_BOOK_REQUIRED"],
    [{ missingAccount: true }, "CUSTOMER_ACCOUNT_REQUIRED"],
    [{ closed: true }, "CLOSED_PERIOD"],
  ] as const) {
    expect(
      await getCustomerOrderReturnReviewInTransaction(
        fixture(options).tx,
        input,
      ),
    ).toMatchObject({ status: "UNAVAILABLE", reason })
  }
  const f = fixture({ missingCustomer: true })
  await getCustomerOrderReturnReviewInTransaction(f.tx, input)
  expect(f.accountReads()).toBe(0)
})
test("revoked authority/foreign Order and invalid or incomplete source coverage fail safely", async () => {
  const f = fixture({ denied: true })
  await expect(
    getCustomerOrderReturnReviewInTransaction(f.tx, input),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(f.scopeReads()).toBe(0)
  await expect(
    getCustomerOrderReturnReviewInTransaction(
      fixture({ missingOrder: true }).tx,
      input,
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  for (const options of [{ badLineage: true }, { omitCredit: true }])
    expect(
      await getCustomerOrderReturnReviewInTransaction(
        fixture(options).tx,
        input,
      ),
    ).toMatchObject({
      status: "UNAVAILABLE",
      reason: "SOURCE_RECONCILIATION_REQUIRED",
    })
  expect(
    await getCustomerOrderReturnReviewInTransaction(
      fixture({ tooMany: true }).tx,
      input,
    ),
  ).toMatchObject({ status: "UNAVAILABLE", reason: "SOURCE_LIMIT_EXCEEDED" })
})
