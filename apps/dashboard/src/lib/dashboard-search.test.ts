import { describe, expect, test } from "bun:test"
import {
  filterDashboardCommands,
  filterSearchablePages,
  getDashboardCommands,
  getDashboardRecordHref,
} from "@/lib/dashboard-search"
import type { DashboardNavItem } from "@/lib/navigation"

const navItems: DashboardNavItem[] = [
  {
    description: "Analytics, reports, exports, and sync review",
    href: "/analytics",
    icon: "analytics",
    label: "Reports",
    children: [
      {
        description: "Analytics and sync review",
        href: "/analytics",
        icon: "analytics",
        label: "Overview",
      },
      {
        description: "Service Commerce metrics",
        href: "/service-commerce/reports",
        icon: "analytics",
        label: "Service commerce",
      },
    ],
  },
  {
    description: "Product and service item setup",
    href: "/catalog",
    icon: "products",
    label: "Catalog",
  },
  {
    description: "Stock, inbounds, and movement controls",
    href: "/inventory",
    icon: "inventory",
    label: "Inventory",
  },
  {
    description: "Staff invitations and role administration",
    href: "/staff",
    icon: "staff",
    label: "Staff",
  },
]

describe("dashboard command search helpers", () => {
  test("record links use each destination's actual typed filter key", () => {
    const query = "Rice & beans / 5 kg"
    for (const [group, path, key] of [
      ["products", "/catalog", "catalogQuery"],
      ["sales", "/sales", "orderQuery"],
      ["customers", "/customers", "customerQuery"],
      ["staff", "/staff", "staffQuery"],
    ] as const) {
      const href = new URL(
        getDashboardRecordHref(group, query),
        "https://dashboard.test",
      )
      expect(href.pathname).toBe(path)
      expect(href.searchParams.get(key)).toBe(query)
      expect(href.searchParams.has("search")).toBe(false)
    }
    expect(
      getDashboardCommands(navItems).find(
        (command) => command.id === "record-stock-intake",
      )?.href,
    ).toBe("/inventory?inventoryOperation=receipt")
  })
  test("filters permitted pages by label, description, and href", () => {
    expect(filterSearchablePages(navItems, "stock")).toEqual([navItems[2]])
    expect(filterSearchablePages(navItems, "/staff")).toEqual([navItems[3]])
    expect(filterSearchablePages(navItems, "service commerce")).toEqual([
      navItems[0].children?.[1],
    ])
    expect(filterSearchablePages(navItems, "overview")).toEqual([
      navItems[0].children?.[0],
    ])
    expect(filterSearchablePages(navItems, "")).toHaveLength(5)
  })

  test("only creates commands for permitted navigation targets", () => {
    const commands = getDashboardCommands(navItems)

    expect(commands.map((command) => command.id)).toEqual([
      "create-item",
      "invite-staff",
      "record-stock-intake",
    ])
  })

  test("searches nested child pages and returns a duplicate href once", () => {
    const allPages = filterSearchablePages(navItems, "")
    const analyticsPages = filterSearchablePages(navItems, "/analytics")

    expect(allPages.map((item) => item.href)).toEqual([
      "/analytics",
      "/service-commerce/reports",
      "/catalog",
      "/inventory",
      "/staff",
    ])
    expect(analyticsPages).toHaveLength(1)
    expect(analyticsPages[0]?.label).toBe("Reports")
  })

  test("filters commands by action copy", () => {
    const commands = getDashboardCommands(navItems)

    expect(filterDashboardCommands(commands, "invite")).toEqual([commands[1]])
  })

  test("keeps first-record commands available when modules are hidden", () => {
    const commands = getDashboardCommands([], ["/catalog", "/staff"])

    expect(commands).toEqual([
      expect.objectContaining({
        href: "/catalog?catalogItem=create",
        id: "create-item",
      }),
      expect.objectContaining({
        href: "/staff?staffSheet=invite",
        id: "invite-staff",
      }),
    ])
  })
  test("offers the setup assistant only when the API says it is available", () => {
    expect(
      getDashboardCommands([], [], { setupAssistant: true }).map(
        (command) => command.href,
      ),
    ).toEqual(["/?setup=assistant"])
    expect(getDashboardCommands([], [])).toEqual([])
    expect(
      filterDashboardCommands(
        getDashboardCommands([], [], { setupAssistant: true }),
        "voice",
      )[0]?.id,
    ).toBe("setup-assistant")
  })
})
