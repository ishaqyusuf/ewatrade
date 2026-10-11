import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { getFinanceBillPaymentReview } from "./bill-payment-review"
const input = { tenantId: "tenant", actorUserId: "owner", bookId: "book", billId: "bill", accountId: "cash", amountMinor: "250", effectiveAt: new Date("2026-10-02") }
function fixture(options: { denied?: boolean; missingBook?: boolean; missingBill?: boolean; purchase?: boolean; voided?: boolean; paid?: boolean; missingAccount?: boolean; closed?: boolean; archivedPayable?: boolean } = {}) {
  return {
    $queryRaw: async () => [], membership: { findFirst: async () => options.denied ? null : { tenant: { isActive: true } } },
    financeBook: { findFirst: async (args: unknown) => { expect(args).toMatchObject({ where: { id: "book", tenantId: "tenant" } }); return options.missingBook ? null : { id: "book", currencyCode: "NGN", startsAt: new Date("2026-01-01"), closedThrough: options.closed ? new Date("2026-10-03") : null } } },
    financeBill: { findFirst: async (args: unknown) => { expect(args).toEqual({ where: { id: "bill", bookId: "book" } });return options.missingBill ? null : { id: "bill", kind: options.purchase ? "PURCHASE" : "EXPENSE", voidedAt: options.voided ? new Date() : null, incurredAt: new Date("2026-10-01"), dueAt: null, payeeName: "Landlord", description: "Rent", totalMinor: 1000n, paidMinor: options.paid ? 1000n : 100n } } },
    financeAccount: {
      findFirst: async (args: {where: {bookId: string; archivedAt: null; code?: string}}) => { expect(args.where).toMatchObject({ bookId: "book", archivedAt: null });return options.missingAccount ? null : { id: args.where.code === "3000" ? "capital" : "cash", name: args.where.code === "3000" ? "Owner capital" : "Shop cash" } },
      findUniqueOrThrow: async () => ({ id: "payable", name: "Payables", archivedAt: options.archivedPayable ? new Date() : null }),
    },
  } as unknown as Prisma.TransactionClient
}
test("bill payment review preserves exact previous and remaining liability", async () => {
  expect(await getFinanceBillPaymentReview(fixture(), input)).toMatchObject({ billId: "bill", payeeName: "Landlord", paidBeforeMinor: "100", paidAfterMinor: "350", outstandingBeforeMinor: "900", outstandingAfterMinor: "650", amountMinor: "250", funding: "BUSINESS_ACCOUNT", accountName: "Shop cash", moneyTransfer: "NOT_PERFORMED" })
  const { accountId: _account, ...base } = input
  expect(await getFinanceBillPaymentReview(fixture(), { ...base, funding: "OWNER_CAPITAL", amountMinor: "900" })).toMatchObject({ funding: "OWNER_CAPITAL", accountId: "capital", outstandingAfterMinor: "0" })
})
test("bill payment review rejects unavailable, voided, settled and purchase bills", async () => {
  for (const options of [{ denied: true }, { missingBook: true }, { missingBill: true }, { purchase: true }, { voided: true }, { paid: true }, { missingAccount: true }, { closed: true }, { archivedPayable: true }]) await expect(getFinanceBillPaymentReview(fixture(options), input)).rejects.toBeDefined()
  for (const change of [{ amountMinor: "0" }, { amountMinor: "901" }, { effectiveAt: new Date("2026-09-30") }, { effectiveAt: new Date("invalid") }, { funding: "OWNER_CAPITAL" as const }, { reference: "x".repeat(161) }]) await expect(getFinanceBillPaymentReview(fixture(), { ...input, ...change })).rejects.toBeDefined()
})
