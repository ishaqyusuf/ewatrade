import { rememberProductReturnSource } from "./product-return-source-snapshot"
import { createHash } from "node:crypto"
import { Prisma } from "../../../generated/prisma/client"
import { productReturnQuantityImpact } from "../product-return-impact"
import { productReturnValuationInclude } from "./product-return-evidence"
import { reviewOriginalProductReturnCost } from "./product-return-cost-source"
import { FinanceError } from "./rules"

type CostReviewInput = { tenantId: string; storeId: string; orderLineId: string; quantity: string }
type CostQuantitySource = {
  id: string
  order: { currencyCode: string; tenantId: string; storeId: string }
  productFulfillments: { quantity: Prisma.Decimal }[]
  productReturns: { quantity: Prisma.Decimal }[]
}

/** Original source cost only: destination pool and journal effects need separate review. */
export async function previewProductReturnOriginalCost(db: Prisma.TransactionClient, input: CostReviewInput) {
  const source = await db.commercialOrderLine.findFirst({
    where: { id: input.orderLineId, kind: "PRODUCT_UNIT", order: { tenantId: input.tenantId, storeId: input.storeId } },
    select: {
      id: true, order: { select: { currencyCode: true, tenantId: true, storeId: true } },
      productFulfillments: { orderBy: { id: "asc" }, select: { quantity: true } },
      productReturns: { orderBy: { id: "asc" }, select: { quantity: true } },
    },
  })
  if (!source) throw new FinanceError("NOT_FOUND", "Fulfilled Product line not found in this Store.")
  return previewProductReturnOriginalCostFromSource(db, input, source)
}

/** Internal same-review composition; source must come from its scoped stock read. */
export async function previewProductReturnOriginalCostFromSource(
  db: Prisma.TransactionClient, input: CostReviewInput, rawSource: CostQuantitySource,
) {
  // Normalize projection/property order so standalone and composed no-Book
  // reviews have the same revision even when ORM result key order differs.
  const source = {
    id: rawSource.id,
    order: { currencyCode: rawSource.order.currencyCode, tenantId: rawSource.order.tenantId, storeId: rawSource.order.storeId },
    productFulfillments: rawSource.productFulfillments.map(({ quantity }) => ({ quantity })),
    productReturns: rawSource.productReturns.map(({ quantity }) => ({ quantity })),
  }
  if (source.id !== input.orderLineId || source.order.tenantId !== input.tenantId || source.order.storeId !== input.storeId)
    throw new FinanceError("CONFLICT", "Return quantity evidence belongs to another Store or line.")
  productReturnQuantityImpact({
    quantity: input.quantity,
    fulfilledQuantities: source.productFulfillments.map(value => value.quantity.toFixed()),
    returnedQuantities: source.productReturns.map(value => value.quantity.toFixed()),
  })
  const book = await db.financeBook.findUnique({
    where: { tenantId_currencyCode: { tenantId: input.tenantId, currencyCode: source.order.currencyCode } },
  })
  if (!book) return {
    bookId: null, status: "NO_FINANCE_BOOK" as const,
    sourceCostMinor: null, unknownReason: null, allocations: [],
    sourceRevision: createHash("sha256").update(JSON.stringify({ input, source, book: null })).digest("hex"),
  }
  const line = await db.commercialOrderLine.findFirst({
    where: { id: input.orderLineId, kind: "PRODUCT_UNIT", order: { tenantId: input.tenantId, storeId: input.storeId } },
    include: {
      ...productReturnValuationInclude.orderLine.include,
      order: productReturnValuationInclude.order,
    },
  })
  if (!line) throw new FinanceError("NOT_FOUND", "Fulfilled Product line not found in this Store.")
  const quantities = productReturnQuantityImpact({
    quantity: input.quantity,
    fulfilledQuantities: line.productFulfillments.map(value => value.quantity.toFixed()),
    returnedQuantities: line.productReturns.map(value => value.quantity.toFixed()),
  })
  const plan = reviewOriginalProductReturnCost({
    tenantId: input.tenantId, book, order: line.order, line,
    productReturn: {
      // Empty identity cannot match a persisted cuid; every saved return is prior history.
      id: "", orderId: line.orderId, orderLineId: line.id,
      storeId: input.storeId, quantity: new Prisma.Decimal(quantities.quantity),
    },
    physicalReturnAt: new Date(),
  })
  const result = {
    bookId: book.id,
    status: plan.sourceCostMinor === null ? "UNKNOWN" as const : "KNOWN" as const,
    sourceCostMinor: plan?.sourceCostMinor?.toString() ?? null,
    unknownReason: plan?.unknownReason ?? null,
    allocations: plan?.allocations.map(value => ({
      fulfillmentId: value.fulfillmentId, originalIssueId: value.originalIssueId,
      canonicalQuantity: value.canonicalQuantity,
      sourceCostMinor: value.sourceCostMinor?.toString() ?? null,
    })) ?? [],
    sourceRevision: createHash("sha256").update(JSON.stringify({ input, line, book }, (_key, value) => typeof value === "bigint" ? value.toString() : value)).digest("hex"),
  }
  rememberProductReturnSource(result, db, input, { book, line, order: line.order })
  return result
}
