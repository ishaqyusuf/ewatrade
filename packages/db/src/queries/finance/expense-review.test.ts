import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { getFinanceExpenseReview } from "./expense-review"
import { normalizeFinanceExpense } from "./expense-input"
const input = { tenantId: "tenant", actorUserId: "owner", bookId: "book", payeeName: " Vendor ", description: " Rent ", incurredAt: new Date("2026-10-01"), storeId: "store", lines: [{ accountId: "rent", description: " October ", amountMinor: "1000" }] }
function fixture(options: { denied?: boolean; missingBook?: boolean; missingStore?: boolean; missingCategory?: boolean; archivedPayable?: boolean; missingPayment?: boolean; closed?: boolean } = {}) {
  return {
    $queryRaw: async () => [],
    membership: { findFirst: async () => options.denied ? null : { tenant: { isActive: true } } },
    financeBook: { findFirst: async (args: unknown) => { expect(args).toEqual({ where: { id: "book", tenantId: "tenant" } });return options.missingBook ? null : { id: "book", currencyCode: "NGN", startsAt: new Date("2026-01-01"), closedThrough: options.closed ? new Date("2026-10-02") : null } } },
    store: { findFirst: async (args: unknown) => { expect(args).toEqual({ where: { id: "store", tenantId: "tenant" }, select: { id: true } });return options.missingStore ? null : { id: "store" } } },
    financeAccount: {
      findMany: async (args: unknown) => { expect(args).toMatchObject({ where: { bookId: "book", id: { in: ["rent"] }, kind: "EXPENSE", purpose: "OPERATING_EXPENSE", archivedAt: null } });return options.missingCategory ? [] : [{ id: "rent", name: "Rent" }] },
      findUnique: async () => ({ id: "payable", name: "Accounts payable", archivedAt: options.archivedPayable ? new Date() : null }),
      findFirst: async (args: {where: {code?: string; id?: string}}) => options.missingPayment ? null : { id: args.where.code === "3000" ? "capital" : "cash", name: args.where.code === "3000" ? "Owner capital" : "Shop cash" },
    },
  } as unknown as Prisma.TransactionClient
}
test("expense review preserves unpaid liability and normalizes canonical line values", async () => {
  const review = await getFinanceExpenseReview(fixture(), input)
  expect(review).toMatchObject({ payeeName: "Vendor", description: "Rent", totalMinor: "1000", paidMinor: "0", outstandingMinor: "1000", status: "UNPAID", payment: null, moneyTransfer: "NOT_PERFORMED" })
  expect(review.lines).toEqual([{ accountId: "rent", accountName: "Rent", description: "October", amountMinor: "1000" }])
  expect(normalizeFinanceExpense(input)).toMatchObject({ totalMinor: 1000n, lines: [{ amountMinor: 1000n, position: 0 }] })
})
test("review distinguishes partial business payment and full owner-funded payment", async () => {
  expect(await getFinanceExpenseReview(fixture(), { ...input, payment: { accountId: "cash", amountMinor: "250", effectiveAt: input.incurredAt } })).toMatchObject({ status: "PARTIALLY_PAID", outstandingMinor: "750", payment: { funding: "BUSINESS_ACCOUNT", accountName: "Shop cash" } })
  expect(await getFinanceExpenseReview(fixture(), { ...input, payment: { funding: "OWNER_CAPITAL", amountMinor: "1000", effectiveAt: input.incurredAt } })).toMatchObject({ status: "PAID", outstandingMinor: "0", payment: { funding: "OWNER_CAPITAL", accountId: "capital" } })
})
test("review rejects missing authority, unavailable sources, closed dates and overpayment", async () => {
  for (const options of [{ denied: true }, { missingBook: true }, { missingStore: true }, { missingCategory: true }, { archivedPayable: true }, { closed: true }]) await expect(getFinanceExpenseReview(fixture(options), input)).rejects.toBeDefined()
  for (const payment of [{ accountId: "cash", amountMinor: "1001", effectiveAt: input.incurredAt }, { accountId: "cash", amountMinor: "1", effectiveAt: new Date("2026-09-30") }]) await expect(getFinanceExpenseReview(fixture(), { ...input, payment })).rejects.toBeDefined()
  await expect(getFinanceExpenseReview(fixture({ missingPayment: true }), { ...input, payment: { accountId: "cash", amountMinor: "1", effectiveAt: input.incurredAt } })).rejects.toMatchObject({ code: "NOT_FOUND" })
  for (const change of [{ payeeName: " " }, { lines: [] }, { dueAt: new Date("2026-09-30") }, { lines: [{ ...input.lines[0]!, amountMinor: "0" }] }]) expect(() => normalizeFinanceExpense({ ...input, ...change })).toThrow()
})
