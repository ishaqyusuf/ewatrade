import { expect, test } from "bun:test"
import { isBodyTransportQuery } from "./body-transport"

test("only the private Studio preview query moves its input into a POST body", () => {
  expect(
    isBodyTransportQuery({ path: "storefront.preview", type: "query" }),
  ).toBe(true)
  for (const op of [
    { path: "storefront.preview", type: "mutation" },
    { path: "storefront.previewSession", type: "mutation" },
    { path: "storefront.draft", type: "query" },
    { path: "catalog.listItemsPage", type: "query" },
  ])
    expect(isBodyTransportQuery(op)).toBe(false)
})
