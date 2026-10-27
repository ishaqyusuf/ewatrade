import { expect, test } from "bun:test"
import {
  loadPublicStorefrontPinnedItems,
  publicCatalogItemWhere,
} from "./public-storefront"
import type { DbClient } from "./types"

const row = (id: string) => ({
  id,
  name: `Item ${id}`,
  kind: "PRODUCT",
  description: null,
  categoryRecord: null,
  illustrations: [],
  product: { lowStockLevel: null },
  offerings: [
    {
      id: `${id}-o`,
      name: "Standard",
      fixedPriceMinor: 1000,
      currencyCode: "NGN",
      pricingPolicy: "FIXED",
      productUnitOffering: null,
      serviceOffering: null,
      variant: {
        id: `${id}-v`,
        name: "Standard",
        isDefault: true,
        stockBalanceSources: [],
      },
    },
  ],
})

/** Fake repository: `public` is what the eligibility where-clause admits, in created order. */
function fixture(publicIds: string[]) {
  const calls: { where: unknown; take?: number; select: unknown }[] = []
  const db = {
    catalogItem: {
      findMany: async (args: {
        where: { AND?: [unknown, { id: { in: string[] } }] }
        take?: number
        select: unknown
      }) => {
        calls.push(args)
        const ids = args.where.AND?.[1]?.id.in
        const rows = publicIds
          .filter((id) => !ids || ids.includes(id))
          .slice(0, args.take)
        // Return in a different order than asked, like a database without ORDER BY.
        return ids ? rows.reverse().map(row) : rows.map((id) => ({ id }))
      },
    },
  } as unknown as DbClient
  return { db, calls }
}
const input = {
  tenantId: "tenant",
  store: { id: "store", currencyCode: "NGN" },
}

test("paid listings load pinned public items beyond the page, in pin order, bounded", async () => {
  const { db, calls } = fixture(["a", "b", "late-60"])
  const items = await loadPublicStorefrontPinnedItems(db, {
    ...input,
    ids: ["late-60", "hidden", "a", "a", "bad id", "<x>"],
    storefrontItems: null,
  })
  expect(items.map((item) => item.id)).toEqual(["late-60", "a"])
  expect(items[0]).toMatchObject({ name: "Item late-60", priceMinor: 1000 })
  expect(calls).toHaveLength(1)
  // Same public eligibility as the listing; never a raw ID lookup.
  expect(calls[0]?.where).toEqual({
    AND: [
      publicCatalogItemWhere("tenant", "store"),
      { id: { in: ["late-60", "hidden", "a"] } },
    ],
  })
  expect(calls[0]?.take).toBe(3)
})

test("included plans only admit pins inside the cap, and nothing to load means no read", async () => {
  const capped = fixture(["a", "b", "c", "d"])
  const items = await loadPublicStorefrontPinnedItems(capped.db, {
    ...input,
    ids: ["d", "b"],
    storefrontItems: 2,
  })
  expect(items.map((item) => item.id)).toEqual(["b"])
  expect(capped.calls[0]).toMatchObject({
    where: publicCatalogItemWhere("tenant", "store"),
    take: 2,
  })
  const outside = fixture(["a", "b", "c"])
  expect(
    await loadPublicStorefrontPinnedItems(outside.db, {
      ...input,
      ids: ["c"],
      storefrontItems: 2,
    }),
  ).toEqual([])
  expect(outside.calls).toHaveLength(1)
  const none = fixture(["a"])
  expect(
    await loadPublicStorefrontPinnedItems(none.db, {
      ...input,
      ids: ["bad id"],
      storefrontItems: null,
    }),
  ).toEqual([])
  expect(none.calls).toHaveLength(0)
  const many = fixture([])
  await loadPublicStorefrontPinnedItems(many.db, {
    ...input,
    ids: Array.from({ length: 50 }, (_, index) => `id${index}`),
    storefrontItems: null,
  })
  expect(many.calls[0]?.take).toBe(32)
})
