import { expect, test } from "bun:test"
import { generalAnswerSchema } from "@ewatrade/assistant/general/contracts"
import { generalInventoryTotalsAnswers } from "./general-inventory-totals"

test("inventory totals retain full exact decimals under answer bounds and declare long unit labels", () => {
  const item: Parameters<
    typeof generalInventoryTotalsAnswers
  >[0]["items"][number] = {
    availableCanonicalQuantity: "9007199254740993.125",
    canonicalUnitId: "unit",
    canonicalUnitName: "👨‍👩‍👧‍👦 unit ".repeat(50),
    custodyReferenceId: null,
    custodyType: "STORE",
    configurationVersionId: "config",
    onHandCanonicalQuantity: "9007199254741000.125",
    productId: "product",
    productName: "Eggs",
    reservedCanonicalQuantity: "7",
    storeId: "store",
    variantId: "variant",
    variantName: "Large",
    sourceCount: 2,
    key: "group",
    informationalOnly: true,
  }
  const answers = generalInventoryTotalsAnswers(
    { items: [item], nextCursor: "next" },
    { storeName: "Shop" },
  )
  expect(answers[1]?.value).toStartWith("9007199254740993.125 ")
  expect(answers[1]?.value.length).toBeLessThanOrEqual(160)
  expect(answers[1]?.detail).toContain("Unit label shortened")
  expect(answers[0]?.detail).toContain("More groups available")
  expect(
    answers.every((answer) => generalAnswerSchema.safeParse(answer).success),
  ).toBe(true)
  const unknown = generalInventoryTotalsAnswers(
    {
      items: [
        {
          ...item,
          custodyType: "TRANSIT",
          availableCanonicalQuantity: "0",
          canonicalUnitName: null,
        },
      ],
      nextCursor: null,
    },
    { storeName: "Shop" },
  )
  expect(unknown[1]?.value).toContain("unit name unavailable")
  expect(unknown[1]?.detail).toContain("Transit stock is not available to sell")
})
