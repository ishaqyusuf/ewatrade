import { describe, expect, test } from "bun:test"

import {
  deriveServiceCommerceQuoteOptionState,
  serviceCommerceQuoteOptionProjectionSchema,
  serviceCommerceQuoteOptionSelectionCommandSchema,
} from "./schemas/quote-options"

const option = (id: string, totalMinor: number) =>
  serviceCommerceQuoteOptionProjectionSchema.parse({
    availabilityOutcome: "full",
    currencyCode: "NGN",
    discountMinor: 0,
    fulfilmentFeeMinor: 0,
    fulfilmentType: "pickup",
    id,
    label: id === "red" ? "Red small" : "Black large",
    lines: [
      {
        catalogItemName: "Bag",
        offeringName: id,
        quantity: "1",
        totalMinor,
        unitPriceMinor: totalMinor,
        variantName: id,
      },
    ],
    position: id === "red" ? 0 : 1,
    subtotalMinor: totalMinor,
    taxMinor: 0,
    totalMinor,
  })

describe("Service Commerce Quote Options", () => {
  test("maps one simple Quote to its payable default option", () => {
    expect(
      deriveServiceCommerceQuoteOptionState({
        options: [option("default", 20_000)],
        selectedOptionId: null,
      }),
    ).toEqual({
      payableOptionId: "default",
      requiresSelection: false,
    })
  })

  test("keeps mutually exclusive alternatives non-payable until selected", () => {
    const options = [option("red", 20_000), option("black", 30_000)]
    expect(
      deriveServiceCommerceQuoteOptionState({
        options,
        selectedOptionId: null,
      }),
    ).toEqual({ payableOptionId: null, requiresSelection: true })
    expect(
      deriveServiceCommerceQuoteOptionState({
        options,
        selectedOptionId: "black",
      }),
    ).toEqual({ payableOptionId: "black", requiresSelection: false })
  })

  test("fails closed for an unknown selected option or malformed totals", () => {
    expect(() =>
      deriveServiceCommerceQuoteOptionState({
        options: [option("red", 20_000), option("black", 30_000)],
        selectedOptionId: "missing",
      }),
    ).toThrow("selected Quote Option")
    expect(
      serviceCommerceQuoteOptionProjectionSchema.safeParse({
        ...option("red", 20_000),
        totalMinor: 19_999,
      }).success,
    ).toBe(false)
    expect(
      serviceCommerceQuoteOptionProjectionSchema.safeParse({
        ...option("red", 20_000),
        lines: [{ ...option("red", 20_000).lines[0], quantity: "0" }],
      }).success,
    ).toBe(false)
  })

  test("requires one opaque option and command identity for selection", () => {
    expect(
      serviceCommerceQuoteOptionSelectionCommandSchema.parse({
        acceptanceToken: "opaque-quote-capability",
        clientSelectionId: "selection-command-1",
        optionId: "option-red",
      }),
    ).toEqual({
      acceptanceToken: "opaque-quote-capability",
      clientSelectionId: "selection-command-1",
      optionId: "option-red",
    })
    expect(
      serviceCommerceQuoteOptionSelectionCommandSchema.safeParse({
        acceptanceToken: "",
        clientSelectionId: "selection-command-1",
        optionId: "option-red",
      }).success,
    ).toBe(false)
  })
})
