import {
  addExactDecimals,
  compareExactDecimals,
  multiplyExactDecimals,
  parseExactDecimal,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import type { Prisma } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import { getConfiguredCatalogOfferingAvailability } from "./catalog-inventory"
import { orderAmendmentDigest } from "./commercial-order-amendment-evidence"
import { getCommercialOrderAmendmentEligibility } from "./commercial-order-amendment-review"
import { buildCommercialOrderCancellationPreview } from "./commercial-order-cancellation"
import {
  type OrderReplacementChanges,
  buildOrderReplacementTerms,
} from "./commercial-order-replacement-terms"

/** Read-only impact preview. A caller must authorize and confirmation must repeat under locks. */
export async function readCommercialOrderReplacementReview(
  db: Prisma.TransactionClient,
  input: {
    tenantId: string
    storeId: string
    orderId: string
    changes: OrderReplacementChanges
  },
) {
  const review = await getCommercialOrderAmendmentEligibility(db, input)
  const cancellation = buildCommercialOrderCancellationPreview(review, input)
  const terms = buildOrderReplacementTerms(review.source, input.changes)
  const balances = new Map<
    string,
    {
      balanceSourceId: string
      unitName: string
      revision: number
      availableBeforeRelease: string
      releaseQuantity: string
      replacementQuantity: string
    }
  >()
  const offerings = []
  for (const line of terms.lines) {
    const source = review.source.lines.find(
      (row) => row.id === line.orderLineId,
    )
    if (!source?.snapshot)
      throw new CatalogError("INVALID_ORDER", "Original snapshot unavailable.")
    const offering = await db.sellableOffering.findFirst({
      where: {
        id: line.offeringId,
        tenantId: input.tenantId,
        status: "ACTIVE",
        storeAvailability: {
          some: { storeId: input.storeId, isAvailable: true },
        },
      },
      include: {
        productUnitOffering: { include: { inventoryUnit: true } },
        serviceOffering: true,
      },
    })
    if (
      !offering ||
      offering.kind !== source.kind ||
      offering.currencyCode !== review.source.currencyCode ||
      source.snapshot.currencyCode !== review.source.currencyCode ||
      offering.pricingPolicy !== source.snapshot.pricingPolicy
    )
      throw new CatalogError(
        "INVALID_ORDER",
        "An original offering changed or is unavailable. Review a new sale instead.",
      )
    offerings.push(offering)
    if (offering.kind === "SERVICE") {
      if (offering.serviceOffering?.workPolicy !== "CHARGE_ONLY")
        throw new CatalogError(
          "INVALID_ORDER",
          "Tracked service replacement requires its service-work correction workflow.",
        )
      if (
        offering.serviceOffering.authorizationPolicy !==
        source.snapshot.serviceAuthorizationPolicy
      )
        throw new CatalogError(
          "INVALID_ORDER",
          "Service authorization policy changed. Review its service workflow.",
        )
      parseExactDecimal(line.quantity, {
        allowZero: false,
        maxScale: offering.serviceOffering.quantityScale,
      })
      continue
    }
    const unit = offering.productUnitOffering?.inventoryUnit
    if (
      !unit ||
      unit.id !== source.snapshot.inventoryUnitId ||
      unit.configurationVersionId !== source.snapshot.configurationVersionId ||
      unit.factor.toString() !== source.snapshot.unitFactor?.toString() ||
      unit.stockBehavior !== source.snapshot.stockBehavior ||
      unit.transactionScale !== source.snapshot.transactionScale
    )
      throw new CatalogError(
        "STALE_CONFIGURATION",
        "Original unit meaning changed. Review a new sale instead.",
      )
    const availability = await getConfiguredCatalogOfferingAvailability(db, {
      tenantId: input.tenantId,
      storeId: input.storeId,
      offeringId: line.offeringId,
    })
    if (availability.configurationVersionId !== unit.configurationVersionId)
      throw new CatalogError(
        "STALE_CONFIGURATION",
        "Current unit configuration changed.",
      )
    const quantity =
      unit.stockBehavior === "PACKAGED_STOCK"
        ? line.quantity
        : multiplyExactDecimals(line.quantity, unit.factor.toString(), 18)
    const originalBalance = review.source.lines.find(
      (row) =>
        row.stockReservation?.balanceSourceId === availability.balanceSourceId,
    )?.stockReservation?.balanceSource
    if (originalBalance && originalBalance.revision !== availability.revision)
      throw new CatalogError(
        "REVISION_CONFLICT",
        "Stock changed during replacement review.",
      )
    const existing = balances.get(availability.balanceSourceId)
    if (
      existing &&
      (existing.revision !== availability.revision ||
        existing.availableBeforeRelease !==
          availability.availableBalanceQuantity)
    )
      throw new CatalogError(
        "REVISION_CONFLICT",
        "Stock changed during replacement review.",
      )
    balances.set(availability.balanceSourceId, {
      balanceSourceId: availability.balanceSourceId,
      unitName: availability.balanceUnitName,
      revision: availability.revision,
      availableBeforeRelease: availability.availableBalanceQuantity,
      releaseQuantity: "0",
      replacementQuantity: addExactDecimals(
        existing?.replacementQuantity ?? "0",
        quantity,
      ),
    })
  }
  for (const release of cancellation.releases) {
    let balance = balances.get(release.balanceSourceId)
    if (!balance) {
      const original = review.source.lines.find(
        (row) =>
          row.stockReservation?.balanceSourceId === release.balanceSourceId,
      )?.stockReservation?.balanceSource
      if (!original)
        throw new CatalogError(
          "INVALID_ORDER",
          "Original reservation balance unavailable.",
        )
      balance = {
        balanceSourceId: original.id,
        unitName: original.inventoryUnit?.name ?? "stock units",
        revision: original.revision,
        availableBeforeRelease: subtractExactDecimals(
          original.onHandQuantity.toString(),
          original.reservedQuantity.toString(),
        ),
        releaseQuantity: "0",
        replacementQuantity: "0",
      }
      balances.set(original.id, balance)
    }
    balance.releaseQuantity = addExactDecimals(
      balance.releaseQuantity,
      release.quantity,
    )
  }
  const reservationChanges = [...balances.values()]
    .sort((a, b) => a.balanceSourceId.localeCompare(b.balanceSourceId))
    .map((balance) => {
      const availableAfterRelease = addExactDecimals(
        balance.availableBeforeRelease,
        balance.releaseQuantity,
      )
      return {
        ...balance,
        availableAfterRelease,
        reservationChange: subtractExactDecimals(
          balance.replacementQuantity,
          balance.releaseQuantity,
        ),
        sufficient:
          compareExactDecimals(
            availableAfterRelease,
            balance.replacementQuantity,
          ) >= 0,
      }
    })
  return {
    originalSnapshots: review.source.lines.flatMap((line) =>
      line.snapshot ? [line.snapshot] : [],
    ),
    preview: {
      orderId: review.orderId,
      orderNumber: review.orderNumber,
      eligible:
        review.eligibility.eligibleForOrdinaryAmendment &&
        reservationChanges.every((row) => row.sufficient),
      blockers: [
        ...review.eligibility.blockers,
        ...reservationChanges
          .filter((row) => !row.sufficient)
          .map((row) => ({
            code: "INSUFFICIENT_STOCK",
            reason: `Balance ${row.balanceSourceId} cannot cover the replacement after releasing this order's reservations.`,
            requiredWorkflow: "stock_availability",
          })),
      ],
      terms,
      reservationChanges,
      beforeSnapshot: cancellation.beforeSnapshot,
      releasedReservations: cancellation.releases,
      stockOnHandChange: "0" as const,
      moneyMovementMinor: 0 as const,
      reviewDigest: orderAmendmentDigest({
        source: review.source,
        cancellationDigest: cancellation.reviewDigest,
        terms,
        reservationChanges,
        offerings,
      }),
    },
  }
}

/** Public impact projection; retained raw snapshots stay inside canonical composition. */
export async function previewCommercialOrderReplacement(
  db: Prisma.TransactionClient,
  input: Parameters<typeof readCommercialOrderReplacementReview>[1],
) {
  return (await readCommercialOrderReplacementReview(db, input)).preview
}
