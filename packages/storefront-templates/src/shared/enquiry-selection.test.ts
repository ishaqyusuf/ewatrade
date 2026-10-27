import { expect, test } from "bun:test"
import { storefrontActionSchema } from "../../../storefront-contracts/src/actions"
import { productWhatsAppUrl } from "../../../storefront-runtime/src/links"
import { enquirySelection } from "./commerce"

const item = { id: "service-one" }
const options = [
  { id: "offering-one", name: "Shirt cleaning" },
  { id: "offering-two", name: "Ironing" },
  { id: "offering-three", name: "Same-day" },
]
const text = (selectedOptions: readonly { name: string }[] | null) => {
  if (selectedOptions === null) return null
  const href = productWhatsAppUrl(
    "+2348000000000",
    "Laundry",
    "https://synthetic.localhost/?item=service-one",
    selectedOptions,
  )
  return href ? new URL(href).searchParams.get("text") : null
}

test("every picked option travels as public IDs in listed order with matching labels", () => {
  const { action, selectedOptions } = enquirySelection(item, options, [
    "offering-three",
    "offering-one",
  ])
  expect(action).toEqual({
    type: "whatsappEnquiry",
    itemId: "service-one",
    optionIds: ["offering-one", "offering-three"],
  })
  expect(storefrontActionSchema.safeParse(action).success).toBe(true)
  expect(selectedOptions?.map((option) => option.name)).toEqual([
    "Shirt cleaning",
    "Same-day",
  ])
  expect(text(selectedOptions)).toContain("Options: Shirt cleaning; Same-day")
})

test("a cleared selection stays the generic enquiry, never an implicit first option", () => {
  const { action, selectedOptions } = enquirySelection(item, options, [])
  expect(action).toEqual({ type: "whatsappEnquiry", itemId: "service-one" })
  expect(storefrontActionSchema.safeParse(action).success).toBe(true)
  expect(selectedOptions).toEqual([])
  expect(text(selectedOptions)).not.toContain("Options:")
})

test("stale, foreign or duplicate selections withhold the entire enquiry", () => {
  for (const ids of [
    ["stale-offering", "offering-two"],
    ["foreign"],
    ["offering-two", "offering-two"],
  ]) {
    const { action, selectedOptions } = enquirySelection(item, options, ids)
    expect(action).toBeNull()
    expect(text(selectedOptions)).toBeNull()
  }
})

test("more picks than the contract allows yields no enquiry action", () => {
  const many = Array.from({ length: 21 }, (_, index) => ({
    id: `offering-${index}`,
    name: `Option ${index}`,
  }))
  const result = enquirySelection(
    item,
    many,
    many.map((option) => option.id),
  )
  expect(result.action).toBeNull()
  expect(text(result.selectedOptions)).toBeNull()
})
