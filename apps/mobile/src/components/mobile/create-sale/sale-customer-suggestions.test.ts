import { expect, test } from "bun:test"
import { buildSaleCustomerSuggestions } from "./sale-customer-suggestions"

test("same-name saved Customers retain separate financial identities", () => {
  const common = {
    name: "Ada",
    email: null,
    phone: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  const suggestions = buildSaleCustomerSuggestions(
    [],
    [
      { ...common, id: "customer-a" },
      { ...common, id: "customer-b" },
    ],
  )
  expect(suggestions.map((row) => row.directoryId)).toEqual([
    "customer-a",
    "customer-b",
  ])
  expect(suggestions.map((row) => row.id)).toEqual(["customer-a", "customer-b"])
})
