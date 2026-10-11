import { expect, test } from "bun:test"
import { Prisma } from "../../../generated/prisma/client"
import { previewProductReturnOriginalCost } from "./preview-product-return-cost"
test("no-Book return validates quantity without loading valuation history", async () => {
  const queries: unknown[] = []
  const db = {
    commercialOrderLine: { findFirst: async (query: unknown) => {
      queries.push(query)
      return { id: "line", order: { currencyCode: "NGN" }, productFulfillments: [{ quantity: new Prisma.Decimal("2") }], productReturns: [{ quantity: new Prisma.Decimal("0.5") }] }
    } },
    financeBook: { findUnique: async () => null },
  } as unknown as Prisma.TransactionClient
  const input = { tenantId: "tenant", storeId: "store", orderLineId: "line", quantity: "0.5" }
  expect(await previewProductReturnOriginalCost(db, input)).toMatchObject({ status: "NO_FINANCE_BOOK", bookId: null, sourceCostMinor: null, allocations: [] })
  expect(queries).toHaveLength(1)
  expect(queries[0]).toEqual({
    where: { id: "line", kind: "PRODUCT_UNIT", order: { tenantId: "tenant", storeId: "store" } },
    select: { id: true, order: { select: { currencyCode: true } }, productFulfillments: { orderBy: { id: "asc" }, select: { quantity: true } }, productReturns: { orderBy: { id: "asc" }, select: { quantity: true } } },
  })
  await expect(previewProductReturnOriginalCost(db, { ...input, quantity: "1.500001" })).rejects.toMatchObject({ code: "INVALID_ORDER" })
})
