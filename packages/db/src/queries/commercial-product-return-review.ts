import { multiplyExactDecimals } from "@ewatrade/utils/exact-decimal"
import { createHash } from "node:crypto"
import type { Prisma } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import type { ReturnCommercialOrderProductLineInput } from "./commercial-orders"
import { productReturnQuantityImpact, productReturnStockImpact } from "./product-return-impact"

type ReturnReviewInput = Pick<ReturnCommercialOrderProductLineInput,
  "tenantId" | "orderLineId" | "quantity" | "disposition" | "destinationBalanceSourceId"
> & { storeId: string }

/** Stock-only evidence. A complete assistant review must also bind financial effects. */
export async function getCommercialProductReturnStockReview(db: Prisma.TransactionClient, input: ReturnReviewInput) {
  const line = await db.commercialOrderLine.findFirst({
    where: { id: input.orderLineId, kind: "PRODUCT_UNIT", order: { tenantId: input.tenantId, storeId: input.storeId } },
    include: {
      snapshot: true,
      order: { select: { id: true, orderNumber: true, status: true, currencyCode: true } },
      productFulfillments: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      productReturns: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    },
  })
  if (!line?.snapshot || !line.productFulfillments.length)
    throw new CatalogError("ORDER_NOT_FOUND", "Fulfilled Product Order line not found in this Store.")
  const snapshot = line.snapshot
  const quantities = productReturnQuantityImpact({
    quantity: input.quantity,
    fulfilledQuantities: line.productFulfillments.map(value => value.quantity.toFixed()),
    returnedQuantities: line.productReturns.map(value => value.quantity.toFixed()),
  })
  let stock: null | (ReturnType<typeof productReturnStockImpact> & {
    balanceSourceId: string; unitName: string; reservedBefore: string; reservedAfter: string; canonicalBefore: string
  }) = null
  let balanceEvidence: unknown = null
  if (input.disposition === "restock") {
    const destination = input.destinationBalanceSourceId ?? snapshot.balanceSourceId
    if (!destination || !snapshot.unitFactor)
      throw new CatalogError("INVALID_ORDER", "Restock requires the original or a compatible Balance Source.")
    const balance = await db.stockBalanceSource.findFirst({
      where: { id: destination, tenantId: input.tenantId, storeId: input.storeId },
      include: { inventoryUnit: true },
    })
    if (!balance || balance.variantId !== snapshot.variantId ||
        (balance.id !== snapshot.balanceSourceId &&
          !(balance.kind === "PACKAGED_STOCK" && balance.inventoryUnitId === snapshot.inventoryUnitId)))
      throw new CatalogError("INVALID_ORDER", "Return destination must preserve the original Inventory Unit meaning.")
    stock = {
      ...productReturnStockImpact({ quantity: quantities.quantity, unitFactor: snapshot.unitFactor.toFixed(), balanceKind: balance.kind, onHandQuantity: balance.onHandQuantity.toFixed() }),
      balanceSourceId: balance.id, unitName: balance.inventoryUnit.name,
      canonicalBefore: balance.kind === "PACKAGED_STOCK" ? multiplyExactDecimals(balance.onHandQuantity.toFixed(), snapshot.unitFactor.toFixed(), 18) : balance.onHandQuantity.toFixed(),
      reservedBefore: balance.reservedQuantity.toFixed(), reservedAfter: balance.reservedQuantity.toFixed(),
    }
    balanceEvidence = balance
  }
  return {
    orderId: line.order.id, orderLineId: line.id, orderNumber: line.order.orderNumber,
    productName: snapshot.catalogItemName, offeringName: snapshot.offeringName,
    currencyCode: line.order.currencyCode, disposition: input.disposition, quantities, stock,
    financialReview: "PENDING" as const,
    // This digest is deliberately named stockRevision: it is insufficient for confirmation.
    stockRevision: createHash("sha256").update(JSON.stringify({ input, line, balanceEvidence }, (_key, value) => typeof value === "bigint" ? value.toString() : value)).digest("hex"),
  }
}
