import { expect, test } from "bun:test"
import { serviceRequestUrl } from "./links"

test("all eligible service names and multiple options use the standalone storefront path", () => {
  const entry = { formId: "form", offeringIds: ["small", "large"] }
  const item = {
    id: "laundry",
    kind: "SERVICE",
    options: [{ id: "small" }, { id: "large" }],
  }
  const href = serviceRequestUrl(
    "https://demo.ewatrade.com",
    entry,
    item,
    "large",
  )
  expect(href).toBe(
    "https://demo.ewatrade.com/service-request?item=laundry&serviceOfferingId=large",
  )
  expect(
    serviceRequestUrl("https://demo.ewatrade.com", entry, {
      ...item,
      kind: "PRODUCT",
    }),
  ).toBeNull()
  expect(
    serviceRequestUrl("https://demo.ewatrade.com", entry, item, "foreign"),
  ).toBeNull()
})

test("multiple option navigation carries every distinct public offering and refuses partial matches", () => {
  const origin = "https://demo.ewatrade.com"
  const entry = { formId: "form", offeringIds: ["one", "two"] }
  const item = {
    id: "laundry",
    kind: "SERVICE",
    options: [{ id: "one" }, { id: "two" }],
  }
  const href = serviceRequestUrl(origin, entry, item, "one", ["one", "two"])
  expect(
    href && new URL(href).searchParams.getAll("serviceOfferingId"),
  ).toEqual(["one", "two"])
  for (const choices of [
    [],
    ["one", "foreign"],
    ["one", "one"],
    ["two", "one"],
  ])
    expect(serviceRequestUrl(origin, entry, item, "one", choices)).toBeNull()
})
