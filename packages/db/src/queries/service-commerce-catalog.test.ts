import { describe, expect, test } from "bun:test"

import type { CatalogError } from "./catalog"
import { getConfiguredCatalogOfferingAvailability } from "./catalog-inventory"
import {
  attestServiceCommerceCatalogAvailability,
  createServiceCommerceCatalogDraft,
  getServiceCommerceCatalogPricePromotionImpact,
  linkServiceCommerceCatalogOffering,
  listServiceCommerceCatalogMatches,
  promoteServiceCommerceCatalogPrice,
  resolveCatalogAvailabilityAttestationForQuote,
} from "./service-commerce-catalog"
import { getServiceCommerceCatalogPriceSuggestions } from "./service-commerce-catalog-pricing"
import {
  type ServiceCommerceCatalogError,
  resolveServiceCommerceCatalogSourceLine,
} from "./service-commerce-catalog-source"

const scope = {
  actorUserId: "user-1",
  source: { id: "inquiry-1", kind: "commerce_inquiry" as const },
  sourceLineId: "line-1",
  storeId: "store-1",
  tenantId: "tenant-1",
}

const now = new Date("2026-08-10T12:00:00.000Z")
const past = new Date("2026-08-09T12:00:00.000Z")
const future = new Date("2026-08-11T12:00:00.000Z")

function allowedPolicyDecision(subject: string) {
  return {
    approvalReference: "fixture-only-approval",
    channel: "STAFF",
    effectiveAt: past,
    evidenceReference: "fixture-only-evidence",
    expiresAt: future,
    id: `policy-${subject}`,
    jurisdictionCode: "NG",
    outcome: "ALLOWED",
    revision: 1,
    revokedAt: null,
    subject: subject.toUpperCase(),
    vertical: "SERVICE",
  }
}

function inquiryLine(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: now,
    description: "Requested product",
    id: "line-1",
    inquiry: { status: "RECEIVED", updatedAt: now },
    position: 1,
    requestedQuantity: { toString: () => "1" },
    storeId: "store-1",
    tenantId: "tenant-1",
    ...overrides,
  }
}

function progressiveProfile() {
  return {
    catalogAdoptionMode: "PROGRESSIVE",
    procureToOrderEnabled: true,
    progressiveCatalogEnabled: true,
    status: "ACTIVE",
  }
}

function policyFakes(subject: string) {
  return {
    serviceCommercePolicyAuditEvent: { createMany: async () => ({ count: 1 }) },
    serviceCommercePolicyDecision: {
      findMany: async () => [allowedPolicyDecision(subject)],
    },
  }
}

function transactionDb(tx: Record<string, unknown>) {
  return {
    $transaction: async (
      operation: (client: Record<string, unknown>) => Promise<unknown>,
      options?: unknown,
    ) => {
      ;(tx as { transactionOptions?: unknown }).transactionOptions = options
      return operation(tx)
    },
  }
}

describe("Service Commerce Catalog source resolution", () => {
  test("uses Tenant and Store predicates for inquiry lines and fails closed across scopes", async () => {
    let where: unknown
    const db = {
      commerceInquiryLine: {
        findFirst: async (input: { where: unknown }) => {
          where = input.where
          return null
        },
      },
    }

    await expect(
      resolveServiceCommerceCatalogSourceLine(db as never, {
        ...scope,
        operation: "read",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })

    expect(where).toEqual({
      id: "line-1",
      inquiryId: "inquiry-1",
      storeId: "store-1",
      tenantId: "tenant-1",
    })
  })

  test("requires a current human-verified Prescription transcription, never OCR alone", async () => {
    const base = {
      actorUserId: "pharmacist-1",
      operation: "read" as const,
      source: { id: "prescription-1", kind: "prescription" as const },
      sourceLineId: "prescription-line-1",
      storeId: "store-1",
      tenantId: "tenant-1",
    }
    const db = {
      prescriptionStoreRole: { findFirst: async () => ({ id: "role-1" }) },
      prescriptionStoreSettings: {
        findFirst: async () => ({ id: "settings-1" }),
      },
      prescriptionTranscriptionLine: {
        findFirst: async () => ({
          id: "prescription-line-1",
          lineNumber: 1,
          mapping: null,
          status: "VERIFIED",
          transcription: {
            mediaRevision: 3,
            request: {
              currentMediaRevision: 4,
              currentTranscriptRevision: 2,
              status: "READY_TO_QUOTE",
              storeId: "store-1",
              tenantId: "tenant-1",
              updatedAt: now,
            },
            revision: 2,
          },
          updatedAt: now,
          verifiedAt: now,
          verifiedByUserId: "pharmacist-1",
          verifiedText: "Amoxicillin",
        }),
      },
    }

    await expect(
      resolveServiceCommerceCatalogSourceLine(db as never, base),
    ).rejects.toMatchObject({ code: "NOT_READY" })
  })

  test("keeps raw request wording as a source snapshot and changes its fingerprint only when content changes", async () => {
    const db = {
      commerceInquiryLine: {
        findFirst: async () => inquiryLine(),
      },
    }
    const first = await resolveServiceCommerceCatalogSourceLine(db as never, {
      ...scope,
      operation: "read",
    })
    const lifecycleOnly = await resolveServiceCommerceCatalogSourceLine(
      {
        commerceInquiryLine: {
          findFirst: async () =>
            inquiryLine({ inquiry: { status: "QUOTED", updatedAt: future } }),
        },
      } as never,
      { ...scope, operation: "read" },
    )
    const changed = await resolveServiceCommerceCatalogSourceLine(
      {
        commerceInquiryLine: {
          findFirst: async () =>
            inquiryLine({ description: "Changed request" }),
        },
      } as never,
      { ...scope, operation: "read" },
    )

    expect(first.ref.evidence.kind).toBe("source_snapshot")
    expect(lifecycleOnly.ref.fingerprint).toBe(first.ref.fingerprint)
    expect(changed.ref.fingerprint).not.toBe(first.ref.fingerprint)
  })

  test("resolves Generic Service and human-verified Pharmacy lines through the same typed seam", async () => {
    const service = await resolveServiceCommerceCatalogSourceLine(
      {
        serviceRequestLine: {
          findFirst: async () => ({
            createdAt: now,
            details: "Two-hour installation",
            id: "service-line-1",
            offering: { kind: "SERVICE" },
            offeringId: "service-offering-1",
            offeringName: "Installation",
            request: { status: "SUBMITTED", updatedAt: now },
            requestedQuantity: { toString: () => "2" },
            variantName: "Standard",
          }),
        },
      } as never,
      {
        actorUserId: "user-1",
        operation: "read",
        source: { id: "service-request-1", kind: "service" },
        sourceLineId: "service-line-1",
        storeId: "store-1",
        tenantId: "tenant-1",
      },
    )
    const prescription = await resolveServiceCommerceCatalogSourceLine(
      {
        prescriptionStoreRole: { findFirst: async () => ({ id: "role-1" }) },
        prescriptionStoreSettings: {
          findFirst: async () => ({ id: "settings-1" }),
        },
        prescriptionTranscriptionLine: {
          findFirst: async () => ({
            id: "prescription-line-1",
            lineNumber: 1,
            mapping: { updatedAt: now },
            status: "VERIFIED",
            transcription: {
              mediaRevision: 3,
              request: {
                currentMediaRevision: 3,
                currentTranscriptRevision: 2,
                status: "READY_TO_QUOTE",
                storeId: "store-1",
                tenantId: "tenant-1",
                updatedAt: future,
              },
              revision: 2,
            },
            updatedAt: now,
            verifiedAt: now,
            verifiedByUserId: "pharmacist-1",
            verifiedText: "Human verified medicine line",
          }),
        },
      } as never,
      {
        actorUserId: "pharmacist-1",
        operation: "read",
        source: { id: "prescription-1", kind: "prescription" },
        sourceLineId: "prescription-line-1",
        storeId: "store-1",
        tenantId: "tenant-1",
      },
    )

    expect(service).toMatchObject({ kind: "service", vertical: "service" })
    expect(prescription).toMatchObject({
      displayLabel: "Human verified medicine line",
      kind: "product",
      vertical: "pharmacy",
    })
  })
})

describe("Service Commerce Progressive Catalog repositories", () => {
  test("keeps duplicate verified aliases as separate operator choices instead of auto-merging them", async () => {
    const db = {
      ...policyFakes("progressive_catalog"),
      commerceInquiryLine: { findFirst: async () => inquiryLine() },
      sellableOffering: {
        findMany: async () =>
          ["offering-1", "offering-2"].map((id) => ({
            catalogVerifiedAliases: [
              {
                displayAlias: "Requested product",
                normalizedAlias: "requested product",
              },
            ],
            catalogItem: { id: `item-${id}`, name: "Requested product" },
            catalogItemId: `item-${id}`,
            currencyCode: "NGN",
            fixedPriceMinor: null,
            id,
            kind: "PRODUCT_UNIT",
            name: "Requested product",
            status: "DRAFT",
            storeAvailability: [],
            variant: { id: `variant-${id}`, name: "Default" },
            variantId: `variant-${id}`,
          })),
      },
      serviceCommerceStoreProfile: {
        findFirst: async () => progressiveProfile(),
      },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
    }

    const result = await listServiceCommerceCatalogMatches(db as never, scope)

    expect(result.matches.map((match) => match.offeringId)).toEqual([
      "offering-1",
      "offering-2",
    ])
  })

  test("creates only the private draft graph and does not invent Store availability, units, or stock", async () => {
    const calls: string[] = []
    const tx = {
      ...policyFakes("progressive_draft_capture"),
      catalogItem: {
        create: async ({ data }: { data: unknown }) => {
          calls.push("catalogItem.create")
          return { id: "item-1", ...(data as object) }
        },
        findUnique: async () => null,
      },
      catalogProduct: {
        create: async () => calls.push("catalogProduct.create"),
      },
      catalogSourceLineLink: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          id: "link-1",
          ...data,
        }),
        findUnique: async () => null,
      },
      catalogVerifiedAlias: {
        upsert: async () => calls.push("catalogVerifiedAlias.upsert"),
      },
      commerceInquiryLine: { findFirst: async () => inquiryLine() },
      sellableOffering: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          calls.push("sellableOffering.create")
          return { id: "offering-1", ...data }
        },
      },
      sellableVariant: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          calls.push("sellableVariant.create")
          return { id: "variant-1", ...data }
        },
      },
      serviceCommerceStoreProfile: {
        findFirst: async () => progressiveProfile(),
      },
      store: {
        findFirst: async () => ({ countryCode: "NG", currencyCode: "NGN" }),
      },
    }

    const result = await createServiceCommerceCatalogDraft(
      transactionDb(tx) as never,
      {
        ...scope,
        clientOperationId: "draft-1",
        draftKind: "product",
        expectedSourceFingerprint: (
          await resolveServiceCommerceCatalogSourceLine(tx as never, {
            ...scope,
            operation: "read",
          })
        ).ref.fingerprint,
        name: "Requested product",
        verifiedAlias: "Requested product",
      },
    )

    expect(result.offering.status).toBe("DRAFT")
    expect(calls).toEqual([
      "catalogItem.create",
      "catalogProduct.create",
      "sellableVariant.create",
      "sellableOffering.create",
      "catalogVerifiedAlias.upsert",
    ])
    expect(tx).not.toHaveProperty("storeOfferingAvailability")
    expect(tx).not.toHaveProperty("stockBalanceSource")
    expect(tx).not.toHaveProperty("inventoryUnit")
    expect((tx as { transactionOptions?: unknown }).transactionOptions).toEqual(
      {
        maxWait: 10_000,
        timeout: 30_000,
      },
    )
  })

  test("rejects a reused draft command identity when its input changes", async () => {
    const tx = {
      ...policyFakes("progressive_draft_capture"),
      catalogSourceLineLink: {
        findUnique: async () => ({
          id: "prior-link",
          offering: { id: "offering-1" },
          payloadHash: "different-payload",
        }),
      },
      commerceInquiryLine: { findFirst: async () => inquiryLine() },
      serviceCommerceStoreProfile: {
        findFirst: async () => progressiveProfile(),
      },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
    }
    const expectedSourceFingerprint = (
      await resolveServiceCommerceCatalogSourceLine(tx as never, {
        ...scope,
        operation: "read",
      })
    ).ref.fingerprint

    await expect(
      createServiceCommerceCatalogDraft(transactionDb(tx) as never, {
        ...scope,
        clientOperationId: "draft-1",
        draftKind: "product",
        expectedSourceFingerprint,
        name: "Changed product name",
        verifiedAlias: "Requested product",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
  })

  test("does not auto-merge a verified alias and rejects a reused command identity with different input", async () => {
    const tx = {
      ...policyFakes("progressive_catalog"),
      catalogSourceLineLink: {
        findUnique: async ({ where }: { where: Record<string, unknown> }) => {
          if ("tenantId_clientOperationId" in where) {
            return { id: "prior-link", payloadHash: "different-payload" }
          }
          return null
        },
      },
      commerceInquiryLine: { findFirst: async () => inquiryLine() },
      sellableOffering: {
        findFirst: async () => ({
          id: "offering-1",
          status: "DRAFT",
          storeAvailability: [],
        }),
      },
      serviceCommerceStoreProfile: {
        findFirst: async () => progressiveProfile(),
      },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
    }
    const fingerprint = (
      await resolveServiceCommerceCatalogSourceLine(tx as never, {
        ...scope,
        operation: "read",
      })
    ).ref.fingerprint

    await expect(
      linkServiceCommerceCatalogOffering(transactionDb(tx) as never, {
        ...scope,
        clientOperationId: "link-1",
        expectedSourceFingerprint: fingerprint,
        offeringId: "offering-1",
        verifiedAlias: "Requested product",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
  })

  test("rejects expired manual procure-to-order commitments before a write", async () => {
    let created = false
    const fingerprint = "current-source-fingerprint"
    const tx = {
      ...policyFakes("procure_to_order"),
      catalogAvailabilityAttestation: {
        create: async () => {
          created = true
        },
        findUnique: async () => null,
        updateMany: async () => ({ count: 0 }),
      },
      catalogSourceLineLink: {
        findUnique: async () => ({
          id: "link-1",
          offeringId: "offering-1",
          sourceVersionFingerprint: fingerprint,
        }),
      },
      commerceInquiryLine: { findFirst: async () => inquiryLine() },
      serviceCommerceStoreProfile: {
        findFirst: async () => progressiveProfile(),
      },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
    }
    const source = await resolveServiceCommerceCatalogSourceLine(tx as never, {
      ...scope,
      operation: "read",
    })
    tx.catalogSourceLineLink.findUnique = async () => ({
      id: "link-1",
      offeringId: "offering-1",
      sourceVersionFingerprint: source.ref.fingerprint,
    })

    await expect(
      attestServiceCommerceCatalogAvailability(transactionDb(tx) as never, {
        ...scope,
        availability: "manual_procure_to_order",
        clientOperationId: "availability-1",
        expectedSourceFingerprint: source.ref.fingerprint,
        expiresAt: past,
        reason: "Supplier confirmed",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" })
    expect(created).toBe(false)
  })

  test("keeps private Product drafts manual until explicit inventory graduation", async () => {
    let link: Record<string, unknown> | null = null
    const tx = {
      ...policyFakes("progressive_catalog"),
      catalogSourceLineLink: { findUnique: async () => link },
      commerceInquiryLine: { findFirst: async () => inquiryLine() },
      serviceCommerceStoreProfile: {
        findFirst: async () => progressiveProfile(),
      },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
    }
    const source = await resolveServiceCommerceCatalogSourceLine(tx as never, {
      ...scope,
      operation: "read",
    })
    link = {
      id: "link-1",
      offering: { status: "DRAFT" },
      offeringId: "offering-1",
      sourceVersionFingerprint: source.ref.fingerprint,
    }

    await expect(
      attestServiceCommerceCatalogAvailability(transactionDb(tx) as never, {
        ...scope,
        availability: "tracked_in_stock",
        clientOperationId: "tracked-draft-1",
        expectedSourceFingerprint: source.ref.fingerprint,
        quantity: "1",
        reason: "Attempt to claim tracked stock before graduation",
      }),
    ).rejects.toMatchObject({ code: "NOT_READY" })
  })

  test("requires a configured existing balance for tracked availability and never upserts one while reading", async () => {
    let upserted = false
    const db = {
      sellableOffering: {
        findFirst: async () => ({
          id: "offering-1",
          productUnitOffering: {
            inventoryUnit: {
              configurationVersion: {
                id: "configuration-1",
                product: {
                  currentUnitConfigurationVersionId: "configuration-1",
                  id: "product-1",
                },
                status: "CURRENT",
                units: [
                  {
                    id: "unit-1",
                    stockBehavior: "CANONICAL_SHARED",
                  },
                ],
              },
              factor: { toString: () => "1" },
              id: "unit-1",
              stockBehavior: "CANONICAL_SHARED",
              transactionScale: 0,
            },
          },
          status: "ACTIVE",
          storeAvailability: [{ isAvailable: true }],
          variantId: "variant-1",
        }),
      },
      stockBalanceSource: {
        findUnique: async () => null,
        upsert: async () => {
          upserted = true
          return null
        },
      },
    }

    await expect(
      getConfiguredCatalogOfferingAvailability(db as never, {
        offeringId: "offering-1",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).rejects.toMatchObject({
      code: "OFFERING_UNAVAILABLE",
    } satisfies Partial<CatalogError>)
    expect(upserted).toBe(false)
  })
})

describe("Service Commerce Catalog pricing and availability reads", () => {
  test("keeps Store/Tenant history scoped and selects the current Offering price with matching currency", async () => {
    let quoteWhere: unknown
    let saleWhere: unknown
    const db = {
      ...policyFakes("progressive_catalog"),
      commerceInquiryLine: { findFirst: async () => inquiryLine() },
      commerceQuoteLine: {
        findMany: async ({ where }: { where: unknown }) => {
          quoteWhere = where
          return [
            {
              id: "quote-line-1",
              unitPriceMinor: 900,
              quoteVersion: {
                acceptedAt: now,
                currencyCode: "NGN",
                quote: { storeId: "store-1" },
              },
            },
          ]
        },
      },
      commercialOrderLine: {
        findMany: async ({ where }: { where: unknown }) => {
          saleWhere = where
          return [
            {
              id: "sale-line-1",
              unitPriceMinor: 850,
              order: { storeId: "store-1", updatedAt: now },
            },
          ]
        },
      },
      sellableOffering: {
        findFirst: async () => ({
          catalogSourceLineLinks: [{ id: "link-1" }],
          currencyCode: "NGN",
          fixedPriceMinor: 800,
          id: "offering-1",
          kind: "PRODUCT_UNIT",
          priceChanges: [{ effectiveAt: past }],
          status: "DRAFT",
          storeAvailability: [],
          updatedAt: past,
        }),
      },
      serviceCommerceStoreProfile: {
        findFirst: async () => progressiveProfile(),
      },
      store: {
        findFirst: async () => ({ countryCode: "NG", currencyCode: "NGN" }),
      },
    }

    const result = await getServiceCommerceCatalogPriceSuggestions(
      db as never,
      {
        ...scope,
        includeTenantHistory: false,
        offeringId: "offering-1",
      },
    )

    expect(result.suggestion).toMatchObject({
      currencyCode: "NGN",
      priceMinor: 800,
      scope: "offering",
      source: "current_offering",
    })
    expect(quoteWhere).toMatchObject({
      quoteVersion: { quote: { storeId: "store-1", tenantId: "tenant-1" } },
    })
    expect(saleWhere).toMatchObject({
      order: { storeId: "store-1", tenantId: "tenant-1" },
    })
  })

  test("rejects a cross-currency Offering before price history can be suggested", async () => {
    const db = {
      ...policyFakes("progressive_catalog"),
      commerceInquiryLine: { findFirst: async () => inquiryLine() },
      sellableOffering: {
        findFirst: async () => ({
          catalogSourceLineLinks: [{ id: "link-1" }],
          currencyCode: "USD",
          fixedPriceMinor: 800,
          id: "offering-1",
          kind: "PRODUCT_UNIT",
          priceChanges: [],
          status: "DRAFT",
          storeAvailability: [],
          updatedAt: now,
        }),
      },
      serviceCommerceStoreProfile: {
        findFirst: async () => progressiveProfile(),
      },
      store: {
        findFirst: async () => ({ countryCode: "NG", currencyCode: "NGN" }),
      },
    }
    await expect(
      getServiceCommerceCatalogPriceSuggestions(db as never, {
        ...scope,
        includeTenantHistory: false,
        offeringId: "offering-1",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  test("fails price suggestion reads closed when progressive Catalog policy is denied", async () => {
    const db = {
      commerceInquiryLine: { findFirst: async () => inquiryLine() },
      serviceCommercePolicyAuditEvent: {
        createMany: async () => ({ count: 1 }),
      },
      serviceCommercePolicyDecision: { findMany: async () => [] },
      serviceCommerceStoreProfile: {
        findFirst: async () => progressiveProfile(),
      },
      store: {
        findFirst: async () => ({ countryCode: "NG", currencyCode: "NGN" }),
      },
    }

    await expect(
      getServiceCommerceCatalogPriceSuggestions(db as never, {
        ...scope,
        includeTenantHistory: false,
        offeringId: "offering-1",
      }),
    ).rejects.toMatchObject({ code: "POLICY_BLOCKED" })
  })

  test("fails a quote availability lookup when its source version is stale", async () => {
    const db = {
      catalogAvailabilityAttestation: {
        findFirst: async () => ({
          expiresAt: future,
          sourceVersionFingerprint: "stale-source",
          type: "MANUAL_PROCURE_TO_ORDER",
        }),
      },
      commerceInquiryLine: { findFirst: async () => inquiryLine() },
    }
    await expect(
      resolveCatalogAvailabilityAttestationForQuote(db as never, {
        ...scope,
        attestationId: "attestation-1",
        offeringId: "offering-1",
        quantity: "1",
      }),
    ).rejects.toMatchObject({
      code: "NOT_READY",
    } satisfies Partial<ServiceCommerceCatalogError>)
  })

  test("rejects a Quote quantity above the immutable manual availability commitment", async () => {
    const source = await resolveServiceCommerceCatalogSourceLine(
      {
        commerceInquiryLine: { findFirst: async () => inquiryLine() },
      } as never,
      { ...scope, operation: "read" },
    )
    const db = {
      catalogAvailabilityAttestation: {
        findFirst: async () => ({
          expiresAt: future,
          id: "attestation-1",
          quantity: { toString: () => "2" },
          sourceLink: { id: "link-1" },
          sourceVersionFingerprint: source.ref.fingerprint,
          type: "MANUAL_PROCURE_TO_ORDER",
        }),
      },
      commerceInquiryLine: { findFirst: async () => inquiryLine() },
    }

    await expect(
      resolveCatalogAvailabilityAttestationForQuote(db as never, {
        ...scope,
        attestationId: "attestation-1",
        offeringId: "offering-1",
        quantity: "3",
      }),
    ).rejects.toMatchObject({ code: "NOT_READY" })
  })

  test("denies reusable-price promotion at the repository boundary without active management authority", async () => {
    const tx = { membership: { findFirst: async () => null } }
    await expect(
      promoteServiceCommerceCatalogPrice(transactionDb(tx) as never, {
        ...scope,
        affectedStoreIds: ["store-1"],
        clientOperationId: "promotion-denied",
        expectedPreviousPriceMinor: null,
        expectedSourceFingerprint: "a".repeat(64),
        priceMinor: 900,
        quoteVersionId: "quote-version-1",
        reason: "Confirmed current supplier price",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  test("computes promotion impact from every bound Store and writes the reusable price atomically after explicit confirmation", async () => {
    const calls: string[] = []
    let quoteVersionWhere: Record<string, unknown> | undefined
    const tx = {
      ...policyFakes("price_promotion"),
      catalogPriceChange: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          id: "price-change-1",
          ...data,
        }),
      },
      catalogPricePromotion: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          calls.push("catalogPricePromotion.create")
          return { id: "promotion-1", ...data }
        },
        findUnique: async () => null,
      },
      catalogSourceLineLink: {
        findMany: async () => [
          { store: { id: "store-2", name: "Second Store" } },
        ],
        findUnique: async () => ({
          id: "link-1",
          offering: { fixedPriceMinor: 800 },
          offeringId: "offering-1",
          sourceType: "COMMERCE_INQUIRY",
          sourceVersionFingerprint: "pending",
        }),
      },
      commerceInquiryLine: { findFirst: async () => inquiryLine() },
      membership: { findFirst: async () => ({ id: "membership-1" }) },
      commerceQuoteVersion: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          quoteVersionWhere = where
          return {
            currencyCode: "NGN",
            id: "quote-version-1",
            lines: [{ unitPriceMinor: 900 }],
            quote: {},
          }
        },
      },
      sellableOffering: {
        updateMany: async () => {
          calls.push("sellableOffering.updateMany")
          return { count: 1 }
        },
      },
      serviceCommerceStoreProfile: {
        findFirst: async () => progressiveProfile(),
      },
      store: {
        findFirst: async () => ({
          countryCode: "NG",
          id: "store-1",
          name: "First Store",
        }),
      },
      storeOfferingAvailability: {
        findMany: async () => [
          { store: { id: "store-1", name: "First Store" } },
        ],
      },
    }
    const source = await resolveServiceCommerceCatalogSourceLine(tx as never, {
      ...scope,
      operation: "read",
    })
    tx.catalogSourceLineLink.findUnique = async () => ({
      id: "link-1",
      offering: { fixedPriceMinor: 800 },
      offeringId: "offering-1",
      sourceType: "COMMERCE_INQUIRY",
      sourceVersionFingerprint: source.ref.fingerprint,
    })

    const impact = await getServiceCommerceCatalogPricePromotionImpact(
      tx as never,
      {
        ...scope,
        expectedSourceFingerprint: source.ref.fingerprint,
        quoteId: "quote-1",
      },
    )
    expect(quoteVersionWhere).toMatchObject({
      quote: { id: "quote-1", storeId: "store-1", tenantId: "tenant-1" },
      quoteId: "quote-1",
    })
    expect(impact.affectedStores).toEqual([
      { id: "store-1", name: "First Store" },
      { id: "store-2", name: "Second Store" },
    ])
    expect(impact.requiresConfirmation).toBe(true)

    await promoteServiceCommerceCatalogPrice(transactionDb(tx) as never, {
      ...scope,
      affectedStoreIds: ["store-2", "store-1"],
      clientOperationId: "promotion-1",
      expectedPreviousPriceMinor: 800,
      expectedSourceFingerprint: source.ref.fingerprint,
      priceMinor: 900,
      quoteVersionId: "quote-version-1",
      reason: "Accepted quote reflects current supplier price",
    })
    expect(calls).toEqual([
      "sellableOffering.updateMany",
      "catalogPricePromotion.create",
    ])
    expect((tx as { transactionOptions?: unknown }).transactionOptions).toEqual(
      {
        maxWait: 10_000,
        timeout: 30_000,
      },
    )
  })
})
