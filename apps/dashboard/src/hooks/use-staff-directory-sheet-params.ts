"use client"
import { staffDirectoryTargetSchema } from "@ewatrade/assistant/general/contracts"
import { parseAsString, useQueryStates } from "nuqs"

export function useStaffDirectorySheetParams() {
  const [{ staffDirectory }, setParams] = useQueryStates(
    {
      staffDirectory: parseAsString,
      staffMember: parseAsString,
      staffHistory: parseAsString,
    },
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
        staffDirectory: JSON.stringify(staffDirectoryTargetSchema.parse(value)),
        staffMember: null,
        staffHistory: null,
      }),
    close: () => setParams({ staffDirectory: null }),
  }
}
