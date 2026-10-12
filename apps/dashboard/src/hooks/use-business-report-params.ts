"use client"
import {
  type BusinessReportTarget,
  businessReportTargetSchema,
} from "@ewatrade/assistant/general/business-report-target"
import { useQueryStates } from "nuqs"
import {
  assistantObjectParams,
  closedAssistantObjectParams,
} from "./use-assistant-receipt"

export function useBusinessReportParams() {
  const [{ businessReport }, setParams] = useQueryStates(
    assistantObjectParams,
    { history: "push" },
  )
  let target: BusinessReportTarget | null = null
  try {
    if (businessReport)
      target = businessReportTargetSchema.parse(JSON.parse(businessReport))
  } catch {}
  return {
    isOpen: businessReport !== null,
    target,
    open: (value: BusinessReportTarget) =>
      setParams({
        ...closedAssistantObjectParams,
        businessReport: JSON.stringify(businessReportTargetSchema.parse(value)),
      }),
    close: () => setParams({ businessReport: null }),
  }
}
