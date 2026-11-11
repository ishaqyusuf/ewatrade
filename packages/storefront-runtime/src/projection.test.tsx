import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { PublicCatalogItem } from "../../storefront-contracts/src/resources"
import { photoImageBroken } from "./photo"
import { StorefrontArtwork } from "./primitives"
import {
  type PublicStorefrontProjection,
  publicStorefrontResources,
} from "./projection"

const item = (id: string, lowStockQuantity?: string): PublicCatalogItem => ({
  id,
  name: `Item ${id}`,
  kind: "PRODUCT",
  description: null,
  category: null,
  illustrationId: "ill-generic-product",
  currencyCode: "NGN",
  priceMinor: 1000,
  isFromPrice: false,
  availability: null,
  options: [
    {
      id: `${id}-o`,
      name: "Standard",
      priceMinor: 1000,
      currencyCode: "NGN",
      availability: null,
      stock: "low_stock",
      ...(lowStockQuantity ? { lowStockQuantity } : {}),
    },
  ],
})

const store = (): PublicStorefrontProjection => ({
  name: "Shop",
  slug: "shop",
  description: null,
  currencyCode: "NGN",
  items: [item("a", "2")],
  highlightedItem: item("h", "1"),
  categories: [],
  category: null,
  nextCursor: null,
  hasHiddenItems: false,
  chatToken: null,
  whatsAppPhone: null,
  pinnedItems: [item("p", "3")],
})

const counts = (resources: ReturnType<typeof publicStorefrontResources>) =>
  [
    ...resources.resources.catalog.items,
    resources.resources.catalog.highlightedItem,
    ...(resources.resources.catalog.pinnedItems ?? []),
  ].map((entry) => entry?.options[0]?.lowStockQuantity)

test("snapshots drop low-stock counts unless this composition opted in", () => {
  // Default and explicit off: whatever the loader returned, nothing is serialized.
  for (const resources of [
    publicStorefrontResources(store()),
    publicStorefrontResources(store(), { lowStockCounts: false }),
  ]) {
    expect(counts(resources)).toEqual([undefined, undefined, undefined])
    expect(JSON.stringify(resources)).not.toContain("lowStockQuantity")
    // The coarse state stays.
    expect(resources.resources.catalog.items[0]?.options[0]?.stock).toBe(
      "low_stock",
    )
  }
  expect(
    counts(publicStorefrontResources(store(), { lowStockCounts: true })),
  ).toEqual(["2", "1", "3"])
})

test("product photos render with artwork kept as the failure fallback", () => {
  const html = renderToStaticMarkup(
    <StorefrontArtwork
      item={{
        ...item("a"),
        photoUrl: "/api/catalog/public/stores/s/photos/p",
      }}
    />,
  )
  expect(html).toContain('src="/api/catalog/public/stores/s/photos/p"')
  expect(html).toContain('alt="Item a"')
  // Broken only once the browser finished with no pixels; lazy pending is fine.
  expect(photoImageBroken({ complete: true, naturalWidth: 0 })).toBe(true)
  expect(photoImageBroken({ complete: false, naturalWidth: 0 })).toBe(false)
  expect(photoImageBroken({ complete: true, naturalWidth: 800 })).toBe(false)
  expect(photoImageBroken(null)).toBe(false)
})

test("selected option artwork takes precedence over the main item photo", () => {
  const entry = {
    ...item("a"),
    photoUrl: "/api/catalog/public/stores/s/photos/general",
  }
  const assigned = "/api/catalog/public/stores/s/photos/day-old"
  expect(
    renderToStaticMarkup(
      <StorefrontArtwork item={entry} optionPhotoUrl={assigned} />,
    ),
  ).toContain(`src="${assigned}"`)
  expect(renderToStaticMarkup(<StorefrontArtwork item={entry} />)).toContain(
    `src="${entry.photoUrl}"`,
  )
})
