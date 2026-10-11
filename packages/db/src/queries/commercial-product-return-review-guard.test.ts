import { expect, test } from "bun:test"
import { Prisma } from "../../generated/prisma/client"
import { lockCommerceFinancialOrder } from "./customer-ledger/commerce-locks"
import { getCommercialProductReturnImpactReview } from "./commercial-product-return-impact-review"
import { assertCommercialProductReturnReview } from "./commercial-product-return-review-guard"
const input = { tenantId: "tenant", storeId: "store", orderLineId: "line", quantity: "1", disposition: "no_restock" as const }
function fixture() {
  const locks: string[] = []
  const order = { id: "order", tenantId: "tenant", storeId: "store", currencyCode: "NGN", customerId: null, status: "COMPLETED" }
  const returns: Array<{ quantity: Prisma.Decimal }> = []
  const tx = {
    commercialOrder: { findFirst: async () => order },
    commercialOrderLine: { findFirst: async () => ({
      id: "line", orderId: "order", order, kind: "PRODUCT_UNIT",
      snapshot: { balanceSourceId: "source" },
      productFulfillments: [{ id: "fulfillment", quantity: new Prisma.Decimal("2") }],
      productReturns: returns,
    }) },
    financeBook: { findUnique: async () => null },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?")
      if (sql.includes('FROM "FinanceBook"')) { locks.push("book"); return [] }
      if (sql.includes('FROM "CommercialOrder"')) { locks.push("order"); return [{ id: "order" }] }
      locks.push(`stock:${values[0]}`)
      return [{ id: values[0] }]
    },
  } as unknown as Prisma.TransactionClient
  return { tx, locks, returns }
}
test("review guard requires actual same-transaction Order lock evidence", async () => {
  const f = fixture()
  await expect(assertCommercialProductReturnReview(f.tx, { ...input, orderId: "order", clientReturnId: "command", expectedReviewRevision: "stale" }, {})).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
  expect(f.locks).toEqual([])
})
test("unchanged review passes only after financial, Order and stock locks", async () => {
  const f = fixture()
  const review = await getCommercialProductReturnImpactReview(f.tx, input)
  const held = await lockCommerceFinancialOrder(f.tx, { tenantId: "tenant", orderId: "order" })
  expect(held).not.toBeNull()
  const result = await assertCommercialProductReturnReview(f.tx, { ...input, orderId: "order", clientReturnId: "command", expectedReviewRevision: review.impactRevision }, held!)
  expect(result.impactRevision).toBe(review.impactRevision)
  expect(f.locks).toEqual(["book", "order", "stock:source"])
})
test("new return history refuses the old review after locking", async () => {
  const f = fixture()
  const review = await getCommercialProductReturnImpactReview(f.tx, input)
  f.returns.push({ quantity: new Prisma.Decimal("0.5") })
  const held = await lockCommerceFinancialOrder(f.tx, { tenantId: "tenant", orderId: "order" })
  await expect(assertCommercialProductReturnReview(f.tx, { ...input, orderId: "order", clientReturnId: "command", expectedReviewRevision: review.impactRevision }, held!)).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
  expect(f.locks.at(-1)).toBe("stock:source")
})
