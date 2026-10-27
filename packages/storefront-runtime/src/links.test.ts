import { expect, test } from "bun:test"
import { storefrontActionSchema } from "../../storefront-contracts/src/actions"
import {
  itemWhatsAppUrl,
  productWhatsAppUrl,
  serviceRequestUrl,
  storefrontListingHref,
} from "./links"

test("listing links retain filters and cursor with literal search encoding", () => {
  const href = storefrontListingHref({
    category: "food",
    q: "  Rice & beans #1  ",
    availability: "available",
    sort: "price_asc",
    after: "s:cGFnZQ",
  })
  const url = new URL(href, "https://shop.example.com")
  expect(url.searchParams.get("q")).toBe("Rice & beans #1")
  expect(url.searchParams.get("category")).toBe("food")
  expect(url.searchParams.get("availability")).toBe("available")
  expect(url.searchParams.get("sort")).toBe("price_asc")
  expect(url.searchParams.get("after")).toBe("s:cGFnZQ")
  expect(storefrontListingHref({ q: " " })).toBe("/")
  expect(storefrontListingHref({ q: "Beans", sort: "name_asc" })).not.toContain(
    "after",
  )
})

test("WhatsApp enquiries preserve exact selected public variant and selling-unit labels", () => {
  const item = {
    name: "Sandals & bags",
    options: [
      { id: "large-pair", name: "Brown · Size 42 · Pair" },
      { id: "small-box", name: "Blue & white · Box of 6" },
    ],
  }
  const link = "https://shop.ewatrade.com/?item=sandals"
  const href = itemWhatsAppUrl("+2348031234567", item, link, ["small-box"])
  expect(href).not.toBeNull()
  if (!href) throw new Error("Expected selected option enquiry")
  expect(new URL(href).searchParams.get("text")).toBe(
    `Hello, I’d like to ask about Sandals & bags.\nOptions: Blue & white · Box of 6\n${link}`,
  )
  const multiple = itemWhatsAppUrl("+2348031234567", item, link, [
    "small-box",
    "large-pair",
  ])
  if (!multiple) throw new Error("Expected multiple option enquiry")
  expect(new URL(multiple).searchParams.get("text")).toContain(
    "Options: Blue & white · Box of 6; Brown · Size 42 · Pair",
  )
  for (const ids of [
    [],
    ["foreign"],
    ["small-box", "foreign"],
    ["small-box", "small-box"],
  ])
    expect(itemWhatsAppUrl("+2348031234567", item, link, ids)).toBeNull()
  expect(itemWhatsAppUrl(null, item, link, ["small-box"])).toBeNull()
  expect(itemWhatsAppUrl("+2348031234567", item, link)).toBe(
    productWhatsAppUrl("+2348031234567", item.name, link),
  )
})

test("enquiry actions accept IDs only, reject duplicate or unbounded selection and authored labels", () => {
  const action = { type: "whatsappEnquiry", itemId: "sandals" }
  expect(
    storefrontActionSchema.parse({ ...action, optionIds: ["pair"] }),
  ).toEqual({
    ...action,
    optionIds: ["pair"],
  })
  for (const extra of [
    { optionIds: [] },
    { optionIds: ["pair", "pair"] },
    { optionIds: Array.from({ length: 21 }, (_, index) => `pair-${index}`) },
    { optionIds: ["pair"], optionNames: ["Invented price"] },
  ])
    expect(
      storefrontActionSchema.safeParse({ ...action, ...extra }).success,
    ).toBe(false)
})

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
