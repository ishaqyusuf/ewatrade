import { describe, expect, test } from "bun:test"
import {
  shipmentAdjustmentMinor,
  shipmentArrivalQuantity,
  shipmentArrivalStep,
  shipmentMajorToMinor,
  shipmentPriceChanges,
  shipmentRateCurrencies,
  shipmentRoundedMinor,
  shipmentUnreceivedUnitMinor,
  shipmentUnstockedChoices,
} from "./shipments"

describe("shipment UI helpers", () => {
  test("asks for one rate per foreign currency", () => {
    expect(
      shipmentRateCurrencies(
        [
          { sourceCurrencyCode: "CNY" },
          { sourceCurrencyCode: "CNY" },
          { sourceCurrencyCode: "USD" },
        ],
        "NGN",
        "NGN",
      ),
    ).toEqual(["CNY", "USD"])
  })

  test("charger override from the spec example adds 2,000", () => {
    // 10 chargers landed at 44,000 (4,400 each); owner wants 4,600 each.
    expect(
      shipmentAdjustmentMinor({
        targetUnitMinor: "460000",
        outstandingQuantity: "10",
        unreceivedCostMinor: "4400000",
      }),
    ).toBe("200000")
  })

  test("applies only to what has not arrived", () => {
    // 3 of 5 power banks arrived; 2 remain at 3,520,000 (17,600 each).
    expect(
      shipmentAdjustmentMinor({
        targetUnitMinor: "1700000",
        outstandingQuantity: "2",
        unreceivedCostMinor: "3520000",
      }),
    ).toBe("-120000")
    expect(shipmentUnreceivedUnitMinor("3520000", "2")).toBe("1760000")
    expect(shipmentUnreceivedUnitMinor("100", "3")).toBe("33")
    expect(shipmentUnreceivedUnitMinor("100", "0")).toBeNull()
  })

  test("handles fractional quantities", () => {
    expect(
      shipmentAdjustmentMinor({
        targetUnitMinor: "1000",
        outstandingQuantity: "2.5",
        unreceivedCostMinor: "2000",
      }),
    ).toBe("500")
  })

  test("parses naira entry", () => {
    expect(shipmentMajorToMinor("4,600")).toBe("460000")
    expect(shipmentMajorToMinor("4600.5")).toBe("460050")
    expect(shipmentMajorToMinor("abc")).toBeNull()
  })
  test("arrival previews keep fractional remainders exact", () => {
    expect(shipmentArrivalQuantity("0.1", "0.3")).toEqual({
      ok: true,
      quantity: "0.1",
      remaining: "0.2",
    })
    expect(shipmentArrivalQuantity("0.500000", "0.5")).toEqual({
      ok: true,
      quantity: "0.5",
      remaining: "0",
    })
    expect(shipmentArrivalQuantity("", "2.5")).toEqual({
      ok: true,
      quantity: "0",
      remaining: "2.5",
    })
    expect(shipmentArrivalQuantity("0.000001", "0.5").ok).toBe(true)
  })

  test("arrival refuses malformed, negative, overprecise and excessive quantities", () => {
    for (const value of ["1.", ".5", "bad", "-1", "1e2", "NaN", "0.0000001"])
      expect(shipmentArrivalQuantity(value, "2.5")).toEqual({
        ok: false,
        error: "invalid",
      })
    expect(shipmentArrivalQuantity("2.500001", "2.5")).toEqual({
      ok: false,
      error: "over",
    })
  })

  test("arrival stepper reaches the last fraction without binary floating point", () => {
    expect(shipmentArrivalStep("0", "0.5", 1)).toBe("0.5")
    expect(shipmentArrivalStep("2", "2.5", 1)).toBe("2.5")
    expect(shipmentArrivalStep("2.5", "2.5", -1)).toBe("1.5")
    expect(shipmentArrivalStep("0.5", "2.5", -1)).toBe("0")
    expect(shipmentArrivalStep("0.1", "2.5", 1)).toBe("1.1")
    expect(shipmentArrivalStep("1.", "2.5", 1)).toBe("1")
  })

  test("selling-price preflight refuses invalid later rows before any command", () => {
    const row = {
      name: "One",
      value: "2",
      offering: { id: "offering", revision: 4, priceMinor: 100 },
    }
    expect(
      shipmentPriceChanges([row, { ...row, name: "Two", value: "bad" }]),
    ).toEqual({
      ok: false,
      error: "Enter a valid selling price for Two (up to 1,000,000).",
    })
    expect(shipmentPriceChanges([{ ...row, value: "1000000.01" }]).ok).toBe(
      false,
    )
    expect(shipmentPriceChanges([{ ...row, value: "2.001" }]).ok).toBe(false)
    expect(shipmentPriceChanges([{ ...row, offering: null }]).ok).toBe(false)
    expect(shipmentPriceChanges([{ ...row, value: "1" }]).ok).toBe(false)
    expect(shipmentPriceChanges([{ ...row, value: "" }]).ok).toBe(false)
    expect(shipmentPriceChanges([{ ...row, value: "0" }])).toEqual({
      ok: true,
      changes: [{ offeringId: "offering", expectedRevision: 4, priceMinor: 0 }],
    })
  })

  test("selling-price preflight deduplicates shared offerings and refuses conflicting entries", () => {
    const row = {
      name: "One",
      value: "2",
      offering: { id: "offering", revision: 4, priceMinor: 100 },
    }
    expect(shipmentPriceChanges([row, row])).toEqual({
      ok: true,
      changes: [
        { offeringId: "offering", expectedRevision: 4, priceMinor: 200 },
      ],
    })
    expect(shipmentPriceChanges([row, { ...row, value: "3" }]).ok).toBe(false)
    expect(shipmentPriceChanges([{ ...row, value: "1" }, row]).ok).toBe(false)
  })

  test("rounds T1's six-place landed unit cost to whole kobo", () => {
    // Values from the 10 Nov QA run: Layer feed 17,091,746 kobo / 12 bags.
    expect(shipmentRoundedMinor("1424312.166666")).toBe("1424312")
    expect(shipmentRoundedMinor("76426.500000")).toBe("76427")
    expect(shipmentRoundedMinor("1349043.571428")).toBe("1349044")
    expect(shipmentRoundedMinor("440000")).toBe("440000")
    expect(shipmentRoundedMinor(-120000)).toBe("-120000")
    expect(shipmentRoundedMinor("-0.4")).toBe("0")
  })

  test("offers a just-added product that has no stock in the Store yet", () => {
    const item = (name: string, productId: string, variant = name) => ({
      name,
      product: { id: productId },
      variants: [
        {
          name: variant,
          offerings: [
            { id: `${productId}-service`, productUnit: null },
            { id: `${productId}-unit`, productUnit: { inventoryUnitId: "u" } },
          ],
        },
      ],
    })
    const rows = [
      { productId: "feed", custodyType: "STORE" },
      { productId: "drinker-staff", custodyType: "STAFF" },
    ]
    expect(
      shipmentUnstockedChoices(
        [
          item("Layer feed 25kg", "feed"),
          item("Poultry drinker 5L", "drinker"),
          item("Bucket", "drinker-staff", "Large"),
          { name: "Vet visit", product: null, variants: [] },
        ],
        rows,
      ),
    ).toEqual([
      { offeringId: "drinker-staff-unit", label: "Bucket · Large" },
      { offeringId: "drinker-unit", label: "Poultry drinker 5L" },
    ])
  })
})
