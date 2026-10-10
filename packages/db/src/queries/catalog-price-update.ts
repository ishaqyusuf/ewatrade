import type { Prisma } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"

export type CatalogPriceUpdateInput = {
  tenantId: string
  offeringId: string
  expectedRevision: number
  priceMinor: number
  actorUserId: string
  reason: string
}

/** Caller authorizes Catalog management and owns the surrounding transaction. */
export async function updateCatalogPriceInTransaction(
  tx: Prisma.TransactionClient,
  input: CatalogPriceUpdateInput,
) {
  if (
    !Number.isSafeInteger(input.priceMinor) ||
    input.priceMinor < 0 ||
    input.priceMinor > 100_000_000 ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    !input.reason.trim() ||
    input.reason.trim().length > 500
  )
    throw new CatalogError(
      "INVALID_OFFERING",
      "Enter a valid price and reason.",
    )

  const offering = await tx.sellableOffering.findFirst({
    where: {
      id: input.offeringId,
      tenantId: input.tenantId,
      kind: "PRODUCT_UNIT",
      status: "ACTIVE",
      pricingPolicy: "FIXED",
      catalogItem: { kind: "PRODUCT", status: "ACTIVE" },
      variant: { status: "ACTIVE" },
    },
    select: {
      id: true,
      catalogItemId: true,
      name: true,
      revision: true,
      fixedPriceMinor: true,
      currencyCode: true,
    },
  })
  if (!offering || offering.fixedPriceMinor === null)
    throw new CatalogError(
      "CATALOG_OFFERING_NOT_FOUND",
      "Choose an active product offering with a fixed price.",
    )
  if (offering.revision !== input.expectedRevision)
    throw new CatalogError(
      "REVISION_CONFLICT",
      "This offering changed. Review its current price before saving.",
    )
  if (offering.fixedPriceMinor === input.priceMinor)
    throw new CatalogError("INVALID_OFFERING", "This price is already saved.")

  // The conditional write also fences a change after the read. Historical
  // order snapshots and other units/variants are deliberately never rewritten.
  const updated = await tx.sellableOffering.updateMany({
    where: {
      id: offering.id,
      tenantId: input.tenantId,
      revision: input.expectedRevision,
      fixedPriceMinor: offering.fixedPriceMinor,
      status: "ACTIVE",
      pricingPolicy: "FIXED",
      catalogItem: { kind: "PRODUCT", status: "ACTIVE" },
      variant: { status: "ACTIVE" },
    },
    data: { fixedPriceMinor: input.priceMinor, revision: { increment: 1 } },
  })
  if (updated.count !== 1)
    throw new CatalogError(
      "REVISION_CONFLICT",
      "This offering changed. Review its current price before saving.",
    )
  const change = await tx.catalogPriceChange.create({
    data: {
      tenantId: input.tenantId,
      offeringId: offering.id,
      previousPriceMinor: offering.fixedPriceMinor,
      priceMinor: input.priceMinor,
      currencyCode: offering.currencyCode,
      changedByUserId: input.actorUserId,
      reason: input.reason.trim(),
    },
    select: { id: true },
  })
  return {
    offeringId: offering.id,
    catalogItemId: offering.catalogItemId,
    previousPriceMinor: offering.fixedPriceMinor,
    priceMinor: input.priceMinor,
    currencyCode: offering.currencyCode,
    revision: offering.revision + 1,
    priceChangeId: change.id,
  }
}
