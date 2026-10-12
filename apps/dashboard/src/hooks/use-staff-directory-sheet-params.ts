"use client"
import { staffDirectoryTargetSchema } from "@ewatrade/assistant/general/contracts"
import { useQueryStates } from "nuqs"
import {
  assistantObjectParams,
  closedAssistantObjectParams,
} from "./use-assistant-receipt"

export function useStaffDirectorySheetParams() {
  const [{ staffDirectory }, setParams] = useQueryStates(
    assistantObjectParams,
    { history: "push" },
  )
  let target: ReturnType<typeof staffDirectoryTargetSchema.parse> | null = null
  if (staffDirectory) {
    try {
      target = staffDirectoryTargetSchema.parse(JSON.parse(staffDirectory))
    } catch {}
  }
  return {
    isOpen: staffDirectory !== null,
    target,
    open: (value: ReturnType<typeof staffDirectoryTargetSchema.parse>) =>
      setParams({
        ...closedAssistantObjectParams,
        staffDirectory: JSON.stringify(staffDirectoryTargetSchema.parse(value)),
        staffMember: null,
        staffInvitation: null,
        staffHistory: null,
      }),
    close: () => setParams({ staffDirectory: null }),
  }
}
