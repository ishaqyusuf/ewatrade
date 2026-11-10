import { describe, expect, test } from "bun:test"
import {
  buildShipmentDraftInput,
  emptyShipmentDraft,
  emptyShipmentLine,
  shipmentHandFreightLeftMinor,
  shipmentMissingRates,
} from "./shipment-draft"

const context = {
  bookId: "book",
  storeId: "store",
  bookCurrencyCode: "NGN",
  clientCommandId: "cmd",
  choices: [
    { balanceSourceId: "bal-ch", inventoryUnitId: "unit-ch", label: "Charger" },
  ],
  today: "2026-11-10",
}

function chinaDraft() {
  const draft = emptyShipmentDraft("a")
  const blank = emptyShipmentLine("a")
  draft.supplierId = "sup"
  draft.name = "China consignment · Nov"
  draft.freightAmount = "12000"
  draft.lines = [
    {
      ...blank,
      balanceSourceId: "bal-ch",
      expectedQuantity: "10",
      sourceUnitPrice: "20",
    },
    {
      ...blank,
      key: "b",
      proposedName: "Power bank",
      expectedQuantity: "5",
      sourceUnitPrice: "80",
    },
  ]
  return draft
}

describe("shipment draft", () => {
  test("refuses a missing rate, then builds the T1 body", () => {
    const draft = chinaDraft()
    expect(shipmentMissingRates(draft, "NGN")).toEqual(["CNY"])
    expect(buildShipmentDraftInput(draft, context)).toEqual({
      ok: false,
      error: "Enter a rate for CNY.",
    })
    draft.rates.CNY = { rate: "200", rateDate: "2026-11-09", source: "Bank" }
    const result = buildShipmentDraftInput(draft, context)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.input.lines).toEqual([
      {
        description: "Charger",
        balanceSourceId: "bal-ch",
        enteredInventoryUnitId: "unit-ch",
        expectedQuantity: "10",
        sourceCurrencyCode: "CNY",
        sourceUnitPrice: "20",
      },
      {
        description: "Power bank",
        proposedName: "Power bank",
        expectedQuantity: "5",
        sourceCurrencyCode: "CNY",
        sourceUnitPrice: "80",
      },
    ])
    expect(result.input.rates[0]?.currencyCode).toBe("CNY")
  })

  test("by-hand freight sends overrides and tracks what is left", () => {
    const draft = chinaDraft()
    draft.rates.CNY = { rate: "200", rateDate: "2026-11-09", source: "Bank" }
    draft.split = "hand"
    draft.lines = draft.lines.map((line, index) => ({
      ...line,
      freightOverride: index ? "8000" : "3000",
    }))
    expect(shipmentHandFreightLeftMinor(draft, "1200000")).toBe(BigInt(100000))
    const result = buildShipmentDraftInput(draft, context)
    expect(
      result.ok && result.input.lines.map((l) => l.freightOverrideMinor),
    ).toEqual(["300000", "800000"])
  })
})
