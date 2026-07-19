import type { DashboardNavItem } from "@/lib/navigation"

export type DashboardSearchResult = {
  description: string
  group: "customers" | "products" | "sales" | "staff"
  href: string
  id: string
  title: string
}

export type DashboardSearchResponse = {
  query: string
  results: DashboardSearchResult[]
}

export type DashboardCommand = {
  description: string
  href: string
  id: string
  title: string
}

export function filterSearchablePages(
  navItems: DashboardNavItem[],
  query: string,
) {
  const search = query.trim().toLowerCase()

  return navItems.filter((item) =>
    search
      ? [item.label, item.description, item.href]
          .join(" ")
          .toLowerCase()
          .includes(search)
      : true,
  )
}

export function getDashboardCommands(navItems: DashboardNavItem[]) {
  const available = new Set(navItems.map((item) => item.href))
  const commands: DashboardCommand[] = []

  if (available.has("/catalog")) {
    commands.push({
      description: "Open the catalog and add a Product or Service item.",
      href: "/catalog",
      id: "create-item",
      title: "Add item",
    })
  }

  if (available.has("/staff")) {
    commands.push({
      description: "Open staff management and invite a team member.",
      href: "/staff",
      id: "invite-staff",
      title: "Invite staff",
    })
  }

  if (available.has("/inventory")) {
    commands.push({
      description: "Open inventory operations and record stock intake.",
      href: "/inventory",
      id: "record-stock-intake",
      title: "Record stock intake",
    })
  }

  return commands
}

export function filterDashboardCommands(
  commands: DashboardCommand[],
  query: string,
) {
  const search = query.trim().toLowerCase()

  return commands.filter((command) =>
    search
      ? [command.title, command.description, command.href]
          .join(" ")
          .toLowerCase()
          .includes(search)
      : true,
  )
}
