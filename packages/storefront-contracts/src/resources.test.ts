import { expect, test } from "bun:test"
import { catalogQuerySchema, storefrontQueryKey } from "./resources"

test("public listing query is bounded and cannot select a Tenant or Store", () => {
  expect(
    catalogQuerySchema.parse({
      q: "  Red & blue  ",
      sort: "price_desc",
      availability: "available",
    }),
  ).toEqual({ q: "Red & blue", sort: "price_desc", availability: "available" })
  for (const query of [
    { q: "x".repeat(121) },
    { availability: "in_stock" },
    { sort: "cost" },
    { tenantId: "foreign" },
    { storeId: "foreign" },
    { q: ["a", "b"] },
    { after: `s:${"x".repeat(1537)}` },
    { after: "s:bad/value" },
  ])
    expect(catalogQuerySchema.safeParse(query).success).toBe(false)
  for (const after of ["item", "a:item", "o:item", "s:eyJpZCI6Iml0ZW0ifQ"])
    expect(catalogQuerySchema.safeParse({ after }).success).toBe(true)
})

test("scope cache keys distinguish search, availability and sort", () => {
  const scope = {
    tenantId: "tenant",
    siteId: "site",
    storeId: "store",
    releaseId: "release",
    mode: "live" as const,
    locale: "en-NG",
    currencyCode: "NGN",
  }
  const keys = [
    {},
    { q: "Rice" },
    { q: "Beans" },
    { availability: "available" as const },
    { availability: "out_of_stock" as const },
    { sort: "price_asc" as const },
    { sort: "name_desc" as const },
  ].map((query) => JSON.stringify(storefrontQueryKey(scope, query)))
  expect(new Set(keys).size).toBe(keys.length)
})
