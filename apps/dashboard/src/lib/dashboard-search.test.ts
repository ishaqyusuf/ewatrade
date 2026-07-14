import { describe, expect, test } from "bun:test"
import {
  filterDashboardCommands,
  filterSearchablePages,
  getDashboardCommands,
} from "@/lib/dashboard-search"
import type { DashboardNavItem } from "@/lib/navigation"

const navItems: DashboardNavItem[] = [
  {
    description: "Catalog and product setup",
    href: "/products",
    icon: "products",
    label: "Products",
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
      "create-product",
      "invite-staff",
      "record-stock-intake",
    ])
  })

  test("filters commands by action copy", () => {
    const commands = getDashboardCommands(navItems)

    expect(filterDashboardCommands(commands, "invite")).toEqual([commands[1]])
  })
})
