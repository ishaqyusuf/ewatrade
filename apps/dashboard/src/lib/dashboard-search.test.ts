import { describe, expect, test } from "bun:test"
import {
  filterDashboardCommands,
  filterSearchablePages,
  getDashboardCommands,
} from "@/lib/dashboard-search"
import type { DashboardNavItem } from "@/lib/navigation"

const navItems: DashboardNavItem[] = [
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
  test("filters permitted pages by label, description, and href", () => {
    expect(filterSearchablePages(navItems, "stock")).toEqual([navItems[1]])
    expect(filterSearchablePages(navItems, "/staff")).toEqual([navItems[2]])
    expect(filterSearchablePages(navItems, "")).toHaveLength(3)
  })

  test("only creates commands for permitted navigation targets", () => {
    const commands = getDashboardCommands(navItems)

    expect(commands.map((command) => command.id)).toEqual([
      "create-item",
      "invite-staff",
      "record-stock-intake",
    ])
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
})
