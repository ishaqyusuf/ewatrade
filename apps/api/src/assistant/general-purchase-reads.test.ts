import { expect, test } from "bun:test"
import { generalPurchasesInput, generalPurchaseInput, generalPurchaseData, generalPurchasesAnswer } from "./general-purchase-reads"
test("purchase lookup requires Book and refuses caller authority or pagination overrides", () => {
  expect(generalPurchasesInput.parse({ bookId: "book", supplierId: "supplier", status: "PARTIAL", cursor: "cursor" })).toMatchObject({ supplierId: "supplier", status: "PARTIAL", cursor: "cursor" })
  for (const change of [{ tenantId: "other" }, { actorUserId: "other" }, { storeId: "other" }, { limit: 50 }, { direction: "backward" }]) expect(generalPurchasesInput.safeParse({ bookId: "book", ...change }).success).toBe(false)
  expect(generalPurchaseInput.safeParse({ bookId: "book", billId: "bill" }).success).toBe(true)
  expect(generalPurchaseInput.safeParse({ billId: "bill" }).success).toBe(false)
})
test("purchase projection bounds histories while preserving exact settlement and source evidence", () => {
  const history = Array.from({ length: 11 }, (_, i) => ({ id: `row-${i}`, reversedAt: i === 0 ? "2026-10-01" : null }))
  const bill = { id: "bill", cashPaidMinor: "100", activeAllocatedMinor: "300", releasedAllocationMinor: "50", paidMinor: "400", outstandingMinor: "600", recognitionId: "recognition", coverage: { receipts: "SEPARATE_RECOGNITION_SOURCE" }, lines: [{ receipt: null }], payments: history, paymentsHasMore: false, supplierEntries: history, supplierEntriesHasMore: false, allocations: [{ id: "allocation", releases: history, releasesHasMore: false }], allocationsHasMore: true } as unknown as Parameters<typeof generalPurchaseData>[0]
  const data = generalPurchaseData(bill)
  expect(data.payments).toHaveLength(10)
  expect(data.supplierEntries).toHaveLength(10)
  expect(data.allocations[0]!.releases).toHaveLength(10)
  expect(data.allocations[0]!.releasesHasMore).toBe(true)
  expect(data).toMatchObject({ cashPaidMinor: "100", activeAllocatedMinor: "300", releasedAllocationMinor: "50", paidMinor: "400", outstandingMinor: "600", paymentsHasMore: true, supplierEntriesHasMore: true, allocationsHasMore: true, recognitionId: "recognition", coverage: bill.coverage, lines: bill.lines })
  expect(data.payments[0]!.reversedAt).toBe("2026-10-01")
  const empty = generalPurchaseData({ ...bill, payments: [], supplierEntries: [], allocations: [], allocationsHasMore: false })
  expect([empty.paymentsHasMore,empty.supplierEntriesHasMore,empty.allocationsHasMore]).toEqual([false,false,false])
})
test("purchase answer separates matching totals from a page and settlement from physical receipts", () => {
  const answer = generalPurchasesAnswer({ currencyCode: "NGN", count: 20, items: [], nextCursor: "next", summary: { incurredMinor: "10000", paidMinor: "4000", outstandingMinor: "6000", coverage: "SETTLED_AGAINST_BILLS" } })
  expect(answer.value).toBe("0 on this page · 20 matching")
  expect(answer.detail).toContain("₦60.00")
  expect(answer.detail).toContain("not all new cash paid")
  expect(answer.detail).toContain("registrations without a recognized bill are excluded")
})
