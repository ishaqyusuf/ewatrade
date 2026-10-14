"use client"
import {
  type StaffActivityTarget,
  staffActivityTargetSchema,
} from "@ewatrade/assistant/general/staff-activity-target"
import { useQueryStates } from "nuqs"
import {
  assistantObjectParams,
  closedAssistantObjectParams,
} from "./use-assistant-receipt"

export function useStaffActivityParams() {
  const [{ staffActivity }, setParams] = useQueryStates(assistantObjectParams, {
    history: "push",
  })
  let target: StaffActivityTarget | null = null
  if (staffActivity) {
    try {
      target = staffActivityTargetSchema.parse(JSON.parse(staffActivity))
    } catch {}
  }
  return {
    isOpen: staffActivity !== null,
    target,
    open: (value: StaffActivityTarget) =>
      setParams({
        ...closedAssistantObjectParams,
        staffActivity: JSON.stringify(staffActivityTargetSchema.parse(value)),
      }),
    close: () => setParams({ staffActivity: null }),
  }
}
