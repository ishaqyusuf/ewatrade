import { expect, test } from "bun:test"
import { generalSalesAnswer } from "./general-sales-answer"
const period = {
  storeName: "QA Store",
  ownOrders: true,
  createdAfter: "2026-10-01T00:00:00Z",
  createdBefore: "2026-10-10T00:00:00Z",
}
test("incomplete report never exposes its subtotal or count as a complete answer", () => {
  const answer = generalSalesAnswer({
    ...period,
    summary: {
      partial: true,
      currencyCode: "NGN",
      orderValueMinor: 123456,
      orderCount: 2000,
    },
  })
  expect(answer.value).toBe("—")
  expect(answer.detail).toContain("complete total is unavailable")
  expect(JSON.stringify(answer)).not.toContain("1234.56")
  expect(JSON.stringify(answer)).not.toContain("2000")
  expect(answer.scope).toContain("Your orders")
  expect(answer.scope).toContain("end excluded")
})
test("known empty result is zero, with dated scope and order-value qualification", () => {
  const answer = generalSalesAnswer({
    ...period,
    summary: {
      partial: false,
      currencyCode: "NGN",
      orderValueMinor: 0,
      orderCount: 0,
    },
  })
  expect(answer.value).toBe("₦0.00")
  expect(answer.detail).toBe("0 orders · order value, not cash collected.")
  expect(answer.scope).toContain(period.createdAfter)
  expect(answer.scope).toContain(period.createdBefore)
})
