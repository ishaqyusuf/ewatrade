import { describe, expect, test } from "bun:test"
import { shareStorefrontLink } from "@ewatrade/storefront-runtime/share"
import {
  canShareCatalogProduct,
  catalogProductShareAdapter,
  catalogProductShareMessages,
  currentCatalogProductShare,
} from "./catalog-product-share"

const available = {
  status: "available" as const,
  url: "https://shop.ewatrade.com/?item=item_1",
  title: "Sandals · Shop",
  tenantId: "tenant_1",
  storeId: "store_1",
}

describe("canShareCatalogProduct", () => {
  test("offers Share on sellable Products only", () => {
    expect(
      canShareCatalogProduct({
        kind: "product",
        product: { usage: "FOR_SALE" },
      }),
    ).toBe(true)
    expect(
      canShareCatalogProduct({ kind: "product", product: { usage: "BOTH" } }),
    ).toBe(true)
    expect(
      canShareCatalogProduct({ kind: "product", product: { usage: null } }),
    ).toBe(true)
    expect(
      canShareCatalogProduct({
        kind: "product",
        product: { usage: "INTERNAL_USE" },
      }),
    ).toBe(false)
    expect(canShareCatalogProduct({ kind: "service", product: null })).toBe(
      false,
    )
    expect(canShareCatalogProduct({ kind: "product", product: null })).toBe(
      false,
    )
    expect(canShareCatalogProduct({ kind: "unknown", product: {} })).toBe(false)
  })
})

test("a pending share rejection after scope change cannot copy the previous Store's URL", async () => {
  let current = true
  let copies = 0
  let rejectShare: (error: Error) => void = () => {
    throw new Error("Share was not started")
  }
  const pending = new Promise<void>((_resolve, reject) => {
    rejectShare = reject
  })
  const result = shareStorefrontLink(
    { title: available.title, url: available.url },
    catalogProductShareAdapter(
      {
        share: () => pending,
        copy: async () => {
          copies += 1
        },
      },
      () => current,
    ),
  )
  current = false
  rejectShare(new Error("Share unavailable"))
  expect(await result).toBe("unavailable")
  expect(copies).toBe(0)
})

describe("currentCatalogProductShare", () => {
  test("keeps a read for the same Store and cache generation", () => {
    expect(
      currentCatalogProductShare(available, {
        storeId: "store_1",
        generation: 2,
        currentGeneration: 2,
      }),
    ).toBe(available)
    expect(
      currentCatalogProductShare(available, {
        generation: 2,
        currentGeneration: 2,
      }),
    ).toBe(available)
  })

  test("drops reads after a business or Store switch", () => {
    expect(
      currentCatalogProductShare(available, {
        storeId: "store_1",
        generation: 2,
        currentGeneration: 3,
      }),
    ).toBeUndefined()
    expect(
      currentCatalogProductShare(available, {
        storeId: "store_2",
        generation: 2,
        currentGeneration: 2,
      }),
    ).toBeUndefined()
  })

  test("passes unavailable reasons through", () => {
    const unavailable = { status: "unavailable" as const, reason: "Not live" }
    expect(
      currentCatalogProductShare(unavailable, {
        storeId: "store_1",
        generation: 1,
        currentGeneration: 1,
      }),
    ).toBe(unavailable)
  })

  test("cancelled sharing stays neutral", () => {
    expect(catalogProductShareMessages.cancelled).toBeNull()
  })
})
