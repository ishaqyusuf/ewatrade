import { expect, test } from "bun:test"
import { createStorefrontItemPrefetchBudget } from "./storefront-prefetch"

test("item intent prefetch is deduplicated and strictly bounded per visit", () => {
  const take = createStorefrontItemPrefetchBudget()
  expect(take("/?item=a")).toBe(true)
  expect(take("/?item=a")).toBe(false)
  expect(take("/shop?item=b")).toBe(true)
  expect(take("/services?item=c")).toBe(false)
  expect(createStorefrontItemPrefetchBudget()("/services?item=c")).toBe(true)
})

test("private, external and non-item URLs never consume speculative reads", () => {
  const take = createStorefrontItemPrefetchBudget()
  for (const href of [
    "/receipt/token",
    "/account",
    "/checkout",
    "//foreign.test/?item=a",
    "https://foreign.test/?item=a",
    "/?item=a&token=private",
    "/?item=a&item=b",
    "/?item=a#private",
    "/?item=bad%2Fid",
    "/service-request?item=a",
    "/\\foreign.test/?item=a",
    "/\\[",
  ])
    expect(take(href)).toBe(false)
  expect(take("/?item=valid")).toBe(true)
})
