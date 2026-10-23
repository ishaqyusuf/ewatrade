import { expect, test } from "bun:test"
import { storefrontServiceRequestSchema } from "./storefront-request"
const single = {
  clientRequestId: "c090da8c-782a-4da6-8d4f-0b067037598a",
  formId: "form",
  itemId: "item",
  offeringId: "one",
  quantity: "2",
  customerName: "Demo",
  customerPhone: "08030000000",
  details: "",
}
test("optional multi-line request keeps legacy input and validates every line and the primary hint", () => {
  expect(storefrontServiceRequestSchema.safeParse(single).success).toBe(true)
  const lines = [
    { offeringId: "one", quantity: "2" },
    { offeringId: "two", quantity: "3" },
  ]
  expect(
    storefrontServiceRequestSchema.safeParse({ ...single, lines }).success,
  ).toBe(true)
  for (const changed of [
    [],
    [lines[0], lines[0]],
    [{ offeringId: "two", quantity: "2" }],
    [lines[0], { offeringId: "two", quantity: "0" }],
    Array.from({ length: 21 }, (_, i) => ({
      offeringId: `option-${i}`,
      quantity: "1",
    })),
  ])
    expect(
      storefrontServiceRequestSchema.safeParse({ ...single, lines: changed })
        .success,
    ).toBe(false)
})
