import { describe, expect, test } from "bun:test"

import { getServiceCommerceCatalogGraduationReadiness } from "./service-commerce-graduation"

const scope = {
  actorUserId: "manager-1",
  offeringId: "offering-1",
  storeId: "store-1",
  tenantId: "tenant-1",
}

function productDraft() {
  return {
    catalogItem: {
      category: "Bags",
      product: { id: "product-1" },
      service: null,
      status: "DRAFT",
    },
    catalogItemId: "item-1",
    currencyCode: "NGN",
    fixedPriceMinor: 2_000_000,
    id: "offering-1",
    productUnitOffering: null,
    revision: 0,
    serviceOffering: null,
    status: "DRAFT",
    storeAvailability: [{ isAvailable: false, storeId: "store-1" }],
    variant: { name: "Red small", status: "DRAFT" },
    variantId: "variant-1",
  }
}

describe("Service Commerce Catalog graduation", () => {
  test("projects missing verified Product facts with Tenant and Store scope", async () => {
    const predicates: unknown[] = []
    const db = {
      catalogSourceLineLink: {
        findMany: async () => [{ sourceType: "COMMERCE_INQUIRY" }],
      },
      membership: {
        findFirst: async (input: { where: unknown }) => {
          predicates.push(input.where)
          return { id: "membership-1" }
        },
      },
      sellableOffering: {
        findFirst: async (input: { where: unknown }) => {
          predicates.push(input.where)
          return productDraft()
        },
        findMany: async (input: { where: unknown }) => {
          predicates.push(input.where)
          return [{ variantId: "variant-1" }]
        },
      },
      serviceCommerceStoreProfile: {
        findFirst: async (input: { where: unknown }) => {
          predicates.push(input.where)
          return {
            catalogAdoptionMode: "PROGRESSIVE",
            id: "profile-1",
            status: "ACTIVE",
          }
        },
      },
      serviceCommercePolicyAuditEvent: {
        createMany: async () => ({ count: 1 }),
      },
      serviceCommercePolicyDecision: {
        findMany: async () => [
          {
            approvalReference: "approval-1",
            channel: "STAFF",
            effectiveAt: new Date("2026-08-01T00:00:00.000Z"),
            evidenceReference: "evidence-1",
            expiresAt: new Date("2027-08-01T00:00:00.000Z"),
            id: "policy-1",
            jurisdictionCode: "NG",
            outcome: "ALLOWED",
            revision: 1,
            revokedAt: null,
            subject: "MANAGED_INVENTORY_GRADUATION",
            vertical: "SERVICE",
          },
        ],
      },
      stockBalanceSource: {
        findFirst: async (input: { where: unknown }) => {
          predicates.push(input.where)
          return null
        },
      },
      store: {
        findFirst: async (input: { where: unknown }) => {
          predicates.push(input.where)
          return { countryCode: "NG", currencyCode: "NGN", id: "store-1" }
        },
      },
    }

    const result = await getServiceCommerceCatalogGraduationReadiness(
      db as never,
      scope,
    )

    expect(result).toMatchObject({
      canGraduate: false,
      draftKind: "product",
      missingFacts: ["product_unit", "product_identifier", "opening_count"],
      offeringId: "offering-1",
      revision: 0,
    })
    expect(predicates).toContainEqual({
      id: "offering-1",
      tenantId: "tenant-1",
    })
    expect(predicates).toContainEqual({ id: "store-1", tenantId: "tenant-1" })
    expect(predicates).toContainEqual(
      expect.objectContaining({ storeId: "store-1", tenantId: "tenant-1" }),
    )
    expect(predicates).toContainEqual(
      expect.objectContaining({
        role: { in: ["OWNER", "ADMIN"] },
        tenantId: "tenant-1",
        userId: "manager-1",
      }),
    )
  })

  test("fails closed when the scoped Offering is absent", async () => {
    const db = {
      membership: { findFirst: async () => ({ id: "membership-1" }) },
      sellableOffering: { findFirst: async () => null },
      serviceCommerceStoreProfile: {
        findFirst: async () => ({
          catalogAdoptionMode: "PROGRESSIVE",
          id: "profile-1",
          status: "ACTIVE",
        }),
      },
      store: {
        findFirst: async () => ({ currencyCode: "NGN", id: "store-1" }),
      },
    }
    await expect(
      getServiceCommerceCatalogGraduationReadiness(db as never, scope),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})
