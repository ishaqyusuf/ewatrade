import { expect, test } from "bun:test"
import { cleaningServiceRequestUrl } from "@ewatrade/storefront-runtime/links"
import {
  selectedRequestOffering,
  serviceOfferingHint,
  serviceRequestFormHref,
} from "./service-request-selection"

const entry = {
  publicToken: "published entry",
  offeringIds: ["home-1", "event-1"],
}
const home = {
  kind: "SERVICE",
  name: "Home Cleaning",
  options: [{ id: "home-1" }],
}

test("cleaning cards hand off the exact current form offering on the configured chat origin", () => {
  expect(
    cleaningServiceRequestUrl(
      "https://chat.ewatrade-storefront.localhost",
      entry,
      home,
    ),
  ).toBe(
    "https://chat.ewatrade-storefront.localhost/r/published%20entry?serviceOfferingId=home-1",
  )
  const event = {
    ...home,
    name: "Event Cleaning",
    options: [{ id: "event-1" }],
  }
  expect(
    cleaningServiceRequestUrl("https://chat.example.com", entry, event),
  ).toContain("serviceOfferingId=event-1")
})

test("no request action without a current eligible entry or an unambiguous in-form cleaning offering", () => {
  expect(
    cleaningServiceRequestUrl("https://chat.example.com", undefined, home),
  ).toBeNull()
  for (const item of [
    { ...home, kind: "PRODUCT" },
    { ...home, name: "Laundry" },
    { ...home, options: [{ id: "other-store-offering" }] },
    { ...home, options: [{ id: "home-1" }, { id: "event-1" }] },
  ])
    expect(
      cleaningServiceRequestUrl("https://chat.example.com", entry, item),
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
