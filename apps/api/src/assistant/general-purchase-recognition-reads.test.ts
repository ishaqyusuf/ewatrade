import { expect, test } from "bun:test"
import { generalPurchaseRegistrationsInput, generalPurchaseRecognitionInput, generalPurchaseRegistrationsAnswer } from "./general-purchase-recognition-reads"
test("purchase registration discovery binds supplier/Book and prevents paging or authority override", () => {
  expect(generalPurchaseRegistrationsInput.parse({ bookId: "book", supplierId: "supplier", cursor: "cursor" })).toEqual({ bookId: "book", supplierId: "supplier", cursor: "cursor" })
  expect(generalPurchaseRegistrationsInput.safeParse({ bookId: "book" }).success).toBe(false)
  for (const change of [{ tenantId: "other" }, { actorUserId: "other" }, { limit: 50 }, { direction: "backward" }, { storeId: "other" }]) expect(generalPurchaseRegistrationsInput.safeParse({ bookId: "book", supplierId: "supplier", ...change }).success).toBe(false)
  expect(generalPurchaseRecognitionInput.parse({ bookId: "book", recognitionId: "recognition" })).toEqual({ bookId: "book", recognitionId: "recognition" })
  expect(generalPurchaseRecognitionInput.safeParse({ bookId: "book", billId: "bill" }).success).toBe(false)
})
test("registration answer labels agreed cost and never presents registration as payable or stock", () => {
  const answer = generalPurchaseRegistrationsAnswer({ bookId: "book", supplierId: "supplier", currencyCode: "NGN", items: [{ id: "recognition", bookId: "book", supplierId: "supplier", storeId: "store", agreedAt: new Date(), description: "Feed", amountMinor: "12345" }], nextCursor: "recognition" })
  expect(answer.value).toBe("1 on this page")
  expect(answer.detail).toContain("₦123.45 agreed")
  expect(answer.detail).toContain("including those without invoices")
  expect(answer.detail).toContain("Registration alone creates no payable or stock")
  expect(answer.detail).toContain("preserve the Book and supplier")
})
