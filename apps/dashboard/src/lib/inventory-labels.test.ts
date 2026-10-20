import { describe, expect, test } from "bun:test"
import {
  stockChangeGroup,
  stockChangeLabel,
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
})
