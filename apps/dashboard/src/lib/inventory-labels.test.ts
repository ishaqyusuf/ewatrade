import { describe, expect, test } from "bun:test"
import {
  stockChangeGroup,
  stockChangeLabel,
  stockHistoryPageInput,
  stockHistoryTotalsInput,
  stockSourceLabel,
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
})
