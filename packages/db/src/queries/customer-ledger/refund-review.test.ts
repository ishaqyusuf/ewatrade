import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { getCustomerLedgerCreditRefundReview } from "./refund-review"

const input = {
  tenantId: "tenant", actorUserId: "owner", bookId: "book", accountId: "account",
  creditEntryId: "credit", amountMinor: "250", moneyAccountId: "cash", method: "CASH" as const,
  effectiveAt: new Date("2026-09-02T12:00:00Z"),
}
function fixture(options: {
  denied?: boolean; closed?: boolean; currency?: string; allocated?: bigint; released?: bigint;
  reversed?: boolean; held?: bigint; receipt?: boolean; missingReceipt?: boolean; moneyPurpose?: string;
} = {}) {
  let reads = 0
  const db = {
    $queryRaw: async () => [],
    membership: { findFirst: async () => options.denied ? null : { tenant: { isActive: true } } },
    financeBook: { findFirst: async (args: unknown) => {
      reads++
      expect(args).toEqual({ where: { id: "book", tenantId: "tenant" } })
      return { id: "book", currencyCode: "NGN", startsAt: new Date("2026-09-01"), closedThrough: options.closed ? input.effectiveAt : null }
    } },
    customerLedgerAccount: { findFirst: async (args: unknown) => {
      expect(args).toEqual({ where: { id: "account", tenantId: "tenant" }, include: { customer: { select: { name: true } } } })
      return { id: "account", customerId: "customer", customer: { name: "QA customer" }, currencyCode: options.currency ?? "NGN", revision: 9n }
    } },
    customerLedgerEntry: { findFirst: async (args: unknown) => {
      expect(args).toEqual({ where: { id: "credit", accountId: "account", side: "CREDIT", kind: { in: ["OPENING_CREDIT", "RECEIPT"] }, reversals: { none: {} } } })
      return { id: "credit", kind: options.receipt ? "RECEIPT" : "OPENING_CREDIT", sourceKind: options.receipt ? "CUSTOMER_RECEIPT" : "CUSTOMER_OPENING", sourceId: options.receipt ? "receipt" : "account:CREDIT", amountMinor: 1000n, effectiveAt: new Date("2026-09-01") }
    } },
    financeJournalEntry: { findUnique: async () => ({ reversal: options.reversed ? { id: "reversal" } : null, lines: [{ account: { purpose: "CUSTOMER_ADVANCE", kind: "LIABILITY" }, creditMinor: options.held ?? 1000n, debitMinor: 0n }] }) },
    customerLedgerReceipt: { findFirst: async () => options.missingReceipt ? null : { id: "receipt" } },
    customerLedgerAllocation: { aggregate: async () => ({ _sum: { amountMinor: options.allocated ?? 400n } }) },
    customerLedgerAllocationRelease: { aggregate: async () => ({ _sum: { amountMinor: options.released ?? 100n } }) },
    financeAccount: { findFirst: async (args: { where: { id?: string } }) => args.where.id
      ? { id: "cash", name: "Till cash", purpose: options.moneyPurpose ?? "CASH" }
      : { id: "advances" } },
  } as unknown as Prisma.TransactionClient
  return { db, reads: () => reads }
}

test("refund review shows exact unused remainder and distinguishes bookkeeping from provider refund", async () => {
  expect(await getCustomerLedgerCreditRefundReview(fixture().db, input)).toMatchObject({
    accountRevision: "9", creditKind: "OPENING_CREDIT", amountMinor: "250",
    availableBeforeMinor: "700", availableAfterMinor: "450", currencyCode: "NGN",
    effect: "RECORD_MONEY_ALREADY_RETURNED", providerRefund: "NOT_REQUESTED", orderCancellation: "NOT_PERFORMED",
  })
  expect(await getCustomerLedgerCreditRefundReview(fixture({ receipt: true }).db, input)).toMatchObject({ creditKind: "RECEIPT" })
})

test("refund review rejects unsupported authority, closed dates and currency mismatch", async () => {
  const denied = fixture({ denied: true })
  await expect(getCustomerLedgerCreditRefundReview(denied.db, input)).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(denied.reads()).toBe(0)
  await expect(getCustomerLedgerCreditRefundReview(fixture({ closed: true }).db, input)).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
  await expect(getCustomerLedgerCreditRefundReview(fixture({ currency: "USD" }).db, input)).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
})

test("refund review retains provenance, available-credit and payment-method checks", async () => {
  for (const options of [{ reversed: true }, { held: 999n }, { receipt: true, missingReceipt: true }, { allocated: 900n, released: 0n }, { allocated: 0n, released: 1n }]) {
    await expect(getCustomerLedgerCreditRefundReview(fixture(options).db, input)).rejects.toMatchObject({ code: "CONFLICT" })
  }
  await expect(getCustomerLedgerCreditRefundReview(fixture({ moneyPurpose: "BANK" }).db, input)).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
})

test("canonical refund execution still rejects unreconciled source before writing", async () => {
  const { refundCustomerLedgerCreditInTransaction } = await import("./refunds")
  const { db } = fixture({ held: 999n })
  db.$queryRaw = (async () => [{ id: "book" }]) as typeof db.$queryRaw
  db.financeBook.findUniqueOrThrow = (async () => ({ id: "book", currencyCode: "NGN" })) as typeof db.financeBook.findUniqueOrThrow
  db.customerLedgerAccount.findUniqueOrThrow = (async () => ({ id: "account", currencyCode: "NGN", revision: 9n })) as typeof db.customerLedgerAccount.findUniqueOrThrow
  db.customerLedgerCommand = { findUnique: async () => null } as typeof db.customerLedgerCommand
  await expect(refundCustomerLedgerCreditInTransaction(db, {
    ...input, expectedRevision: "9", clientCommandId: "command", reason: "Customer collected unused funds",
  })).rejects.toMatchObject({ code: "CONFLICT" })
})
