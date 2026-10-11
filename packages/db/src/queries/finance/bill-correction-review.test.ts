import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { getFinanceBillPaymentReversalReview, getFinanceExpenseVoidReview } from "./bill-correction-review"
const input = { tenantId: "tenant", actorUserId: "owner", bookId: "book", effectiveAt: new Date("2026-10-03"), reason: " Correct duplicate " }
function fixture(options: { paid?: bigint; activePayments?: number; voided?: boolean; reversed?: boolean; postingReversed?: boolean; paymentReversedAt?: Date; closed?: boolean; denied?: boolean; archived?: boolean; owner?: boolean } = {}) {
  const bill = { id: "bill", kind: "EXPENSE", totalMinor: 1000n, paidMinor: options.paid ?? 250n, voidedAt: options.voided ? new Date() : null, payeeName: "Landlord", description: "Rent" }
  return {
    $queryRaw: async () => [], membership: { findFirst: async () => options.denied ? null : { tenant: { isActive: true } } },
    financeBook: { findFirst: async (args: unknown) => { expect(args).toEqual({ where: { id: "book", tenantId: "tenant" } });return { id: "book", currencyCode: "NGN", startsAt: new Date("2026-01-01"), closedThrough: options.closed ? new Date("2026-10-04") : null } } },
    financeBill: { findFirst: async (args: unknown) => { expect(args).toEqual({ where: { id: "bill", bookId: "book" } });return bill } },
    financeBillPayment: {
      findFirst: async (args: unknown) => { expect(args).toMatchObject({ where: { id: "payment", bookId: "book" } });return { id: "payment", billId: "bill", bill, account: { purpose: options.owner ? "CAPITAL" : "CASH" }, amountMinor: 250n, reversedAt: options.reversed ? new Date() : null } },
      count: async () => options.activePayments ?? 0,
      aggregate: async () => ({ _max: { reversalEffectiveAt: options.paymentReversedAt ?? null } }),
    },
    financeJournalEntry: { findUnique: async () => ({ id: "original", effectiveAt: new Date("2026-10-01"), reversal: options.postingReversed ? { id: "reversal" } : null, reversalOfId: null, lines: [{ accountId: "payable", debitMinor: 250n, creditMinor: 0n }, { accountId: "cash", debitMinor: 0n, creditMinor: 250n }] }) },
    financeAccount: { findMany: async () => options.archived ? [] : [{ id: "payable", name: "Payable" }, { id: "cash", name: "Cash" }] },
  } as unknown as Prisma.TransactionClient
}
test("payment correction restores liability and reverses exact original journal sides", async () => {
  const review = await getFinanceBillPaymentReversalReview(fixture(), { ...input, paymentId: "payment" })
  expect(review).toMatchObject({ paidBeforeMinor: "250", paidAfterMinor: "0", outstandingBeforeMinor: "750", outstandingAfterMinor: "1000", reason: "Correct duplicate", moneyTransfer: "NOT_PERFORMED" })
  expect(review.lines).toEqual([{ accountId: "payable", accountName: "Payable", debitMinor: "0", creditMinor: "250" }, { accountId: "cash", accountName: "Cash", debitMinor: "250", creditMinor: "0" }])
  expect((await getFinanceBillPaymentReversalReview(fixture({ owner: true }), { ...input, paymentId: "payment" })).funding).toBe("OWNER_CAPITAL")
})
test("void review requires zero paid and no active or later-reversed payments", async () => {
  expect(await getFinanceExpenseVoidReview(fixture({ paid: 0n }), { ...input, billId: "bill" })).toMatchObject({ totalMinor: "1000", outstandingAfterMinor: "0" })
  for (const options of [{ paid: 1n }, { paid: 0n, activePayments: 1 }, { paid: 0n, voided: true }, { paid: 0n, paymentReversedAt: new Date("2026-10-04") }]) await expect(getFinanceExpenseVoidReview(fixture(options), { ...input, billId: "bill" })).rejects.toBeDefined()
})
test("correction refuses closed periods, duplicate reversals, unavailable accounts and invalid dates", async () => {
  for (const options of [{ denied: true }, { closed: true }, { reversed: true }, { voided: true }, { postingReversed: true }, { paid: 100n }, { archived: true }]) await expect(getFinanceBillPaymentReversalReview(fixture(options), { ...input, paymentId: "payment" })).rejects.toBeDefined()
  for (const change of [{ effectiveAt: new Date("2026-09-30") }, { reason: " " }]) await expect(getFinanceBillPaymentReversalReview(fixture(), { ...input, ...change, paymentId: "payment" })).rejects.toBeDefined()
})
