import { describe, expect, test } from "bun:test"
import { loadStockHistoryCategoryFilter } from "./use-stock-history-filter-params"

describe("Stock history category URL state", () => {
  test("no category params means no category filter", async () => {
    expect(await loadStockHistoryCategoryFilter({})).toEqual({
      categoryNameIds: [],
      uncategorized: false,
    })
  })

  test("reads match-all category IDs, dropping bad, repeated and extra ones", async () => {
    expect(
      await loadStockHistoryCategoryFilter({ categories: "4,9,4,0,-2,x" }),
    ).toEqual({ categoryNameIds: [4, 9], uncategorized: false })
    const many = Array.from({ length: 12 }, (_, i) => i + 1).join(",")
    expect(
      (await loadStockHistoryCategoryFilter({ categories: many }))
        .categoryNameIds,
    ).toHaveLength(10)
    expect(
      (await loadStockHistoryCategoryFilter({ categories: "3000000000" }))
        .categoryNameIds,
    ).toEqual([])
  })

  test("Uncategorized is exclusive and wins over category IDs", async () => {
    expect(
      await loadStockHistoryCategoryFilter({
        categories: "4",
        uncategorized: "true",
      }),
    ).toEqual({ categoryNameIds: [], uncategorized: true })
    expect(
      await loadStockHistoryCategoryFilter({ uncategorized: "false" }),
    ).toEqual({ categoryNameIds: [], uncategorized: false })
  })
})
