import { expect, test } from "bun:test"
import { generalAnswerSchema } from "@ewatrade/assistant/general/contracts"
import { generalOfferingStockAnswer } from "./general-offering-stock-answer"
const asOf = "2026-10-15T10:00:00.000Z"

test("offering availability keeps exact selling-unit decimals separate from base-balance quantity", () => {
  const projection = {
    availableOfferingQuantity: "9007199254740993.125",
    offeringUnitName: "crates",
    offeringName: "Large egg crate",
    variantName: "Large",
    balanceUnitName: "pieces",
    availableBalanceQuantity: "216172782113783835",
  }
  const answer = generalOfferingStockAnswer(projection, "Shop", asOf)
  expect(answer.value).toBe("9007199254740993.125 crates available")
  expect(answer.value).not.toContain("pieces")
  expect(answer.detail).toContain("after reservations")
  expect(answer.detail).toContain("variant Large")
  expect(answer.asOf).toBe(asOf)
  expect(generalAnswerSchema.safeParse(answer).success).toBe(true)
})

test("long offering units shorten labels while preserving the exact available quantity", () => {
  const answer = generalOfferingStockAnswer(
    {
      availableOfferingQuantity: "9007199254740993.125",
      offeringUnitName: "👨‍👩‍👧‍👦 units ".repeat(60),
      offeringName: "Eggs",
      variantName: "Large",
    },
    "Shop",
    asOf,
  )
  expect(answer.value).toStartWith("9007199254740993.125 ")
  expect(answer.value.length).toBeLessThanOrEqual(160)
  expect(answer.detail).toContain("labels are shortened")
  expect(generalAnswerSchema.safeParse(answer).success).toBe(true)
})

test("unavailable configuration or missing selling unit does not become zero or a base-unit guess", () => {
  expect(generalOfferingStockAnswer(null, "Shop", asOf).value).toBe(
    "Unavailable",
  )
  expect(
    generalOfferingStockAnswer(
      {
        availableOfferingQuantity: "12",
        offeringUnitName: "",
        offeringName: "Eggs",
        variantName: "Large",
      },
      "Shop",
      asOf,
    ).value,
  ).toBe("Unavailable")
  const known = generalOfferingStockAnswer(
    {
      availableOfferingQuantity: "0",
      offeringUnitName: "crates",
      offeringName: "Eggs",
      variantName: "Large",
    },
    "Shop",
    asOf,
  )
  expect(known.value).toBe("0 crates available")
  expect(known.detail).toContain("unavailable, not zero")
})
