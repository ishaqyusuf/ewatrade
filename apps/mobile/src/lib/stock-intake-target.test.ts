import { describe, expect, test } from "bun:test"
import {
  type StockIntakeTargetBalance,
  parseStockIntakeTarget,
  resolveStockIntakeTarget,
} from "./stock-intake-target"

const central = {
  balanceSourceId: "central-a",
  catalogItemId: "product-a",
  storeId: "store-a",
  variantId: "variant-a",
  inventoryUnitId: "unit-a",
  onHandQuantity: "12.5",
  reservedQuantity: "2",
  availableQuantity: "10.5",
  custodyType: "STORE",
  kind: "SHARED_POOL",
}
const staff = {
  ...central,
  balanceSourceId: "staff-a",
  custodyType: "STAFF",
  onHandQuantity: "0",
  reservedQuantity: "0",
  availableQuantity: "0",
}
const otherProduct = {
  ...central,
  balanceSourceId: "central-b",
  catalogItemId: "product-b",
}
const otherStore = {
  ...central,
  balanceSourceId: "foreign-store-a",
  storeId: "store-b",
}

function resolve({
  params = { catalogItemId: "product-a", storeId: "store-a" },
  rows = [otherProduct, central, otherStore],
  storeId = "store-a",
  enabled = true,
  loading = false,
  selectedBalanceSourceId,
}: {
  params?: Parameters<typeof parseStockIntakeTarget>[0]
  rows?: StockIntakeTargetBalance[]
  storeId?: string
  enabled?: boolean
  loading?: boolean
  selectedBalanceSourceId?: string
} = {}) {
  return resolveStockIntakeTarget({
    parsed: parseStockIntakeTarget(params),
    rows,
    storeId,
    enabled,
    loading,
    selectedBalanceSourceId,
  })
}

describe("stock entry navigation context", () => {
  test("only an absent target opens generic inventory", () => {
    expect(parseStockIntakeTarget({})).toEqual({ kind: "generic" })
    const unrelatedParams = { ignored: "route-value", catalogItemId: undefined }
    expect(parseStockIntakeTarget(unrelatedParams)).toEqual({
      kind: "generic",
    })
    for (const value of [
      "",
      " product-a",
      "product-a ",
      ["product-a"],
      null,
      1,
    ])
      expect(parseStockIntakeTarget({ catalogItemId: value })).toEqual({
        kind: "invalid",
      })
    expect(parseStockIntakeTarget({ catalogItemId: "bad\nid" })).toEqual({
      kind: "invalid",
    })
    expect(parseStockIntakeTarget({ catalogItemId: "x".repeat(161) })).toEqual({
      kind: "invalid",
    })
  })

  test("all supplied selectors remain exact and require their catalog origin", () => {
    const target = {
      catalogItemId: "product-a",
      storeId: "store-a",
      variantId: "variant-a",
      inventoryUnitId: "unit-a",
      balanceSourceId: "central-a",
    }
    expect(parseStockIntakeTarget(target)).toEqual({ kind: "catalog", target })
    for (const key of [
      "storeId",
      "variantId",
      "inventoryUnitId",
      "balanceSourceId",
    ]) {
      expect(parseStockIntakeTarget({ [key]: "selector" })).toEqual({
        kind: "invalid",
      })
      expect(
        parseStockIntakeTarget({
          catalogItemId: "product-a",
          [key]: ["x", "y"],
        }),
      ).toEqual({ kind: "invalid" })
    }
  })
})

describe("authoritative stock target selection", () => {
  test("Product A never selects Product B or a matching item in another Store", () => {
    const result = resolve()
    expect(result.status).toBe("selected")
    expect(result.rows).toEqual([central])
    expect(result.selected).toBe(central)
    expect(result.selected).toMatchObject({
      onHandQuantity: "12.5",
      reservedQuantity: "2",
      availableQuantity: "10.5",
    })
  })

  test("variants, units, packaged and custody sources stay an explicit choice", () => {
    for (const second of [
      staff,
      { ...central, balanceSourceId: "variant-b", variantId: "variant-b" },
      { ...central, balanceSourceId: "unit-b", inventoryUnitId: "unit-b" },
      { ...central, balanceSourceId: "packaged", kind: "PACKAGED" },
    ]) {
      const result = resolve({ rows: [central, second] })
      expect(result.status).toBe("choose")
      expect(result.selected).toBeNull()
      expect(result.rows).toEqual([central, second])
    }
  })

  test("explicit selectors all match the same row without widening scope", () => {
    const params = {
      catalogItemId: "product-a",
      storeId: "store-a",
      variantId: "variant-a",
      inventoryUnitId: "unit-a",
      balanceSourceId: "staff-a",
    }
    expect(resolve({ params, rows: [central, staff] }).selected).toBe(staff)
    for (const patch of [
      { catalogItemId: "product-b" },
      { variantId: "variant-b" },
      { inventoryUnitId: "unit-b" },
      { balanceSourceId: "missing" },
    ]) {
      const result = resolve({
        params: { ...params, ...patch },
        rows: [central, staff],
      })
      expect(result.status).toBe("empty")
      expect(result.selected).toBeNull()
    }
  })

  test("missing target never falls back to another Product", () => {
    expect(resolve({ rows: [otherProduct, otherStore] })).toEqual({
      status: "empty",
      rows: [],
      selected: null,
    })
  })

  test("zero stock is a loaded selectable balance, not an absent balance", () => {
    const result = resolve({ rows: [staff] })
    expect(result.status).toBe("selected")
    expect(result.selected).toBe(staff)
    expect(resolve({ rows: [] }).status).toBe("empty")
  })

  test("Store change, loading, denied access and invalid routes withhold old data", () => {
    for (const [patch, status] of [
      [{ storeId: "store-b" }, "scope_changed"],
      [{ loading: true }, "loading"],
      [{ enabled: false }, "unavailable"],
      [{ params: { catalogItemId: ["product-a", "product-b"] } }, "invalid"],
    ] as const) {
      const result = resolve(patch)
      expect(result.status).toBe(status)
      expect(result.rows).toEqual([])
      expect(result.selected).toBeNull()
    }
    expect(
      resolveStockIntakeTarget({
        parsed: parseStockIntakeTarget({ catalogItemId: "product-a" }),
        rows: [central],
        storeId: undefined,
        enabled: true,
        loading: false,
      }).status,
    ).toBe("loading")
  })

  test("a removed or foreign prior selection never silently becomes the sole row", () => {
    const result = resolve({ selectedBalanceSourceId: "staff-a" })
    expect(result.status).toBe("selection_missing")
    expect(result.rows).toEqual([central])
    expect(result.selected).toBeNull()
    expect(
      resolve({ selectedBalanceSourceId: "central-b" }).selected,
    ).toBeNull()
    expect(resolve({ selectedBalanceSourceId: "central-a" }).selected).toBe(
      central,
    )
  })

  test("generic stock entry preserves manual selection within the current Store", () => {
    const result = resolve({ params: {}, rows: [central, otherStore] })
    expect(result.status).toBe("choose")
    expect(result.rows).toEqual([central])
    expect(result.selected).toBeNull()
    expect(
      resolve({ params: {}, selectedBalanceSourceId: "central-a" }).selected,
    ).toBe(central)
  })
})
