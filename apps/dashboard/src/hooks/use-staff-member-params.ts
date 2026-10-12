"use client"
import {
  staffHistoryTargetSchema,
  staffMemberTargetSchema,
} from "@ewatrade/assistant/general/contracts"
import { useQueryStates } from "nuqs"
import {
  assistantObjectParams,
  closedAssistantObjectParams,
} from "./use-assistant-receipt"

export function useStaffMemberParams() {
  const [{ staffMember }, setParams] = useQueryStates(assistantObjectParams, {
    history: "push",
  })
  const parsed = staffMemberTargetSchema.safeParse({
    kind: "staff_member",
    membershipId: staffMember,
  })
  return {
    isOpen: staffMember !== null,
    membershipId: parsed.success ? parsed.data.membershipId : null,
    open: (membershipId: string) =>
      setParams({
        ...closedAssistantObjectParams,
        staffMember: staffMemberTargetSchema.parse({
          kind: "staff_member",
          membershipId,
        }).membershipId,
        staffHistory: null,
        staffDirectory: null,
        staffInvitation: null,
      }),
    close: () => setParams({ staffMember: null }),
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
