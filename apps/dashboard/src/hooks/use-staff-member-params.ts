"use client"
import {
  staffHistoryTargetSchema,
  staffMemberTargetSchema,
} from "@ewatrade/assistant/general/contracts"
import { parseAsStringLiteral, useQueryState, useQueryStates } from "nuqs"
import {
  assistantObjectParams,
  closedAssistantObjectParams,
} from "./use-assistant-receipt"

export type StaffMemberView = "access" | "suspend"

const viewParser = parseAsStringLiteral(["access", "suspend"] as const)

export function useStaffMemberParams() {
  const [{ staffMember }, setParams] = useQueryStates(assistantObjectParams, {
    history: "push",
  })
  // Change access and Suspend are views inside the member sheet, not sheets.
  const [view, setView] = useQueryState("staffMemberView", viewParser)
  const parsed = staffMemberTargetSchema.safeParse({
    kind: "staff_member",
    membershipId: staffMember,
  })
  return {
    isOpen: staffMember !== null,
    membershipId: parsed.success ? parsed.data.membershipId : null,
    view: staffMember !== null ? view : null,
    setView: (next: StaffMemberView | null) => setView(next),
    open: async (membershipId: string, next: StaffMemberView | null = null) => {
      await setView(next)
      return setParams({
        ...closedAssistantObjectParams,
        staffMember: staffMemberTargetSchema.parse({
          kind: "staff_member",
          membershipId,
        }).membershipId,
        staffHistory: null,
        staffDirectory: null,
        staffInvitation: null,
      })
    },
    close: async () => {
      await setView(null)
      return setParams({ staffMember: null })
    },
    openHistory: (membershipId: string) =>
      setParams({
        ...closedAssistantObjectParams,
        staffMember: null,
        staffDirectory: null,
        staffInvitation: null,
        staffHistory: JSON.stringify(
          staffHistoryTargetSchema.parse({
            kind: "staff_history",
            filters: { membershipId },
          }),
        ),
      }),
  }
}
