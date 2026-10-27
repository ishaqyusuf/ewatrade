import { expect, test } from "bun:test"
import {
  type getCatalogProductShareSource,
  siteContentHash,
} from "@ewatrade/db/queries"
import {
  defaultComposition,
  templateRegistry,
} from "@ewatrade/storefront-templates"
import { catalogProductShareSchema } from "../schemas/catalog"
import { catalogDetailScope } from "./detail-access"
import { readCatalogProductShare } from "./product-share"

type Source = NonNullable<
  Awaited<ReturnType<typeof getCatalogProductShareSource>>
>
const scope = { tenantId: "tenant", storeId: "store", itemId: "sandals" }
const db = {} as Parameters<typeof getCatalogProductShareSource>[0]

function source(): Source {
  const manifest = templateRegistry.find(
    ({ manifest }) =>
      manifest.key === "catalog-v4" && manifest.version === "1.1.0",
  )?.manifest
  if (!manifest) throw new Error("Missing catalog fixture manifest")
  const composition = defaultComposition(manifest)
  const item = {
    id: "sandals",
    name: "Sandals",
    kind: "PRODUCT" as const,
    description: null,
    category: null,
    illustrationId: "ill-sandal",
    currencyCode: "NGN",
    priceMinor: 1850000,
    isFromPrice: false,
    availability: null,
    options: [
      {
        id: "pair",
        name: "Pair",
        priceMinor: 1850000,
        currencyCode: "NGN",
        availability: null,
      },
    ],
  }
  return {
    host: "shop.ewatrade.com",
    site: {
      siteId: "site",
      storeId: "store",
      release: {
        id: "release",
        tenantId: "tenant",
        storeId: "store",
        siteId: "site",
        composition,
        contentHash: siteContentHash(composition),
        templateKey: "catalog-v4",
        templateVersion: "1.1.0",
        runtimeVersion: 1,
      },
    },
    storefront: {
      name: "Shop",
      slug: "shop",
      description: null,
      currencyCode: "NGN",
      isQaPreview: false,
      planId: "starter",
      storefrontItems: 3,
      customerMessages: false,
      chatToken: null,
      whatsAppPhone: null,
      hasHiddenItems: false,
      nextCursor: null,
      category: null,
      categories: [],
      highlightedItem: item,
      items: [item],
    },
  }
}

test("sharing returns only the current public product's canonical link and actor scope", async () => {
  expect(
    await readCatalogProductShare(db, scope, async () => source()),
  ).toEqual({
    status: "available",
    url: "https://shop.ewatrade.com/?item=sandals",
    title: "Sandals · Shop",
    tenantId: "tenant",
    storeId: "store",
  })
})

test("missing publication, hidden products, services, QA, foreign Store and invalid release fail closed", async () => {
  expect(
    await readCatalogProductShare(db, scope, async () => null),
  ).toMatchObject({ status: "unavailable" })
  const cases: Array<(value: Source) => void> = [
    (value) => {
      value.storefront.items = []
      value.storefront.highlightedItem = null
    },
    (value) => {
      for (const item of value.storefront.items) item.kind = "SERVICE"
    },
    (value) => {
      value.storefront.isQaPreview = true
    },
    (value) => {
      value.site.storeId = "foreign"
    },
    (value) => {
      value.site.release.tenantId = "foreign"
    },
    (value) => {
      value.site.release.contentHash = "stale"
    },
    (value) => {
      value.site.release.runtimeVersion = 999
    },
    (value) => {
      value.site.release.templateKey = "unknown"
    },
  ]
  for (const change of cases) {
    const value = source()
    change(value)
    expect(
      await readCatalogProductShare(db, scope, async () => value),
    ).toMatchObject({ status: "unavailable" })
  }
})

test("read schema cannot select a different actor, Store, host or publication state", () => {
  expect(catalogProductShareSchema.parse({ itemId: "sandals" })).toEqual({
    itemId: "sandals",
  })
  for (const extra of [
    { storeId: "foreign" },
    { tenantId: "foreign" },
    { host: "evil.test" },
    { publish: true },
  ])
    expect(
      catalogProductShareSchema.safeParse({ itemId: "sandals", ...extra })
        .success,
    ).toBe(false)
  const tenant = {
    tenant: { id: "tenant" },
    membership: { role: "CASHIER" },
    stores: [{ id: "store" }],
    activeStore: { id: "store" },
  }
  expect(
    catalogDetailScope({ itemId: "sandals", storeId: "store" }, tenant),
  ).toMatchObject(scope)
  expect(() =>
    catalogDetailScope({ itemId: "sandals", storeId: "foreign" }, tenant),
  ).toThrow()
  expect(() =>
    catalogDetailScope(
      { itemId: "sandals", storeId: "store" },
      { ...tenant, membership: { role: "VIEWER" } },
    ),
  ).toThrow()
})
