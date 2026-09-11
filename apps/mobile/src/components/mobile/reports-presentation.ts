export const REPORTS_COPY = {
  boundaryMessage:
    "Compatible totals do not become available stock automatically. Exports keep exact posted values.",
  boundaryTitle: "About stock totals",
  emptyMessage:
    "Reports will fill in as you take orders and track stock or service work.",
  emptyTitle: "No activity yet",
  purpose: "A current snapshot of orders, stock records, and service work.",
} as const

type ServiceReportCounts = {
  blocked: number
  overdueJobs: number
  ready: number
  wip: number
}

type ReportsPresentationInput = {
  balanceSources: number
  orderCount: number
  orderValueMinor: number
  provisionalCommands: number
  service: ServiceReportCounts
}

export function buildReportsPresentation(input: ReportsPresentationInput) {
  const { service } = input
  const isEmpty =
    input.balanceSources === 0 &&
    input.orderCount === 0 &&
    input.orderValueMinor === 0 &&
    input.provisionalCommands === 0 &&
    service.blocked === 0 &&
    service.overdueJobs === 0 &&
    service.ready === 0 &&
    service.wip === 0

  return {
    isEmpty,
    operations: [
      {
        detail:
          input.balanceSources === 0
            ? "No balance sources yet"
            : `${input.balanceSources} balance ${input.balanceSources === 1 ? "source" : "sources"}`,
        id: "inventory" as const,
        label: "Inventory",
        value: String(input.balanceSources),
      },
      {
        detail:
          input.provisionalCommands === 0
            ? "No provisional records"
            : `${input.provisionalCommands} provisional ${input.provisionalCommands === 1 ? "record" : "records"}`,
        id: "pending" as const,
        label: "Pending records",
        value: String(input.provisionalCommands),
      },
      {
        detail: `${service.ready} ready · ${service.blocked} blocked · ${service.overdueJobs} overdue`,
        id: "service" as const,
        label: "Service work",
        value: `${service.wip} WIP`,
      },
    ],
  }
}
