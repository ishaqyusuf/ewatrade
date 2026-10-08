import { describe, expect, test } from "bun:test"
import type { CatalogRow } from "./catalog-presentation"
import { catalogShelfTitle, filterCatalogShelf } from "./catalog-shelf-model"

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
})
