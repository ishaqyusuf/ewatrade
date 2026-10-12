"use client"
import {
  staffHistoryTargetSchema,
  staffMemberTargetSchema,
} from "@ewatrade/assistant/general/contracts"
import { parseAsString, useQueryStates } from "nuqs"

export function useStaffMemberParams() {
  const [{ staffMember }, setParams] = useQueryStates(
    {
      staffMember: parseAsString,
      staffHistory: parseAsString,
      staffDirectory: parseAsString,
    },
    { history: "push" },
  )
  const parsed = staffMemberTargetSchema.safeParse({
    kind: "staff_member",
    membershipId: staffMember,
  })
  return {
    isOpen: staffMember !== null,
    membershipId: parsed.success ? parsed.data.membershipId : null,
    open: (membershipId: string) =>
      setParams({
        staffMember: staffMemberTargetSchema.parse({
          kind: "staff_member",
          membershipId,
        }).membershipId,
        staffHistory: null,
        staffDirectory: null,
      }),
    close: () => setParams({ staffMember: null }),
    openHistory: (membershipId: string) =>
      setParams({
        staffMember: null,
        staffDirectory: null,
        staffHistory: JSON.stringify(
          staffHistoryTargetSchema.parse({
            kind: "staff_history",
            filters: { membershipId },
          }),
        ),
      }),
  }
}
