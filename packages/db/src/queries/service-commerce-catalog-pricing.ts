import {
  type ServiceCommerceCatalogPriceEvidence,
  selectCatalogPriceSuggestion,
} from "@ewatrade/service-commerce"

import {
  CatalogRecordStatus,
  CommerceQuoteVersionStatus,
  OrderStatus,
  SellableOfferingKind,
} from "../../generated/prisma/enums"
import { assertProgressiveCatalogGate } from "./service-commerce-catalog"
import {
  ServiceCommerceCatalogError,
  resolveServiceCommerceCatalogSourceLine,
} from "./service-commerce-catalog-source"
import type { DbClient } from "./types"

export async function getServiceCommerceCatalogPriceSuggestions(
  db: DbClient,
  input: {
    actorUserId: string
    includeTenantHistory: boolean
    offeringId: string
    source: {
      id: string
      kind: "commerce_inquiry" | "prescription" | "service"
    }
    sourceLineId: string
    storeId: string
    tenantId: string
  },
) {
  const sourceLine = await resolveServiceCommerceCatalogSourceLine(db, {
    ...input,
    operation: "read",
  })
  await assertProgressiveCatalogGate(db, {
    ...input,
    policySubject: "progressive_catalog",
    vertical: sourceLine.vertical,
  })
  const [offering, store] = await Promise.all([
    db.sellableOffering.findFirst({
      include: {
        catalogSourceLineLinks: {
          where: {
            sourceId: input.source.id,
            sourceLineId: input.sourceLineId,
            storeId: input.storeId,
          },
        },
        priceChanges: { orderBy: { effectiveAt: "desc" }, take: 1 },
        storeAvailability: { where: { storeId: input.storeId } },
      },
      where: {
        id: input.offeringId,
        kind:
          sourceLine.kind === "product"
            ? SellableOfferingKind.PRODUCT_UNIT
            : SellableOfferingKind.SERVICE,
        status: { in: [CatalogRecordStatus.ACTIVE, CatalogRecordStatus.DRAFT] },
        tenantId: input.tenantId,
      },
    }),
    db.store.findFirst({
      select: { currencyCode: true },
      where: { id: input.storeId, tenantId: input.tenantId },
    }),
  ])
  if (!offering || !store) {
    throw new ServiceCommerceCatalogError(
      "NOT_FOUND",
      "Catalog Offering or Store not found.",
    )
  }
  if (
    (offering.status === CatalogRecordStatus.DRAFT &&
      offering.catalogSourceLineLinks.length === 0) ||
    (offering.status === CatalogRecordStatus.ACTIVE &&
      !offering.storeAvailability.some((item) => item.isAvailable))
  ) {
    throw new ServiceCommerceCatalogError(
      "NOT_READY",
      "Catalog Offering is not eligible for this Store and source line.",
    )
  }
  if (offering.currencyCode !== store.currencyCode) {
    throw new ServiceCommerceCatalogError(
      "CONFLICT",
      "The Offering currency does not match this Store.",
    )
  }

  const [quoteLines, saleLines] = await Promise.all([
    db.commerceQuoteLine.findMany({
      include: {
        quoteVersion: { include: { quote: { select: { storeId: true } } } },
      },
      orderBy: { quoteVersion: { acceptedAt: "desc" } },
      take: input.includeTenantHistory ? 20 : 10,
      where: {
        offeringId: offering.id,
        quoteVersion: {
          acceptedAt: { not: null },
          currencyCode: store.currencyCode,
          quote: {
            storeId: input.includeTenantHistory ? undefined : input.storeId,
            tenantId: input.tenantId,
          },
          status: CommerceQuoteVersionStatus.ACCEPTED,
        },
        unitPriceMinor: { not: null },
      },
    }),
    db.commercialOrderLine.findMany({
      include: { order: { select: { storeId: true, updatedAt: true } } },
      orderBy: { order: { updatedAt: "desc" } },
      take: input.includeTenantHistory ? 20 : 10,
      where: {
        offeringId: offering.id,
        order: {
          currencyCode: store.currencyCode,
          status: OrderStatus.COMPLETED,
          storeId: input.includeTenantHistory ? undefined : input.storeId,
          tenantId: input.tenantId,
        },
      },
    }),
  ])

  const evidence: ServiceCommerceCatalogPriceEvidence[] = []
  if (offering.fixedPriceMinor !== null) {
    evidence.push({
      currencyCode: offering.currencyCode,
      effectiveAt: offering.priceChanges[0]?.effectiveAt ?? offering.updatedAt,
      evidenceId: offering.id,
      offeringId: offering.id,
      priceMinor: offering.fixedPriceMinor,
      scope: "offering",
      source: "current_offering",
      storeId: null,
      tenantId: input.tenantId,
    })
  }
  for (const line of quoteLines) {
    if (line.unitPriceMinor === null || !line.quoteVersion.acceptedAt) continue
    const currentStore = line.quoteVersion.quote.storeId === input.storeId
    evidence.push(
      currentStore
        ? {
            currencyCode: line.quoteVersion.currencyCode,
            effectiveAt: line.quoteVersion.acceptedAt,
            evidenceId: line.id,
            offeringId: offering.id,
            priceMinor: line.unitPriceMinor,
            scope: "store",
            source: "accepted_quote",
            storeId: input.storeId,
            tenantId: input.tenantId,
          }
        : {
            authorizedTenantHistory: input.includeTenantHistory,
            currencyCode: line.quoteVersion.currencyCode,
            effectiveAt: line.quoteVersion.acceptedAt,
            evidenceId: line.id,
            offeringId: offering.id,
            priceMinor: line.unitPriceMinor,
            scope: "tenant",
            source: "accepted_quote",
            storeId: line.quoteVersion.quote.storeId,
            tenantId: input.tenantId,
          },
    )
  }
  for (const line of saleLines) {
    const currentStore = line.order.storeId === input.storeId
    evidence.push(
      currentStore
        ? {
            currencyCode: store.currencyCode,
            effectiveAt: line.order.updatedAt,
            evidenceId: line.id,
            offeringId: offering.id,
            priceMinor: line.unitPriceMinor,
            scope: "store",
            source: "completed_sale",
            storeId: input.storeId,
            tenantId: input.tenantId,
          }
        : {
            authorizedTenantHistory: input.includeTenantHistory,
            currencyCode: store.currencyCode,
            effectiveAt: line.order.updatedAt,
            evidenceId: line.id,
            offeringId: offering.id,
            priceMinor: line.unitPriceMinor,
            scope: "tenant",
            source: "completed_sale",
            storeId: line.order.storeId,
            tenantId: input.tenantId,
          },
    )
  }

  return {
    evidence,
    sourceLine: { ...sourceLine.ref, displayLabel: sourceLine.displayLabel },
    suggestion: selectCatalogPriceSuggestion({
      currencyCode: store.currencyCode,
      evidence,
      offeringId: offering.id,
      storeId: input.storeId,
      tenantId: input.tenantId,
    }),
  }
}
