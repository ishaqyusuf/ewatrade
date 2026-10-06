import { describe, expect, it } from "bun:test"
import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import {
  inventoryQuantityTotal,
  inventoryQuantityUnits,
} from "./inventory-quantity"

const balance = {
  productId: "eggs",
  configurationVersionId: "current-eggs",
  inventoryUnitId: "egg",
  inventoryUnitName: "Egg",
  inventoryUnitFactor: "1",
  inventoryUnitTransactionScale: 0,
  kind: "SHARED_POOL",
}
const crate = {
  id: "crate",
  name: "Crate",
  factor: "30",
  transactionScale: 0,
  stockBehavior: "alternate_transaction",
}
const tray = {
  id: "tray",
  name: "Tray",
  factor: "12",
  transactionScale: 0,
  stockBehavior: "packaged_stock",
}
const configuration = {
  id: "current-eggs",
  productId: "eggs",
  status: "current",
  units: [crate, tray],
}

describe("inventory quantity units", () => {
  it("defaults to the base and includes only compatible alternate units", () => {
    const units = inventoryQuantityUnits(balance, configuration, true)
    expect(units.map((unit) => unit.id)).toEqual(["egg", "crate"])
    expect(inventoryQuantityUnits(undefined, configuration, true)).toEqual([])
  })
  it("keeps packaged balances and non-converting commands in their own unit", () => {
    expect(
      inventoryQuantityUnits(
        { ...balance, kind: "PACKAGED_STOCK", inventoryUnitId: tray.id },
        configuration,
        true,
      ).map((unit) => unit.id),
    ).toEqual(["tray"])
    expect(
      inventoryQuantityUnits(balance, configuration, false).map(
        (unit) => unit.id,
      ),
    ).toEqual(["egg"])
  })
  it("rejects other products and obsolete or mismatched configurations", () => {
    for (const config of [
      { ...configuration, productId: "broiler" },
      { ...configuration, id: "old-eggs" },
      { ...configuration, status: "superseded" },
    ])
      expect(
        inventoryQuantityUnits(balance, config, true).map((unit) => unit.id),
      ).toEqual(["egg"])
  })
  it("converts using saved exact factors without converting twice", () => {
    expect(inventoryQuantityTotal("2", crate, balance)).toEqual({
      enteredQuantity: parseExactDecimal("2"),
      balanceQuantity: parseExactDecimal("60"),
    })
    expect(
      inventoryQuantityTotal(
        "200",
        {
          id: "egg",
          name: "Egg",
          factor: "1",
          transactionScale: 0,
          stockBehavior: "canonical_shared",
        },
        balance,
      ).balanceQuantity,
    ).toBe(parseExactDecimal("200"))
    expect(
      inventoryQuantityTotal(
        "0.3",
        { ...crate, factor: "0.1", transactionScale: 1 },
        balance,
      ).balanceQuantity,
    ).toBe(parseExactDecimal("0.03"))
    expect(
      inventoryQuantityTotal("2", tray, { ...balance, kind: "PACKAGED_STOCK" })
        .balanceQuantity,
    ).toBe(parseExactDecimal("2"))
  })
  it("validates unit precision and permits zero only for a count", () => {
    expect(() => inventoryQuantityTotal("1.5", crate, balance)).toThrow()
    expect(() => inventoryQuantityTotal("0", crate, balance)).toThrow()
    expect(() => inventoryQuantityTotal("-2", crate, balance)).toThrow()
    expect(
      inventoryQuantityTotal("0", crate, balance, true).balanceQuantity,
    ).toBe(parseExactDecimal("0"))
  })
})
