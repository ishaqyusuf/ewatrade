import { describe, expect, test } from "bun:test"

import {
  SERVICE_COMMERCE_CATALOG_AVAILABILITY_OUTCOMES,
  SERVICE_COMMERCE_CATALOG_DRAFT_KINDS,
  SERVICE_COMMERCE_CATALOG_PRICE_SUGGESTION_SOURCES,
  deriveCatalogGraduationReadiness,
  getCatalogPricePromotionConfirmationImpact,
  selectCatalogPriceSuggestion,
  serviceCommerceCatalogAdoptionGateSchema,
  serviceCommerceCatalogAvailabilityAttestationSchema,
  serviceCommerceCatalogGraduationFormSchema,
  serviceCommerceCatalogPricePromotionFormSchema,
  serviceCommerceCatalogSourceLineRefSchema,
  serviceCommerceCreateCatalogDraftInputSchema,
  serviceCommerceLinkCatalogOfferingInputSchema,
  serviceCommercePromoteCatalogPriceInputSchema,
  validateCatalogAvailabilityAttestation,
} from "."

const sourceLine = {
  evidence: {
    kind: "human_verified" as const,
    verifiedAt: new Date("2026-08-10T10:00:00.000Z"),
    verifiedByUserId: "user-1",
  },
  fingerprint: "a".repeat(64),
  id: "line-1",
  source: { id: "inquiry-1", kind: "commerce_inquiry" as const },
  sourceVersion: "3",
}

describe("Progressive Catalog adoption contracts", () => {
  test("reuses the Store adoption mode and policy vocabulary at the server gate", () => {
    expect(
      serviceCommerceCatalogAdoptionGateSchema.parse({
        adoptionMode: "progressive",
        policyOutcome: "allowed",
        policySubject: "progressive_draft_capture",
      }),
    ).toMatchObject({
      adoptionMode: "progressive",
      policySubject: "progressive_draft_capture",
    })
  })

  test("distinguishes source snapshots from human-verified evidence", () => {
    expect(serviceCommerceCatalogSourceLineRefSchema.parse(sourceLine)).toEqual(
      sourceLine,
    )
    expect(
      serviceCommerceCatalogSourceLineRefSchema.safeParse({
        ...sourceLine,
        fingerprint: "raw-customer-text",
      }).success,
    ).toBe(false)
    expect(
      serviceCommerceCatalogSourceLineRefSchema.safeParse({
        ...sourceLine,
        evidence: { ...sourceLine.evidence, verifiedByUserId: "" },
      }).success,
    ).toBe(false)
    expect(
      serviceCommerceCatalogSourceLineRefSchema.parse({
        ...sourceLine,
        evidence: {
          capturedAt: new Date("2026-08-10T09:00:00.000Z"),
          kind: "source_snapshot",
        },
      }).evidence.kind,
    ).toBe("source_snapshot")
  })

  test("limits drafts to the existing private Product and Service graph", () => {
    expect(SERVICE_COMMERCE_CATALOG_DRAFT_KINDS).toEqual(["product", "service"])
    expect(
      serviceCommerceCreateCatalogDraftInputSchema.parse({
        actorId: "user-1",
        draftKind: "product",
        name: "Requested item",
        sourceLine,
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).toMatchObject({ draftKind: "product", sourceLine })
    expect(
      serviceCommerceCreateCatalogDraftInputSchema.safeParse({
        actorId: "user-1",
        draftKind: "medicine",
        name: "Unverified medicine",
        sourceLine,
        storeId: "store-1",
        tenantId: "tenant-1",
      }).success,
    ).toBe(false)
  })

  test("requires a verified source line for explicit existing-Offering links", () => {
    expect(
      serviceCommerceLinkCatalogOfferingInputSchema.parse({
        actorId: "user-1",
        offeringId: "offering-1",
        sourceLine,
        storeId: "store-1",
        tenantId: "tenant-1",
        verifiedAlias: "Requested item",
      }),
    ).toMatchObject({ offeringId: "offering-1", sourceLine })
  })

  test("uses attributable Store-first price evidence and returns unknown without it", () => {
    expect(SERVICE_COMMERCE_CATALOG_PRICE_SUGGESTION_SOURCES).toEqual([
      "current_offering",
      "accepted_quote",
      "completed_sale",
      "unknown",
    ])

    const input = {
      currencyCode: "NGN",
      offeringId: "offering-1",
      storeId: "store-1",
      tenantId: "tenant-1",
    }
    const selected = selectCatalogPriceSuggestion({
      ...input,
      evidence: [
        {
          currencyCode: "NGN",
          effectiveAt: new Date("2026-08-09T12:00:00.000Z"),
          evidenceId: "quote-line-1",
          offeringId: "offering-1",
          priceMinor: 900,
          scope: "store" as const,
          source: "accepted_quote" as const,
          storeId: "store-1",
          tenantId: "tenant-1",
        },
        {
          currencyCode: "NGN",
          effectiveAt: new Date("2026-08-08T12:00:00.000Z"),
          evidenceId: "offering-1",
          offeringId: "offering-1",
          priceMinor: 800,
          scope: "offering" as const,
          source: "current_offering" as const,
          storeId: null,
          tenantId: "tenant-1",
        },
      ],
    })
    expect(selected).toMatchObject({
      priceMinor: 800,
      scope: "offering",
      source: "current_offering",
    })

    const tenantHistory = selectCatalogPriceSuggestion({
      ...input,
      evidence: [
        {
          authorizedTenantHistory: true,
          currencyCode: "NGN",
          effectiveAt: new Date("2026-08-09T12:00:00.000Z"),
          evidenceId: "sale-line-1",
          offeringId: "offering-1",
          priceMinor: 1000,
          scope: "tenant" as const,
          source: "completed_sale" as const,
          storeId: "store-2",
          tenantId: "tenant-1",
        },
      ],
    })
    expect(tenantHistory).toMatchObject({
      priceMinor: 1000,
      scope: "tenant",
      source: "completed_sale",
    })

    expect(selectCatalogPriceSuggestion({ ...input, evidence: [] })).toEqual({
      currencyCode: "NGN",
      effectiveAt: null,
      priceMinor: null,
      scope: "unknown",
      source: "unknown",
    })
  })

  test("fails closed for a cross-Tenant, mismatched-currency or unapproved tenant-history price", () => {
    const result = selectCatalogPriceSuggestion({
      currencyCode: "NGN",
      evidence: [
        {
          currencyCode: "USD",
          effectiveAt: new Date("2026-08-09T12:00:00.000Z"),
          evidenceId: "offering-1",
          offeringId: "offering-1",
          priceMinor: 10,
          scope: "offering",
          source: "current_offering",
          storeId: null,
          tenantId: "tenant-1",
        },
        {
          authorizedTenantHistory: false,
          currencyCode: "NGN",
          effectiveAt: new Date("2026-08-09T13:00:00.000Z"),
          evidenceId: "quote-line-other",
          offeringId: "offering-1",
          priceMinor: 999,
          scope: "tenant",
          source: "accepted_quote",
          storeId: "store-2",
          tenantId: "other-tenant",
        },
      ],
      offeringId: "offering-1",
      storeId: "store-1",
      tenantId: "tenant-1",
    })
    expect(result.source).toBe("unknown")
  })

  test("tracks stock separately from an expiring manual commitment and rejects stale facts", () => {
    expect(SERVICE_COMMERCE_CATALOG_AVAILABILITY_OUTCOMES).toEqual([
      "tracked_in_stock",
      "manual_procure_to_order",
      "unavailable",
    ])
    const attestation =
      serviceCommerceCatalogAvailabilityAttestationSchema.parse({
        attestedAt: new Date("2026-08-10T10:00:00.000Z"),
        availability: "manual_procure_to_order",
        expiresAt: new Date("2026-08-10T18:00:00.000Z"),
        quantity: "2",
        sourceLine,
      })
    expect(
      serviceCommerceCatalogAvailabilityAttestationSchema.safeParse({
        attestedAt: new Date("2026-08-10T10:00:00.000Z"),
        availability: "manual_procure_to_order",
        expiresAt: new Date("2026-08-10T18:00:00.000Z"),
        sourceLine,
      }).success,
    ).toBe(false)
    expect(
      validateCatalogAvailabilityAttestation({
        attestation,
        currentSourceLine: sourceLine,
        now: new Date("2026-08-10T12:00:00.000Z"),
      }),
    ).toBe("valid")
    expect(
      validateCatalogAvailabilityAttestation({
        attestation,
        currentSourceLine: { ...sourceLine, sourceVersion: "4" },
        now: new Date("2026-08-10T12:00:00.000Z"),
      }),
    ).toBe("stale_source")
    expect(
      validateCatalogAvailabilityAttestation({
        attestation,
        currentSourceLine: sourceLine,
        now: new Date("2026-08-10T18:00:00.000Z"),
      }),
    ).toBe("expired")
    expect(
      serviceCommerceCatalogAvailabilityAttestationSchema.safeParse({
        attestedAt: new Date("2026-08-10T10:00:00.000Z"),
        availability: "tracked_in_stock",
        balanceSourceId: "balance-1",
        balanceRevision: 4,
        expiresAt: new Date("2026-08-10T18:00:00.000Z"),
        sourceLine,
      }).success,
    ).toBe(false)
  })

  test("keeps quote price separate and makes reusable price promotion confirmed and impact-aware", () => {
    expect(
      serviceCommerceCatalogPricePromotionFormSchema.safeParse({
        confirmed: false,
        reason: "Use this confirmed Quote price",
      }).success,
    ).toBe(false)
    expect(
      serviceCommerceCatalogPricePromotionFormSchema.parse({
        confirmed: true,
        reason: "Use this confirmed Quote price",
      }),
    ).toEqual({
      confirmed: true,
      reason: "Use this confirmed Quote price",
    })
    expect(
      serviceCommercePromoteCatalogPriceInputSchema.safeParse({
        actorId: "manager-1",
        affectedStoreIds: ["store-1", "store-2"],
        confirmation: { confirmedAt: new Date("2026-08-10T12:00:00.000Z") },
        currencyCode: "NGN",
        newPriceMinor: 1250,
        offeringId: "offering-1",
        previousPriceMinor: 1000,
        reason: "Supplier price changed",
        sourceLine,
        tenantId: "tenant-1",
      }).success,
    ).toBe(true)
    expect(
      serviceCommercePromoteCatalogPriceInputSchema.safeParse({
        actorId: "manager-1",
        affectedStoreIds: [],
        currencyCode: "NGN",
        newPriceMinor: 1250,
        offeringId: "offering-1",
        previousPriceMinor: 1000,
        reason: "Supplier price changed",
        sourceLine,
        tenantId: "tenant-1",
      }).success,
    ).toBe(false)
    expect(
      getCatalogPricePromotionConfirmationImpact({
        boundStoreIds: ["store-2", "store-1", "store-1"],
        offeringPriceScope: "tenant",
      }),
    ).toEqual({
      affectedStoreIds: ["store-1", "store-2"],
      requiresConfirmation: true,
    })
  })

  test("projects Product and Service graduation facts without inventing stock", () => {
    expect(
      deriveCatalogGraduationReadiness({
        category: "Bags",
        currencyMatchesStore: true,
        draftKind: "product",
        fixedPriceMinor: 20_000_00,
        hasProductIdentifier: true,
        hasProductUnit: true,
        hasVerifiedOpeningCount: false,
        serviceBookingPolicy: null,
        serviceDurationMinutes: null,
        serviceWorkPolicy: null,
        variantName: "Red small",
      }),
    ).toEqual({ canGraduate: false, missingFacts: ["opening_count"] })

    expect(
      serviceCommerceCatalogGraduationFormSchema.safeParse({
        canonicalUnitName: "Bag",
        category: "Bags",
        clientOperationId: "graduate-1",
        confirmed: true,
        currencyCode: "NGN",
        draftKind: "product",
        expectedOfferingRevision: 0,
        fixedPriceMinor: 20_000_00,
        openingStockQuantity: "4",
        offeringId: "offering-1",
        reason: "Verified opening stock",
        transactionScale: 0,
        variantName: "Red small",
      }).success,
    ).toBe(false)

    const productGraduation = {
      canonicalUnitName: "Bag",
      category: "Bags",
      clientOperationId: "graduate-precision",
      confirmed: true as const,
      currencyCode: "NGN",
      draftKind: "product" as const,
      expectedOfferingRevision: 0,
      fixedPriceMinor: 20_000_00,
      openingStockQuantity: "1.5",
      offeringId: "offering-1",
      reason: "Verified opening stock",
      sku: "BAG-RED-S",
      transactionScale: 0,
      variantName: "Red small",
    }
    expect(
      serviceCommerceCatalogGraduationFormSchema.safeParse(productGraduation)
        .success,
    ).toBe(false)
    expect(
      serviceCommerceCatalogGraduationFormSchema.safeParse({
        ...productGraduation,
        transactionScale: 1,
      }).success,
    ).toBe(true)

    expect(
      deriveCatalogGraduationReadiness({
        category: "Repairs",
        currencyMatchesStore: true,
        draftKind: "service",
        fixedPriceMinor: 5_000_00,
        hasProductIdentifier: false,
        hasProductUnit: false,
        hasVerifiedOpeningCount: false,
        serviceBookingPolicy: "request_required",
        serviceDurationMinutes: 60,
        serviceWorkPolicy: "tracked",
        variantName: "Standard repair",
      }).canGraduate,
    ).toBe(true)
  })
})
