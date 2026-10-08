import { useQueryStates } from "nuqs"
import { parseAsStringEnum } from "nuqs/server"

export const OPERATIONS_REPORT_TABS = ["inventory", "service"] as const

export type OperationsReportTab = (typeof OPERATIONS_REPORT_TABS)[number]

export function isOperationsReportTab(
  value: unknown,
): value is OperationsReportTab {
  return OPERATIONS_REPORT_TABS.some((tab) => tab === value)
}

const operationsReportParams = {
  operationsReportTab: parseAsStringEnum([...OPERATIONS_REPORT_TABS]),
}

export function useOperationsReportParams() {
  const [params, setParams] = useQueryStates(operationsReportParams)
  return {
    /** Tabs are user navigation, so they create a history entry. */
    setTab: (tab: OperationsReportTab) =>
      setParams(
        { operationsReportTab: tab === "inventory" ? null : tab },
        { history: "push" },
      ),
    tab: params.operationsReportTab ?? "inventory",
  }
}
