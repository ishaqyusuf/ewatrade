import { describe, expect, test } from "bun:test"

import {
  assertCatalogPublicationSafety,
  assertExistingCatalogOfferingPublicationSafety,
  createCatalogItem,
  setCatalogOfferingStoreAvailability,
} from "./catalog"

const publication = {
  documentHash: "a".repeat(64),
  effectiveDate: "2026-09-28",
  version: "approved-catalog-test",
}

function publicationTransaction(acceptedHash: string | null) {
  const reads: unknown[] = []
  const tx = {
    legalAcceptance: {
      findUnique: async (query: unknown) => {
        reads.push(query)
        return acceptedHash ? { documentHash: acceptedHash } : null
      },
    },
  }
  return { reads, tx }
}

describe("Catalog publication safety", () => {
  test("requires an approved effective Terms publication before reading acceptance", async () => {
    const { reads, tx } = publicationTransaction(publication.documentHash)
    await expect(
      assertCatalogPublicationSafety(tx as never, {
        actorUserId: "merchant-1",
        mediaUrls: [],
        publication: null,
        texts: ["Bread"],
      }),
    ).rejects.toMatchObject({ code: "INVALID_CATALOG_ITEM" })
    expect(reads).toHaveLength(0)
  })

  test("missing and stale acceptance block publication, then exact acceptance permits a retry", async () => {
    let acceptedHash: string | null = null
    const tx = {
      legalAcceptance: {
        findUnique: async () =>
          acceptedHash ? { documentHash: acceptedHash } : null,
      },
    }
    const input = {
      actorUserId: "merchant-1",
      mediaUrls: [],
      publication,
      texts: ["Bread", "Fresh daily"],
    }
    await expect(
      assertCatalogPublicationSafety(tx as never, input),
    ).rejects.toMatchObject({ code: "INVALID_CATALOG_ITEM" })
    acceptedHash = "b".repeat(64)
    await expect(
      assertCatalogPublicationSafety(tx as never, input),
    ).rejects.toMatchObject({ code: "INVALID_CATALOG_ITEM" })
    acceptedHash = publication.documentHash
    await expect(
      assertCatalogPublicationSafety(tx as never, input),
    ).resolves.toBeUndefined()
  })

  test("rejects unsafe Catalog text even after exact Terms acceptance", async () => {
    const { tx } = publicationTransaction(publication.documentHash)
    await expect(
      assertCatalogPublicationSafety(tx as never, {
        actorUserId: "merchant-1",
        mediaUrls: [],
        publication,
        texts: ["Bread", "[[qa-reject]]"],
      }),
    ).rejects.toMatchObject({ code: "INVALID_CATALOG_ITEM" })
  })

  test("rejects image URLs while approved live media screening is absent", async () => {
    const { tx } = publicationTransaction(publication.documentHash)
    await expect(
      assertCatalogPublicationSafety(tx as never, {
        actorUserId: "merchant-1",
        mediaUrls: ["https://example.test/product.jpg"],
        publication,
        texts: ["Bread"],
      }),
    ).rejects.toMatchObject({ code: "INVALID_CATALOG_ITEM" })
  })

  test("rechecks saved draft copy and media when an Offering becomes visible", async () => {
    let guidance = "[[qa-review]]"
    let imageUrl: string | null = null
    const tx = {
      catalogItem: {
        findFirst: async () => ({
          category: "Bakery",
          description: "Fresh daily",
          imageLinks: [],
          imageUrl,
          name: "Bread",
          optionGroups: [{ name: "Size", values: [{ label: "Small" }] }],
          product: null,
          variants: [
            {
              description: null,
              id: "variant-1",
              imageUrl: null,
              name: "Loaf",
              offerings: [
                {
                  id: "offering-1",
                  name: "One loaf",
                  serviceOffering: { guidance },
                },
              ],
            },
          ],
        }),
      },
      legalAcceptance: {
        findUnique: async () => ({ documentHash: publication.documentHash }),
      },
      sellableOffering: {
        findFirst: async () => ({
          catalogItemId: "item-1",
          variantId: "variant-1",
        }),
      },
    }
    const input = {
      actorUserId: "merchant-1",
      offeringId: "offering-1",
      publication,
      tenantId: "tenant-1",
    }
    await expect(
      assertExistingCatalogOfferingPublicationSafety(tx as never, input),
    ).rejects.toMatchObject({ code: "INVALID_CATALOG_ITEM" })
    guidance = "Handle with care"
    imageUrl = "https://example.test/product.jpg"
    await expect(
      assertExistingCatalogOfferingPublicationSafety(tx as never, input),
    ).rejects.toMatchObject({ code: "INVALID_CATALOG_ITEM" })
    imageUrl = null
    await expect(
      assertExistingCatalogOfferingPublicationSafety(tx as never, input),
    ).resolves.toBeUndefined()
  })

  test("createCatalogItem refuses missing Terms before any Catalog write", async () => {
    const writes: string[] = []
    const tx = {
      catalogCommandReceipt: { findUnique: async () => null },
      catalogItem: {
        create: async () => {
          writes.push("catalogItem.create")
          throw new Error("Catalog write must be blocked")
        },
      },
      legalAcceptance: { findUnique: async () => null },
      store: {
        findFirst: async () => {
          writes.push("store.findFirst")
          throw new Error("Store lookup must follow Terms")
        },
      },
    }
    const db = {
      $transaction: async (run: (transaction: typeof tx) => unknown) => run(tx),
    }
    await expect(
      createCatalogItem(db as never, {
        actorUserId: "merchant-1",
        clientOperationId: "create-catalog-1",
        kind: "service",
        name: "Laundry",
        storeId: "store-1",
        tenantId: "tenant-1",
        variants: [
          {
            isDefault: true,
            key: "default",
            name: "Standard",
            offerings: [
              {
                fixedPriceMinor: 1000,
                key: "standard",
                name: "Standard wash",
                pricingPolicy: "fixed",
              },
            ],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "INVALID_CATALOG_ITEM" })
    expect(writes).toEqual([])
  })

  test("enabling a saved unsafe Offering is blocked, while disabling remains available", async () => {
    const writes: boolean[] = []
    const tx = {
      catalogItem: {
        findFirst: async () => ({
          category: null,
          description: null,
          imageLinks: [],
          imageUrl: null,
          name: "[[qa-reject]]",
          optionGroups: [],
          product: null,
          variants: [
            {
              description: null,
              id: "variant-1",
              imageUrl: null,
              name: "Standard",
              offerings: [
                {
                  id: "offering-1",
                  name: "Standard",
                  serviceOffering: null,
                },
              ],
            },
          ],
        }),
      },
      legalAcceptance: {
        findUnique: async () => ({ documentHash: publication.documentHash }),
      },
      sellableOffering: {
        findFirst: async () => ({
          catalogItemId: "item-1",
          id: "offering-1",
          variantId: "variant-1",
        }),
      },
      store: { findFirst: async () => ({ id: "store-1" }) },
      storeOfferingAvailability: {
        upsert: async (query: { create: { isAvailable: boolean } }) => {
          writes.push(query.create.isAvailable)
          return query.create
        },
      },
    }
    const db = {
      $transaction: async (run: (transaction: typeof tx) => unknown) => run(tx),
    }
    const input = {
      actorUserId: "merchant-1",
      offeringId: "offering-1",
      storeId: "store-1",
      tenantId: "tenant-1",
    }
    await expect(
      setCatalogOfferingStoreAvailability(db as never, {
        ...input,
        isAvailable: true,
      }),
    ).rejects.toMatchObject({ code: "INVALID_CATALOG_ITEM" })
    expect(writes).toEqual([])
    await expect(
      setCatalogOfferingStoreAvailability(db as never, {
        ...input,
        isAvailable: false,
      }),
    ).resolves.toMatchObject({ isAvailable: false })
    expect(writes).toEqual([false])
  })
})
