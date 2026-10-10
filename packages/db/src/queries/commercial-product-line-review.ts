import { createHash } from "node:crypto"
import { compareExactDecimals, multiplyExactDecimals } from "@ewatrade/utils/exact-decimal"
import type { Prisma } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import { isCommercialOrderFulfillmentAllowed } from "./commercial-order-completion"
import { previewOrdinaryAdjustmentCost } from "./finance/preview-ordinary-adjustment-cost"
import { reservationCommitImpact } from "./reservation-commit-impact"

/** Authorized callers only. Confirmation must repeat under financial/order/reservation/balance locks. */
export async function getCommercialProductLineReview(
  db: Prisma.TransactionClient,
  input: { tenantId: string; storeId: string; orderLineId: string },
) {
  const line = await db.commercialOrderLine.findFirst({
    where: { id: input.orderLineId, order: { tenantId: input.tenantId, storeId: input.storeId } },
    include: {
      snapshot: true,
      productFulfillments: { select: { id: true }, orderBy: { id: "asc" } },
      stockReservation: { include: { enteredInventoryUnit: true, balanceSource: { include: { inventoryUnit: true } } } },
      order: { select: {
        id: true, orderNumber: true, status: true, currencyCode: true, deliveryDueAt: true,
        acceptedCommerceQuoteVersion: { select: { quote: { select: { sourceType: true } } } },
        prescriptionPickupFulfillment: { select: { orderId: true } },
        prescriptionDeliveryAssignment: { select: { orderId: true } },
      } },
    },
  })
  if (!line) throw new CatalogError("ORDER_NOT_FOUND", "Order line was not found in this Store.")
  const reservation = line.stockReservation
  const snapshot = line.snapshot
  if (line.kind !== "PRODUCT_UNIT" || !reservation || !snapshot)
    throw new CatalogError("INVALID_ORDER", "A reserved, snapshotted Product line is required.")
  if (!isCommercialOrderFulfillmentAllowed(line.order.status) || line.productFulfillments.length ||
      (line.order.deliveryDueAt && line.order.deliveryDueAt.getTime() > Date.now()))
    throw new CatalogError("INVALID_ORDER", "This Product line cannot be fulfilled now.")
  if (line.order.acceptedCommerceQuoteVersion?.quote.sourceType === "PRESCRIPTION_REQUEST" ||
      line.order.prescriptionPickupFulfillment || line.order.prescriptionDeliveryAssignment)
    throw new CatalogError("INVALID_ORDER", "Prescription Orders require their clinical fulfillment source.")
  const balance = reservation.balanceSource
  if (reservation.status !== "ACTIVE" || reservation.committedOperationId ||
      reservation.tenantId !== input.tenantId || reservation.storeId !== input.storeId ||
      reservation.commercialOrderLineId !== line.id ||
      balance.tenantId !== input.tenantId || balance.storeId !== input.storeId ||
      reservation.offeringId !== line.offeringId || snapshot.offeringId !== line.offeringId ||
      snapshot.currencyCode !== line.order.currencyCode ||
      snapshot.balanceSourceId !== balance.id || snapshot.variantId !== balance.variantId ||
      snapshot.inventoryUnitId !== reservation.enteredInventoryUnitId ||
      snapshot.configurationVersionId !== reservation.configurationVersionId ||
      !snapshot.unitFactor || compareExactDecimals(snapshot.unitFactor.toFixed(), reservation.unitFactorSnapshot.toFixed()) !== 0 ||
      compareExactDecimals(line.quantity.toFixed(), reservation.enteredQuantity.toFixed()) !== 0 ||
      compareExactDecimals(multiplyExactDecimals(reservation.enteredQuantity.toFixed(), reservation.unitFactorSnapshot.toFixed(), 18), reservation.canonicalQuantity.toFixed()) !== 0 ||
      compareExactDecimals(reservation.canonicalQuantity.toFixed(), "0") <= 0 ||
      !["CANONICAL_SHARED", "ALTERNATE_TRANSACTION", "PACKAGED_STOCK"].includes(snapshot.stockBehavior ?? "") ||
      snapshot.stockBehavior !== reservation.enteredInventoryUnit.stockBehavior ||
      (snapshot.stockBehavior === "PACKAGED_STOCK" ? balance.kind !== "PACKAGED_STOCK" || balance.inventoryUnitId !== snapshot.inventoryUnitId : balance.kind !== "SHARED_POOL"))
    throw new CatalogError("REVISION_CONFLICT", "Product reservation or sold-unit evidence changed.")
  const impact = reservationCommitImpact(reservation)
  const canonicalBefore = balance.kind === "PACKAGED_STOCK"
    ? multiplyExactDecimals(balance.onHandQuantity.toFixed(), reservation.unitFactorSnapshot.toFixed(), 18)
    : balance.onHandQuantity.toFixed()
  // Both stock decreases issue the same weighted-average pool cost. This preview
  // makes no adjustment journal: the command retains PRODUCT_FULFILLMENT provenance.
  const cost = await previewOrdinaryAdjustmentCost(db, {
    tenantId: input.tenantId, currencyCode: line.order.currencyCode,
    balanceSourceId: balance.id, canonicalBefore,
    canonicalQuantity: reservation.canonicalQuantity.toFixed(), direction: "decrease", effectiveAt: new Date(),
  })
  return {
    orderId: line.order.id, orderNumber: line.order.orderNumber, orderLineId: line.id,
    productName: snapshot.catalogItemName, offeringName: snapshot.offeringName, quantity: line.quantity.toFixed(),
    quantityScope: "full_saved_line" as const, scheduledFor: line.order.deliveryDueAt,
    stock: {
      balanceSourceId: balance.id, unitName: balance.inventoryUnit.name,
      onHandBefore: balance.onHandQuantity.toFixed(), onHandAfter: impact.resultingOnHand,
      reservedBefore: balance.reservedQuantity.toFixed(), reservedAfter: impact.resultingReserved,
      canonicalQuantity: reservation.canonicalQuantity.toFixed(),
    },
    cost,
    revision: createHash("sha256").update(JSON.stringify({
      tenantId: input.tenantId, storeId: input.storeId, line, cost,
    })).digest("hex"),
  }
}
