import { describe, expect, test } from "bun:test"
import {
  allocateShipmentFreight,
  computeShipmentCosting,
  shipmentLandedUnitMinor,
  shipmentReceiptCostMinor,
} from "./shipment-costing"

const chargers = {
  position: 1,
  expectedQuantity: "10",
  sourceCurrencyCode: "CNY",
  sourceUnitPrice: "20",
}
const powerBanks = {
  position: 2,
  expectedQuantity: "5",
  sourceCurrencyCode: "CNY",
  sourceUnitPrice: "80",
}
const china = {
  bookCurrencyCode: "NGN",
  rates: [{ currencyCode: "CNY", rate: "200" }],
  freightAmount: "12000",
  freightCurrencyCode: "NGN",
  lines: [chargers, powerBanks],
}

describe("shipment costing", () => {
  test("China consignment worked example reconciles exactly", () => {
    const costing = computeShipmentCosting(china)
    expect(costing.lines).toEqual([
      {
        position: 1,
        goodsMinor: BigInt(4_000_000),
        freightMinor: BigInt(400_000),
        adjustmentMinor: BigInt(0),
        landedMinor: BigInt(4_400_000),
      },
      {
        position: 2,
        goodsMinor: BigInt(8_000_000),
        freightMinor: BigInt(800_000),
        adjustmentMinor: BigInt(0),
        landedMinor: BigInt(8_800_000),
      },
    ])
    expect(costing.goodsMinor).toBe(BigInt(12_000_000))
    expect(costing.freightMinor).toBe(BigInt(1_200_000))
    expect(costing.landedMinor).toBe(BigInt(13_200_000))
    expect(shipmentLandedUnitMinor(BigInt(4_400_000), "10")).toBe("440000")
    expect(shipmentLandedUnitMinor(BigInt(8_800_000), "5")).toBe("1760000")
  })

  test("reviewed charger adjustment is attributed, not absorbed", () => {
    const costing = computeShipmentCosting({
      ...china,
      lines: [{ ...chargers, adjustmentMinor: BigInt(200_000) }, powerBanks],
    })
    const [charger] = costing.lines
    expect(charger?.landedMinor).toBe(BigInt(4_600_000))
    expect(
      shipmentLandedUnitMinor(charger?.landedMinor ?? BigInt(0), "10"),
    ).toBe("460000")
    expect(costing.adjustmentMinor).toBe(BigInt(200_000))
    expect(costing.landedMinor).toBe(
      costing.goodsMinor + costing.freightMinor + costing.adjustmentMinor,
    )
  })

  test("refuses a missing, unused or book-currency rate", () => {
    expect(() => computeShipmentCosting({ ...china, rates: [] })).toThrow(
      "Enter the NGN rate for 1 CNY.",
    )
    expect(() =>
      computeShipmentCosting({
        ...china,
        rates: [...china.rates, { currencyCode: "USD", rate: "1500" }],
      }),
    ).toThrow("Remove the unused USD rate.")
    expect(() =>
      computeShipmentCosting({
        ...china,
        rates: [...china.rates, { currencyCode: "NGN", rate: "1" }],
      }),
    ).toThrow("NGN needs no exchange rate.")
    expect(() =>
      computeShipmentCosting({
        ...china,
        rates: [{ currencyCode: "CNY", rate: "0" }],
      }),
    ).toThrow()
  })

  test("converts foreign freight with its own pinned rate", () => {
    const costing = computeShipmentCosting({
      ...china,
      rates: [...china.rates, { currencyCode: "USD", rate: "1500.25" }],
      freightAmount: "8",
      freightCurrencyCode: "USD",
    })
    expect(costing.freightMinor).toBe(BigInt(1_200_200))
    expect(costing.lines.reduce((s, l) => s + l.freightMinor, BigInt(0))).toBe(
      costing.freightMinor,
    )
  })

  test("rounding remainder is deterministic and exact", () => {
    const shares = allocateShipmentFreight(BigInt(100), [
      { position: 1, goodsMinor: BigInt(1) },
      { position: 2, goodsMinor: BigInt(1) },
      { position: 3, goodsMinor: BigInt(1) },
    ])
    expect([...shares.entries()]).toEqual([
      [1, BigInt(34)],
      [2, BigInt(33)],
      [3, BigInt(33)],
    ])
  })

  test("overrides are honoured and the rest is split by value", () => {
    const shares = allocateShipmentFreight(BigInt(1_000), [
      {
        position: 1,
        goodsMinor: BigInt(100),
        freightOverrideMinor: BigInt(700),
      },
      { position: 2, goodsMinor: BigInt(100) },
      { position: 3, goodsMinor: BigInt(200) },
    ])
    expect(shares.get(1)).toBe(BigInt(700))
    expect(shares.get(2)).toBe(BigInt(100))
    expect(shares.get(3)).toBe(BigInt(200))
    expect(() =>
      allocateShipmentFreight(BigInt(100), [
        {
          position: 1,
          goodsMinor: BigInt(1),
          freightOverrideMinor: BigInt(101),
        },
      ]),
    ).toThrow("Freight overrides exceed the shipment freight.")
    expect(() =>
      allocateShipmentFreight(BigInt(100), [
        {
          position: 1,
          goodsMinor: BigInt(1),
          freightOverrideMinor: BigInt(60),
        },
      ]),
    ).toThrow("Allocate all shipment freight across the lines.")
  })

  test("zero goods value needs explicit freight", () => {
    expect(() =>
      allocateShipmentFreight(BigInt(500), [
        { position: 1, goodsMinor: BigInt(0) },
        { position: 2, goodsMinor: BigInt(0) },
      ]),
    ).toThrow("Goods value is zero; enter each line's freight explicitly.")
    const explicit = allocateShipmentFreight(BigInt(500), [
      { position: 1, goodsMinor: BigInt(0), freightOverrideMinor: BigInt(200) },
      { position: 2, goodsMinor: BigInt(0), freightOverrideMinor: BigInt(300) },
    ])
    expect(explicit.get(2)).toBe(BigInt(300))
    expect(
      allocateShipmentFreight(BigInt(0), [
        { position: 1, goodsMinor: BigInt(0) },
      ]).get(1),
    ).toBe(BigInt(0))
  })

  test("partial receipts take a share and the last one takes the remainder", () => {
    const landedMinor = BigInt(1_000)
    const first = shipmentReceiptCostMinor({
      landedMinor,
      receivedCostMinor: BigInt(0),
      expectedQuantity: "3",
      receivedQuantity: "0",
      quantity: "1",
    })
    expect(first).toBe(BigInt(333))
    const second = shipmentReceiptCostMinor({
      landedMinor,
      receivedCostMinor: first,
      expectedQuantity: "3",
      receivedQuantity: "1",
      quantity: "1.5",
    })
    expect(second).toBe(BigInt(500))
    const last = shipmentReceiptCostMinor({
      landedMinor,
      receivedCostMinor: first + second,
      expectedQuantity: "3",
      receivedQuantity: "2.5",
      quantity: "0.5",
    })
    expect(first + second + last).toBe(landedMinor)
    expect(() =>
      shipmentReceiptCostMinor({
        landedMinor,
        receivedCostMinor: BigInt(0),
        expectedQuantity: "3",
        receivedQuantity: "2",
        quantity: "2",
      }),
    ).toThrow("Received quantity exceeds the outstanding expected quantity.")
  })

  test("half-up conversion rounding to the minor unit", () => {
    const costing = computeShipmentCosting({
      bookCurrencyCode: "NGN",
      rates: [{ currencyCode: "CNY", rate: "200.0049" }],
      freightAmount: "0",
      freightCurrencyCode: "NGN",
      lines: [
        {
          position: 1,
          expectedQuantity: "1",
          sourceCurrencyCode: "CNY",
          sourceUnitPrice: "1",
        },
      ],
    })
    // 200.0049 NGN = 20000.49 kobo → 20000
    expect(costing.lines[0]?.goodsMinor).toBe(BigInt(20_000))
  })
})
