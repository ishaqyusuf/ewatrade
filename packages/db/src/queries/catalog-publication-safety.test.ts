import { describe, expect, test } from "bun:test"

import {
  assertCatalogPublicationSafety,
  assertExistingCatalogOfferingPublicationSafety,
  createCatalogItem,
  setCatalogOfferingStoreAvailability,
} from "./catalog"

describe("Catalog publication safety", () => {
  test("does not reread or record Terms acceptance during Catalog publication", async () => {
    const tx = {
      legalAcceptance: {
        findUnique: async () => {
          throw new Error("Registration owns acceptance")
        },
        create: async () => {
          throw new Error("Catalog must not record agreement")
        },
        upsert: async () => {
          throw new Error("Catalog must not record agreement")
        },
      },
    }
    await expect(
      assertCatalogPublicationSafety(tx as never, {
        actorUserId: "merchant-1",
        mediaUrls: [],
        texts: ["Bread", "Fresh daily"],
      }),
    ).resolves.toBeUndefined()
  })

  test("rejects unsafe Catalog text without a repeated Terms gate", async () => {
    const tx = {}
    await expect(
      assertCatalogPublicationSafety(tx as never, {
        actorUserId: "merchant-1",
        mediaUrls: [],
        texts: ["Bread", "[[qa-reject]]"],
      }),
    ).rejects.toMatchObject({ code: "INVALID_CATALOG_ITEM" })
  })

  test("rejects image URLs while approved live media screening is absent", async () => {
    const tx = {}
    await expect(
      assertCatalogPublicationSafety(tx as never, {
        actorUserId: "merchant-1",
        mediaUrls: ["https://example.test/product.jpg"],
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

  test("createCatalogItem refuses unsafe text before any Catalog write", async () => {
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
          throw new Error("Store lookup must follow screening")
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
        name: "[[qa-reject]]",
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
