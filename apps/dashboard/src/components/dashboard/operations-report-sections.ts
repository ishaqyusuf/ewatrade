import {
  type ReportMetricGroup,
  reportMetric as metric,
} from "@/components/reports/report-metrics"

/** The `serviceReporting.summary` fields this page presents. */
export type OperationsServiceSummary = {
  commercial: { immutableServiceQuantity: number; serviceRevenueMinor: number }
  communications: { intents: number }
  work: {
    blocked: number
    completed: number
    exceptions: number
    overdueJobs: number
    ready: number
    rework: number
    wip: number
  }
}

export type OperationsInventorySummary = {
  balances: { rows: Array<{ kind: string }> }
  reconciliation: { provisionalCommands: number }
}

export function buildInventoryGroups({
  balances,
  reconciliation,
}: OperationsInventorySummary): ReportMetricGroup[] {
  const countKind = (kind: string) =>
    balances.rows.filter((row) => row.kind === kind).length
  return [
    {
      title: "Balances",
      metrics: [
        metric("Balance sources", balances.rows.length),
        metric("Shared pools", countKind("SHARED_POOL")),
        metric("Packaged balances", countKind("PACKAGED_STOCK")),
      ],
    },
    {
      title: "Offline reconciliation",
      metrics: [
        metric("Provisional commands", reconciliation.provisionalCommands),
      ],
    },
  ]
}

/** Blocked and Overdue follow the owner-approved block/failure emphasis. */
export function buildServiceGroups(
  service: OperationsServiceSummary,
): ReportMetricGroup[] {
  return [
    {
      title: "Work",
      metrics: [
        metric("Work in progress", service.work.wip),
        metric("Ready", service.work.ready),
        metric("Blocked", service.work.blocked, { tone: "block" }),
        metric("Overdue jobs", service.work.overdueJobs, { tone: "failure" }),
        metric("Completed lines", service.work.completed),
      ],
    },
    {
      title: "Quality",
      metrics: [
        metric("Exceptions", service.work.exceptions),
        metric("Rework cycles", service.work.rework),
      ],
    },
    {
      title: "Communications",
      metrics: [metric("Message intents", service.communications.intents)],
    },
  ]
}
