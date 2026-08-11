import { describe, expect, test } from "bun:test"

import {
  serviceCommerceCatalogGraduationFormSchema,
  serviceCommerceCatalogGraduationReadinessSchema,
  serviceCommerceCatalogPublicationFormSchema,
} from "./service-commerce-catalog"

describe("Service Commerce Catalog graduation API schemas", () => {
  test("requires explicit Product stock identity, opening count and confirmation", () => {
    const base = {
      canonicalUnitName: "Bag",
      category: "Bags",
      clientOperationId: "graduate-1",
      confirmed: true,
      currencyCode: "ngn",
      draftKind: "product",
      expectedOfferingRevision: 0,
      fixedPriceMinor: 2_000_000,
      openingStockQuantity: "4",
      offeringId: "offering-1",
      reason: "Verified opening stock",
      sku: "BAG-RED-S",
      storeId: "store-1",
      transactionScale: 0,
      variantName: "Red small",
    }
    expect(
      serviceCommerceCatalogGraduationFormSchema.parse(base),
    ).toMatchObject({ currencyCode: "NGN" })
    expect(
      serviceCommerceCatalogGraduationFormSchema.safeParse({
        ...base,
        confirmed: false,
      }).success,
    ).toBe(false)
    expect(
      serviceCommerceCatalogGraduationFormSchema.safeParse({ ...base, sku: "" })
        .success,
    ).toBe(false)
  })

  test("keeps readiness and publication inputs narrow and strict", () => {
    expect(
      serviceCommerceCatalogGraduationReadinessSchema.parse({
        offeringId: "offering-1",
      }),
    ).toEqual({ offeringId: "offering-1" })
    expect(
      serviceCommerceCatalogPublicationFormSchema.safeParse({
        clientOperationId: "publish-1",
        confirmed: true,
        expectedOfferingRevision: 1,
        offeringId: "offering-1",
        reason: "Publish verified offering",
        unexpected: true,
      }).success,
    ).toBe(false)
  })
})
