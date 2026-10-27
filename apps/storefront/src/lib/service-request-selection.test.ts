import { expect, test } from "bun:test"
import { serviceRequestUrl } from "@ewatrade/storefront-runtime/links"
import {
  selectedRequestOffering,
  serviceOfferingHint,
  serviceRequestFormHref,
} from "./service-request-selection"

const entry = {
  formId: "published-form",
  offeringIds: ["home-1", "event-1"],
}
const home = {
  id: "home-cleaning",
  kind: "SERVICE",
  name: "Home Cleaning",
  options: [{ id: "home-1" }],
}

test("service cards hand off the exact current offering to the standalone storefront form", () => {
  expect(
    serviceRequestUrl(
      "https://shop.ewatrade-storefront.localhost",
      entry,
      home,
    ),
  ).toBe(
    "https://shop.ewatrade-storefront.localhost/service-request?item=home-cleaning&serviceOfferingId=home-1",
  )
  const event = {
    ...home,
    name: "Event Cleaning",
    options: [{ id: "event-1" }],
  }
  expect(serviceRequestUrl("https://shop.example.com", entry, event)).toContain(
    "serviceOfferingId=event-1",
  )
})

test("request navigation refuses missing forms, products and foreign options, without restricting service names", () => {
  expect(
    serviceRequestUrl("https://shop.example.com", undefined, home),
  ).toBeNull()
  for (const item of [
    { ...home, kind: "PRODUCT" },
    { ...home, options: [{ id: "other-store-offering" }] },
  ])
    expect(
      serviceRequestUrl("https://shop.example.com", entry, item),
    ).toBeNull()
  const laundry = { ...home, name: "Laundry" }
  expect(
    serviceRequestUrl("https://shop.example.com", entry, laundry),
  ).toContain("/service-request?item=home-cleaning&serviceOfferingId=home-1")
  expect(
    serviceRequestUrl("https://shop.example.com", entry, home, "foreign"),
  ).toBeNull()
})

test("the destination selects only current form members and preserves selection in its canonical URL", () => {
  const offerings = [{ id: "home-1" }, { id: "event-1" }]
  expect(selectedRequestOffering(offerings, "event-1")).toEqual({
    id: "event-1",
  })
  expect(selectedRequestOffering(offerings, "foreign-offering")).toBeNull()
  expect(selectedRequestOffering([], "home-1")).toBeNull()
  for (const input of [undefined, [], "", "x".repeat(192)])
    expect(serviceOfferingHint(input)).toBeNull()
  expect(
    serviceRequestFormHref({
      publicToken: "entry/1",
      conversationId: "conversation/1",
      offeringId: "home-1",
    }),
  ).toBe(
    "/r/entry%2F1/service?conversationId=conversation%2F1&serviceOfferingId=home-1",
  )
})
