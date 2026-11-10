import { expect, test } from "bun:test"
import { resolveSavedRecordLink } from "./saved-record-link"

const dash = "https://dash.ewatrade.com"

test("verified dashboard links open the exact Catalog item", () => {
  expect(
    resolveSavedRecordLink(`${dash}/open/catalog-item/cmh0abc_12-x`, dash),
  ).toBe("/catalog-item/cmh0abc_12-x")
  expect(
    resolveSavedRecordLink(
      "https://example.com/setup/open/catalog-item/item1/",
      "https://example.com/setup",
    ),
  ).toBe("/catalog-item/item1")
  expect(resolveSavedRecordLink("/open/catalog-item/item1?x=1")).toBe(
    "/catalog-item/item1",
  )
  expect(resolveSavedRecordLink("ewatrade-dev://open/catalog-item/item1")).toBe(
    "/catalog-item/item1",
  )
})

test("other hosts, paths, schemes and odd identities never route", () => {
  for (const link of [
    "https://evil.example/open/catalog-item/item1",
    `${dash}/sales?catalogDetail=item1`,
    `${dash}/open/catalog-item/item1/edit`,
    `${dash}/open/catalog-item/..%2Fsecret`,
    `${dash}/open/catalog-item/a%E0%A4%A`,
    "http://dash.ewatrade.com/open/catalog-item/item1",
    "ewatrade://r/open/catalog-item/item1",
    "javascript:alert(1)",
    "open/catalog-item/item1",
  ])
    expect(resolveSavedRecordLink(link, dash)).toBeNull()
  expect(resolveSavedRecordLink(`${dash}/open/catalog-item/item1`)).toBeNull()
})
