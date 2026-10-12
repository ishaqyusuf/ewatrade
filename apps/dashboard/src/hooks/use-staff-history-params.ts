"use client"
import { staffHistoryTargetSchema } from "@ewatrade/assistant/general/contracts"
import { useQueryStates } from "nuqs"
import {
  assistantObjectParams,
  closedAssistantObjectParams,
} from "./use-assistant-receipt"

export function useStaffHistoryParams() {
  const [{ staffHistory }, setParams] = useQueryStates(assistantObjectParams, {
    history: "push",
  })
  let target: ReturnType<typeof staffHistoryTargetSchema.parse> | null = null
  if (staffHistory) {
    try {
      target = staffHistoryTargetSchema.parse(JSON.parse(staffHistory))
    } catch {}
  }
  return {
    isOpen: staffHistory !== null,
    target,
    open: (value: ReturnType<typeof staffHistoryTargetSchema.parse>) =>
      setParams({
        ...closedAssistantObjectParams,
        staffHistory: JSON.stringify(staffHistoryTargetSchema.parse(value)),
        staffMember: null,
        staffDirectory: null,
        staffInvitation: null,
      }),
    close: () => setParams({ staffHistory: null }),
  }
}
