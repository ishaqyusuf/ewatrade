import { expect, test } from "bun:test"
import { generalBillInput, generalBillsInput, generalBillData } from "./general-bill-reads"
test("bill tools require exact Book and reject authority/paging overrides", () => {
  expect(generalBillsInput.parse({ bookId: "book", query: "rent", status: "PARTIAL", cursor: "cursor" })).toMatchObject({ bookId: "book", query: "rent", cursor: "cursor" })
  for (const change of [{ tenantId: "other" }, { storeId: "other" }, { limit: 50 }, { sort: { field: "totalMinor", direction: "desc" } }, { direction: "backward" }]) expect(generalBillsInput.safeParse({ bookId: "book", ...change }).success).toBe(false)
  expect(generalBillInput.safeParse({ bookId: "book", billId: "bill" }).success).toBe(true)
  expect(generalBillInput.safeParse({ bookId: "book" }).success).toBe(false)
})
test("bill detail bounds payment history without truncating authoritative balances", () => {
  const bill = { id: "bill", bookId: "book", payeeName: "Landlord", description: "Rent", totalMinor: "1000", paidMinor: "550", outstandingMinor: "450", lines: [], payments: Array.from({ length: 11 }, (_, index) => ({ id: `payment-${index}`, amountMinor: "50", accountId: "cash", account: { name: "Cash" }, funding: "BUSINESS_ACCOUNT", effectiveAt: new Date(), reference: null, reversedAt: index === 0 ? new Date("2026-10-01") : null, reversalReason: index === 0 ? "Duplicate" : null })) } as unknown as Parameters<typeof generalBillData>[0]
  const result = generalBillData(bill)
  expect(result.payments).toHaveLength(10)
  expect(result.payments[0]).toMatchObject({reversedAt: new Date("2026-10-01"), reversalReason: "Duplicate"})
  expect(result).toMatchObject({ paymentCount: 11, paymentHistoryComplete: false, paidMinor: "550", outstandingMinor: "450" })
  expect(generalBillData({ ...bill, payments: [] }).paymentHistoryComplete).toBe(true)
})
