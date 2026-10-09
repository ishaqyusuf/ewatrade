import { describe, expect, test } from "bun:test"
import type { CatalogRow } from "./catalog-presentation"
import {
  catalogAvatarTint,
  catalogCountLabel,
  catalogShelfCounts,
  catalogShelfTitle,
  filterCatalogShelf,
  sortCatalogRows,
} from "./catalog-shelf-model"

const rows: CatalogRow[] = [
  {
    id: "eggs",
    name: "Crate of eggs",
    kind: "product",
    unitName: "crate",
    priceLabel: "₦4,500",
    availabilityLabel: "0 crates available",
    detail: "",
    problem: "out_of_stock",
  },
  {
    id: "feed",
    name: "Feed",
    kind: "product",
    unitName: "bag",
    priceLabel: "₦14,000",
    availabilityLabel: "40 bags available",
    detail: "",
  },
  {
    id: "delivery",
    name: "Delivery",
    kind: "service",
    unitName: "trip",
    priceLabel: "Quote",
    availabilityLabel: "No inventory",
    detail: "",
  },
]

describe("Catalog Shelf List", () => {
  test("offline search matches names, kinds and units without discarding saved rows", () => {
    expect(
      filterCatalogShelf(rows, { query: " EGGS crate " }).map((row) => row.id),
    ).toEqual(["eggs"])
    expect(
      filterCatalogShelf(rows, { query: "service" }).map((row) => row.id),
    ).toEqual(["delivery"])
    expect(
      filterCatalogShelf(rows, { query: "bag" }).map((row) => row.id),
    ).toEqual(["feed"])
    expect(filterCatalogShelf(rows, { query: "missing" })).toEqual([])
    expect(filterCatalogShelf(rows, { query: "" })).toHaveLength(3)
    expect(rows).toHaveLength(3)
  })
  test("attention and type filters compose without inventing stock problems", () => {
    expect(
      filterCatalogShelf(rows, { attention: "out_of_stock" }).map(
        (row) => row.id,
      ),
    ).toEqual(["eggs"])
    expect(
      filterCatalogShelf(rows, { attention: "out_of_stock", kind: "service" }),
    ).toEqual([])
    expect(filterCatalogShelf(rows, { attention: "not_counted" })).toEqual([])
  })
  test("only settled product-only businesses use the Products title", () => {
    expect(catalogShelfTitle(true, false)).toBe("Products")
    expect(catalogShelfTitle(true, true)).toBe("Catalog")
    expect(catalogShelfTitle(true, undefined)).toBe("Catalog")
    expect(catalogShelfTitle(false, true)).toBe("Services")
  })

  test("counts only when every item is loaded", () => {
    expect(catalogShelfCounts(rows, rows.length + 5)).toBeNull()
    const counts = catalogShelfCounts(rows, rows.length)
    expect(counts).toMatchObject({ out_of_stock: 1, service: 1 })
    expect(counts && catalogCountLabel(counts)).toBe(
      `${rows.length} items · ${rows.length - 1} products, 1 service`,
    )
    expect(
      catalogCountLabel({
        ...(counts as NonNullable<typeof counts>),
        all: 2,
        product: 2,
        service: 0,
      }),
    ).toBe("2 products")
  })

  test("gives services sky and products a stable tint", () => {
    expect(catalogAvatarTint("Delivery", "service")).toBe("sky")
    expect(catalogAvatarTint("Feed", "product")).toBe(
      catalogAvatarTint(" feed ", "product"),
    )
  })

  test("sorts A to Z ignoring case", () => {
    const named = (name: string) => ({
      ...(rows[1] as CatalogRow),
      id: name,
      name,
    })
    expect(
      sortCatalogRows([
        named("QA Test"),
        named("Eggs"),
        named("QA bird"),
        named("Feed 10kg"),
        named("Feed 2kg"),
      ]).map((row) => row.name),
    ).toEqual(["Eggs", "Feed 2kg", "Feed 10kg", "QA bird", "QA Test"])
  })
})
