"use client"
import { staffInvitationTargetSchema } from "@ewatrade/assistant/general/contracts"
import { parseAsString, useQueryStates } from "nuqs"

export function useStaffInvitationParams() {
  const [{ staffInvitation }, setParams] = useQueryStates(
    {
      staffInvitation: parseAsString,
      staffMember: parseAsString,
      staffHistory: parseAsString,
      staffDirectory: parseAsString,
    },
    { history: "push", shallow: true },
  )
  const parsed = staffInvitationTargetSchema.safeParse({
    kind: "staff_invitation",
    commandId: staffInvitation,
  })
  return {
    isOpen: staffInvitation !== null,
    commandId: parsed.success ? parsed.data.commandId : null,
    open: (commandId: string) =>
      setParams({
        staffInvitation: staffInvitationTargetSchema.parse({
          kind: "staff_invitation",
          commandId,
        }).commandId,
        staffMember: null,
        staffHistory: null,
        staffDirectory: null,
      }),
    close: () => setParams({ staffInvitation: null }),
  }
}
