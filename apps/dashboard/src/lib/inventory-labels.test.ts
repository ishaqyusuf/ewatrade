import { describe, expect, test } from "bun:test"
import {
  stockChangeGroup,
  stockChangeLabel,
  stockHistoryPageInput,
  stockHistoryTotalsInput,
  stockNetChangeText,
  stockSourceLabel,
  stockTotalsFromText,
  stockTotalsScopeNote,
  transferStatusLabel,
} from "./inventory-labels"

describe("inventory labels", () => {
  test("names every stock change in plain words", () => {
    expect(stockChangeLabel("RECEIPT")).toBe("Stock in")
    expect(stockChangeLabel("COUNT_RECONCILIATION")).toBe("Count")
    expect(stockChangeLabel("INTERNAL_USE")).toBe("Used in the business")
    expect(stockChangeLabel("receipt")).toBe("Stock in")
    expect(stockChangeLabel("SOMETHING_NEW")).toBe("Something new")
    expect(stockSourceLabel("dashboard_inventory")).toBe("Dashboard")
  })
  test("groups changes by what an owner looks for", () => {
    expect(
      stockChangeGroup({ type: "RECEIPT", canonicalNetEffect: "30" }),
    ).toBe("in")
    expect(
      stockChangeGroup({ type: "ADJUSTMENT", canonicalNetEffect: "-24" }),
    ).toBe("out")
    expect(
      stockChangeGroup({
        type: "COUNT_RECONCILIATION",
        canonicalNetEffect: "-2",
      }),
    ).toBe("count")
    expect(
      stockChangeGroup({ type: "TRANSFER", canonicalNetEffect: "0" }),
    ).toBe("move")
  })
  test("shows transfer statuses the way the Transfers page names them", () => {
    expect(transferStatusLabel("IN_TRANSIT")).toBe("On the way")
    expect(transferStatusLabel("RECEIVED")).toBe("Received")
  })

  test("Stock history URL filters become one server page input", () => {
    expect(
      stockHistoryPageInput({ storeId: "s", q: "  Row 1 ", filter: "out" }),
    ).toEqual({ storeId: "s", limit: 50, group: "out", search: "Row 1" })
    expect(stockHistoryPageInput({ q: " ", filter: "all" })).toEqual({
      storeId: undefined,
      limit: 50,
    })
    expect(stockHistoryPageInput({ filter: "sales" })).toEqual({
      storeId: undefined,
      limit: 50,
    })
  })

  test("category filters reach the page and the totals; search and group only the page", () => {
    const categories = { categoryNameIds: [4, 9], uncategorized: false }
    expect(
      stockHistoryPageInput({
        storeId: "s",
        q: "eggs",
        filter: "in",
        categories,
      }),
    ).toEqual({
      storeId: "s",
      limit: 50,
      group: "in",
      search: "eggs",
      categoryNameIds: [4, 9],
    })
    expect(stockHistoryTotalsInput({ storeId: "s", categories })).toEqual({
      storeId: "s",
      categoryNameIds: [4, 9],
    })
    const none = { categoryNameIds: [], uncategorized: true }
    expect(stockHistoryTotalsInput({ categories: none })).toEqual({
      storeId: undefined,
      uncategorized: true,
    })
    expect(
      stockHistoryTotalsInput({
        categories: { categoryNameIds: [], uncategorized: false },
      }),
    ).toEqual({ storeId: undefined })
  })

  test("totals read as signed quantities with their scope", () => {
    expect(stockNetChangeText("1180", "Egg")).toBe("+1,180 eggs")
    expect(stockNetChangeText("-24", "Egg")).toBe("−24 eggs")
    expect(stockNetChangeText("0", "Egg")).toBe("0 eggs")
    expect(stockNetChangeText("1", "Bag")).toBe("+1 bag")
    expect(stockNetChangeText("2.5", null)).toBe("+2.5")
    expect(stockTotalsFromText({ operationCount: 3, correctionCount: 1 })).toBe(
      "From 3 changes · 1 correction included",
    )
    expect(stockTotalsFromText({ operationCount: 1, correctionCount: 0 })).toBe(
      "From 1 change",
    )
    expect(stockTotalsFromText({ operationCount: 0, correctionCount: 0 })).toBe(
      "No changes",
    )
  })
  test("the totals say when search or a group only narrows the list", () => {
    const base = { storeLabel: "Main store" } as const
    expect(
      stockTotalsScopeNote({ ...base, categories: "names", filter: "all" }),
    ).toBeNull()
    expect(
      stockTotalsScopeNote({
        ...base,
        categories: "names",
        q: " house ",
        filter: "in",
      }),
    ).toBe(
      "Search “house” and Stock in only filter the list below. Net change counts every change with these categories.",
    )
    expect(
      stockTotalsScopeNote({ ...base, categories: "none", filter: "count" }),
    ).toBe(
      "Counts only filters the list below. Net change counts every change in Main store.",
    )
    expect(
      stockTotalsScopeNote({ ...base, categories: "uncategorized", q: "x" }),
    ).toBe(
      "Search “x” only filters the list below. Net change counts every change with no categories.",
    )
  })
})
