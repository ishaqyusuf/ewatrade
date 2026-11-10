import { describe, expect, test } from "bun:test"
import {
  shipmentAdjustmentMinor,
  shipmentMajorToMinor,
  shipmentRateCurrencies,
  shipmentUnreceivedUnitMinor,
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
})
