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

export function getDashboardRecordHref(
  group: DashboardSearchResult["group"],
  query: string,
) {
  const targets = {
    products: ["/catalog", "catalogQuery"],
    sales: ["/sales", "orderQuery"],
    customers: ["/customers", "customerQuery"],
    staff: ["/staff", "staffQuery"],
  } as const
  const [path, key] = targets[group]
  return `${path}?${new URLSearchParams({ [key]: query })}`
}

export type DashboardCommand = {
  description: string
  href: string
  id: string
  title: string
}

function flattenPages(navItems: DashboardNavItem[]): DashboardNavItem[] {
  return navItems.flatMap(({ children, ...item }) => [
    item,
    ...flattenPages(children ?? []),
  ])
}

export function filterSearchablePages(
  navItems: DashboardNavItem[],
  query: string,
) {
  const search = query.trim().toLowerCase()

  const seen = new Set<string>()

  return flattenPages(navItems).filter((item) => {
    const matches =
      !search ||
      [item.label, item.description, item.href]
        .join(" ")
        .toLowerCase()
        .includes(search)
    if (!matches || seen.has(item.href)) return false

    seen.add(item.href)
    return true
  })
}

export function getDashboardCommands(
  navItems: DashboardNavItem[],
  accessiblePaths: string[] = [],
  options: { setupAssistant?: boolean } = {},
) {
  const available = new Set([
    ...flattenPages(navItems).map((item) => item.href),
    ...accessiblePaths,
  ])
  const commands: DashboardCommand[] = []

  // The setup assistant stays reachable after the first Catalog item.
  if (options.setupAssistant) {
    commands.push({
      description:
        "Add products, stock, customers and balances by chat, voice note or photo.",
      href: "/?setup=assistant",
      id: "setup-assistant",
      title: "Set up with the assistant",
    })
  }

  if (available.has("/catalog")) {
    commands.push({
      description: "Open the catalog and add a Product or Service item.",
      href: "/catalog?catalogItem=create",
      id: "create-item",
      title: "Add item",
    })
  }

  if (available.has("/staff")) {
    commands.push({
      description: "Open staff management and invite a team member.",
      href: "/staff?staffSheet=invite",
      id: "invite-staff",
      title: "Invite staff",
    })
  }

  if (available.has("/inventory")) {
    commands.push({
      description: "Open inventory operations and record stock intake.",
      href: "/inventory?inventoryOperation=receipt",
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
