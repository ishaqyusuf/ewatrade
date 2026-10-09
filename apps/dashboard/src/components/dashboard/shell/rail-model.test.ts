import { describe, expect, test } from "bun:test"
import type { DashboardNavItem } from "@/lib/navigation"
import {
  getActiveFlyoutHref,
  getFlyoutLinks,
  getSectionCrumb,
  getWorkspaceInitials,
  groupRailItems,
} from "./rail-model"

function item(
  href: string,
  label: string,
  extra: Partial<DashboardNavItem> = {},
): DashboardNavItem {
  return { description: label, href, icon: "home", label, ...extra }
}

const inventory = item("/inventory", "Inventory", {
  children: [
    item("/inventory/operations", "Operations"),
    item("/inventory/transfers", "Stock transfers"),
  ],
})
const finance = item("/finance", "Finance", {
  children: [
    item("/finance", "Overview"),
    item("/finance/spending", "Spending"),
  ],
})
const nav = [
  item("/", "Overview", { end: true }),
  item("/catalog", "Catalog"),
  inventory,
  item("/sales", "Sales"),
  item("/staff", "Staff"),
  finance,
  item("/settings", "Settings"),
  item("/somewhere-new", "New"),
]

describe("rail model", () => {
  test("groups items in workshop order and keeps settings in the footer", () => {
    const { main, footer } = groupRailItems(nav)
    expect(main.map((group) => group.map((entry) => entry.href))).toEqual([
      ["/"],
      ["/sales"],
      ["/catalog", "/inventory"],
      ["/finance"],
      ["/staff"],
      ["/somewhere-new"],
    ])
    expect(footer.map((entry) => entry.href)).toEqual(["/settings"])
  })

  test("flyouts include the section page when no child points at it", () => {
    expect(getFlyoutLinks(inventory).map((link) => link.href)).toEqual([
      "/inventory",
      "/inventory/operations",
      "/inventory/transfers",
    ])
    expect(getFlyoutLinks(finance).map((link) => link.href)).toEqual([
      "/finance",
      "/finance/spending",
    ])
  })

  test("picks the most specific flyout link", () => {
    expect(getActiveFlyoutHref("/finance/spending/new", finance)).toBe(
      "/finance/spending",
    )
    expect(getActiveFlyoutHref("/finance", finance)).toBe("/finance")
  })

  test("builds the section breadcrumb", () => {
    expect(getSectionCrumb(nav, "/sales/orders/1")).toBe("Sales")
    expect(getSectionCrumb(nav, "/finance")).toBe("Finance")
    expect(getSectionCrumb(nav, "/finance/spending")).toBe("Finance · Spending")
    expect(getSectionCrumb(nav, "/inventory/transfers")).toBe(
      "Inventory · Stock transfers",
    )
    expect(getSectionCrumb(nav, "/")).toBe("Overview")
    expect(getSectionCrumb(nav, "/unknown")).toBeNull()
  })

  test("derives workspace initials", () => {
    expect(getWorkspaceInitials("Jawdah Poultry QA")).toBe("JP")
    expect(getWorkspaceInitials("ewa")).toBe("EW")
    expect(getWorkspaceInitials("  ")).toBe("?")
  })
})
