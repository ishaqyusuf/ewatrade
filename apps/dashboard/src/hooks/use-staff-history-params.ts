"use client"
import { staffHistoryTargetSchema } from "@ewatrade/assistant/general/contracts"
import { parseAsString, useQueryStates } from "nuqs"

export function useStaffHistoryParams() {
  const [{ staffHistory }, setParams] = useQueryStates(
    {
      staffHistory: parseAsString,
      staffMember: parseAsString,
      staffDirectory: parseAsString,
    },
    { history: "push" },
  )
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
        staffHistory: JSON.stringify(staffHistoryTargetSchema.parse(value)),
        staffMember: null,
        staffDirectory: null,
      }),
    close: () => setParams({ staffHistory: null }),
  }
}
