import { expect, test } from "bun:test"
import { getCatalogProductShareSource } from "./catalog-product-share"
import type { DbClient } from "./types"

function fixture(
  options: { qa?: boolean; published?: boolean; storeId?: string } = {},
) {
  const reads: unknown[] = []
  const storeId = options.storeId ?? "store"
  const db = {
    tenant: {
      findFirst: async ({ where }: { where: { id?: string } }) => {
        reads.push(where)
        if (where.id) return options.qa ? null : { slug: "merchant" }
        return {
          id: "tenant",
          name: "Merchant",
          slug: "merchant",
          dataClassification: "LIVE",
          metadata: { retailOpsPlanId: "starter" },
          subscription: null,
          stores: [
            {
              id: storeId,
              description: null,
              currencyCode: "NGN",
              countryCode: "NG",
              supportPhone: null,
            },
          ],
        }
      },
    },
    site: {
      findMany: async () =>
        options.published === false
          ? []
          : [
              {
                id: "site",
                tenantId: "tenant",
                storeId,
                status: "PUBLISHED",
                store: { status: "ACTIVE" },
                activeRelease: {
                  id: "release",
                  tenantId: "tenant",
                  storeId,
                  siteId: "site",
                  composition: {},
                  contentHash: "hash",
                  templateKey: "catalog-v4",
                  templateVersion: "1.1.0",
                  runtimeVersion: 1,
                },
              },
            ],
    },
    catalogItem: {
      findMany: async (query: unknown) => {
        reads.push(query)
        return ["one", "two", "three", "four"].map((id) => ({
          id,
          name: id,
          kind: "PRODUCT",
          description: null,
          categoryRecord: null,
          illustrations: [],
          offerings: [
            {
              id: `option-${id}`,
              name: "Pair",
              fixedPriceMinor: 100,
              currencyCode: "NGN",
              pricingPolicy: "FIXED",
              variant: {
                id: `variant-${id}`,
                name: "Default",
                isDefault: true,
                stockBalanceSources: [],
              },
            },
          ],
        }))
      },
    },
  } as unknown as DbClient
  return { db, reads }
}

test("product-share source reuses current published Store and public plan cap, without direct item bypass", async () => {
  const { db, reads } = fixture()
  const result = await getCatalogProductShareSource(db, {
    tenantId: "tenant",
    storeId: "store",
    itemId: "four",
  })
  expect(reads[0]).toEqual({
    id: "tenant",
    isActive: true,
    dataClassification: "LIVE",
  })
  expect(result?.storefront.items.map((item) => item.id)).toEqual([
    "one",
    "two",
    "three",
  ])
  expect(result?.storefront.highlightedItem).toBeNull()
  expect(JSON.stringify(reads)).toContain('"storeId":"store"')
})

test("QA, unpublished Sites and a different Site Store cannot produce a share source", async () => {
  for (const options of [
    { qa: true },
    { published: false },
    { storeId: "other-store" },
  ]) {
    const { db } = fixture(options)
    expect(
      await getCatalogProductShareSource(db, {
        tenantId: "tenant",
        storeId: "store",
        itemId: "one",
      }),
    ).toBeNull()
  }
})
