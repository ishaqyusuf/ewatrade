import { type ReportRange, resolveReportRange } from "@/lib/report-range"
import { useQueryStates } from "nuqs"
import { createLoader, parseAsIsoDate, parseAsStringEnum } from "nuqs/server"

/** URL values stay "inventory" and "service" so earlier links keep working. */
export const OPERATIONS_REPORT_TABS = ["inventory", "service"] as const

export type OperationsReportTab = (typeof OPERATIONS_REPORT_TABS)[number]

export function isOperationsReportTab(
  value: unknown,
): value is OperationsReportTab {
  return OPERATIONS_REPORT_TABS.some((tab) => tab === value)
}

const operationsReportParams = {
  from: parseAsIsoDate,
  operationsReportTab: parseAsStringEnum([...OPERATIONS_REPORT_TABS]),
  to: parseAsIsoDate,
}

export function useOperationsReportParams() {
  const [params, setParams] = useQueryStates(operationsReportParams)
  return {
    range: resolveReportRange(params),
    /** Dates and tabs are user navigation, so they create a history entry. */
    setRange: (
      range: ReportRange,
      startTransition?: (callback: () => void) => void,
    ) =>
      setParams(
        { from: range.from, to: range.to },
        { history: "push", startTransition },
      ),
    setTab: (tab: OperationsReportTab) =>
      setParams(
        { operationsReportTab: tab === "inventory" ? null : tab },
        { history: "push" },
      ),
    tab: params.operationsReportTab ?? "inventory",
  }
}

const loadOperationsReportState = createLoader(operationsReportParams)

export async function loadOperationsReportParams(
  searchParams: Parameters<typeof loadOperationsReportState>[0],
) {
  const params = await loadOperationsReportState(searchParams)
  return { range: resolveReportRange(params) }
}
