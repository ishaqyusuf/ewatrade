import { expect, test } from "bun:test"
import {
  loadPublicStorefrontPinnedItems,
  publicCatalogPhotoPath,
} from "./public-storefront"
import type { DbClient } from "./types"

type Select = {
  photoAssets?: {
    where: Record<string, unknown>
    take: number
    orderBy: unknown
  }
  storefrontPolicies?: { where: unknown }
  offerings?: {
    select: { productUnitOffering: { select: Record<string, unknown> } }
  }
}

const balance = (unit: string, onHand: string, reserved = "0") => ({
  inventoryUnitId: unit,
  onHandQuantity: onHand,
  reservedQuantity: reserved,
})

/** One public product row as the shared reader selects it. */
const row = (
  id: string,
  extra: {
    photos?: (string | { id: string; optionVariantId: string })[]
    balances?: ReturnType<typeof balance>[]
    lowStockLevel?: string | null
    unit?: { id: string; scale: number } | null
    policy?: { unavailable: boolean; allowBookAhead: boolean }
  } = {},
) => ({
  id,
  name: `Item ${id}`,
  kind: "PRODUCT",
  description: null,
  categoryRecord: null,
  illustrations: [],
  photoAssets: (extra.photos ?? []).map((asset) =>
    typeof asset === "string" ? { id: asset } : asset,
  ),
  storefrontPolicies: extra.policy ? [extra.policy] : [],
  product: { lowStockLevel: extra.lowStockLevel ?? null },
  offerings: [
    {
      id: `${id}-o`,
      name: "Standard",
      fixedPriceMinor: 1000,
      currencyCode: "NGN",
      pricingPolicy: "FIXED",
      productUnitOffering:
        extra.unit === null
          ? null
          : {
              inventoryUnitId: extra.unit?.id ?? "pair",
              inventoryUnit: {
                name: "pair",
                transactionScale: extra.unit?.scale ?? 0,
              },
            },
      serviceOffering: null,
      variant: {
        id: `${id}-v`,
        name: "Standard",
        isDefault: true,
        stockBalanceSources: extra.balances ?? [],
      },
    },
  ],
})

test("gallery preserves effective primary ordering and manual unavailability keeps actual stock separate", async () => {
  const { db, selects } = fixture([
    row("eggs", {
      photos: ["approved-primary", "approved-next", "approved-third"],
      balances: [balance("pair", "40")],
      policy: { unavailable: true, allowBookAhead: true },
    }),
  ])
  const [item] = await loadPublicStorefrontPinnedItems(db, input(["eggs"]))
  expect(item?.photos?.map((photo) => photo.id)).toEqual([
    "approved-primary",
    "approved-next",
    "approved-third",
  ])
  expect(item?.photoUrl).toBe(item?.photos?.[0]?.url)
  expect(item).toMatchObject({
    storefrontPolicy: { unavailable: true, allowBookAhead: true },
    availability: "OUT_OF_STOCK",
    options: [{ stock: "in_stock", availability: "OUT_OF_STOCK" }],
  })
  expect(selects[0]?.photoAssets).toMatchObject({
    take: 8,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  })
  expect(selects[0]?.storefrontPolicies?.where).toEqual({
    tenantId: "tenant",
    storeId: "store_1",
  })
})

test("option photos follow the variant across selling units and stay out of the general gallery", async () => {
  const item = row("broiler", {
    photos: [
      { id: "day-old-photo", optionVariantId: "broiler-v" },
      "general-photo",
      { id: "unavailable-photo", optionVariantId: "unavailable-variant" },
    ],
  })
  const [dayOld] = item.offerings
  if (!dayOld) throw new Error("Expected a fixture offering")
  item.offerings.push(
    { ...dayOld, id: "day-old-tray" },
    {
      ...dayOld,
      id: "fully-grown",
      variant: { ...dayOld.variant, id: "fully-grown-variant" },
    },
  )
  const { db } = fixture([item])
  const [result] = await loadPublicStorefrontPinnedItems(db, input(["broiler"]))
  expect(result?.photoUrl).toBe(
    publicCatalogPhotoPath("store_1", "general-photo"),
  )
  expect(result?.photos?.map((photo) => photo.id)).toEqual(["general-photo"])
  expect(result?.options.map((option) => option.photoUrl)).toEqual([
    publicCatalogPhotoPath("store_1", "day-old-photo"),
    publicCatalogPhotoPath("store_1", "day-old-photo"),
    undefined,
  ])
  expect(JSON.stringify(result)).not.toContain("unavailable-photo")
})

function fixture(rows: ReturnType<typeof row>[]) {
  const selects: Select[] = []
  const db = {
    catalogItem: {
      findMany: async (args: { select: Select }) => {
        selects.push(args.select)
        return rows
      },
    },
  } as unknown as DbClient
  return { db, selects }
}
const input = (ids: string[]) => ({
  tenantId: "tenant",
  store: { id: "store_1", currencyCode: "NGN" },
  ids,
  storefrontItems: null,
})

test("an eligible public photo projects only its asset ID as the existing same-origin route", async () => {
  const { db, selects } = fixture([row("a", { photos: ["asset_1"] }), row("b")])
  const [a, b] = await loadPublicStorefrontPinnedItems(db, input(["a", "b"]))
  expect(a?.photoUrl).toBe("/api/catalog/public/stores/store_1/photos/asset_1")
  expect(publicCatalogPhotoPath("store_1", "asset_1")).toBe(
    "/api/catalog/public/stores/store_1/photos/asset_1",
  )
  // No eligible photo: no URL, so templates show catalog artwork.
  expect(b && "photoUrl" in b).toBe(false)
  // The same authority the public photo route enforces, scoped to this Store.
  const photoWhere = selects[0]?.photoAssets?.where
  expect(photoWhere).toMatchObject({
    storeId: "store_1",
    state: "APPROVED",
    approvedAt: { not: null },
    reviewedAt: { not: null },
    reviewProvider: { not: null },
    reviewPolicyVersion: { not: null },
    reviewDisplayDigest: { not: null },
    bytesDeletedAt: null,
    uploadedAt: { not: null },
    storagePath: { not: null },
    attachedAt: { not: null },
    tenant: {
      isActive: true,
      qaPurgeStartedAt: null,
    },
    OR: expect.arrayContaining([
      {
        tenant: { dataClassification: "LIVE" },
        storageProvider: "vercel_blob_private",
        storageStoreId: expect.any(String),
        reviewProvider: { not: "local_qa_fixture" },
      },
    ]),
    store: { status: "ACTIVE", sites: { some: { status: "PUBLISHED" } } },
  })
  // Storage paths, digests and original URLs never leave the database.
  expect(JSON.stringify([a, b])).not.toMatch(/storage|blob|digest|https?:/i)
})

test("low-stock counts appear only when the published design opts in", async () => {
  const low = row("low", {
    balances: [balance("pair", "3", "1")],
    lowStockLevel: "5",
  })
  const off = fixture([low])
  const [plain] = await loadPublicStorefrontPinnedItems(off.db, input(["low"]))
  expect(plain?.options[0]).toMatchObject({ stock: "low_stock" })
  expect(plain?.options[0] && "lowStockQuantity" in plain.options[0]).toBe(
    false,
  )
  const on = fixture([
    low,
    row("plenty", { balances: [balance("pair", "9")], lowStockLevel: "5" }),
    row("unknown", { lowStockLevel: "5" }),
    row("mixed", {
      balances: [balance("pair", "1"), balance("box", "1")],
      lowStockLevel: "5",
    }),
    row("no-unit", {
      balances: [balance("pair", "1")],
      lowStockLevel: "5",
      unit: null,
    }),
  ])
  const items = await loadPublicStorefrontPinnedItems(on.db, {
    ...input(["low", "plenty", "unknown", "mixed", "no-unit"]),
    projection: { lowStockCounts: true },
  })
  expect(
    items.map((item) => {
      const option = item.options[0]
      return [
        item.id,
        option && "stock" in option ? option.stock : undefined,
        option && "lowStockQuantity" in option
          ? option.lowStockQuantity
          : undefined,
      ]
    }),
  ).toEqual([
    ["low", "low_stock", "2"],
    ["plenty", "in_stock", undefined],
    ["unknown", "unknown", undefined],
    ["mixed", "low_stock", undefined],
    ["no-unit", "low_stock", undefined],
  ])
  // The selling unit's ID is read so counts never cross units.
  expect(
    on.selects[0]?.offerings?.select.productUnitOffering.select,
  ).toMatchObject({ inventoryUnitId: true })
})
