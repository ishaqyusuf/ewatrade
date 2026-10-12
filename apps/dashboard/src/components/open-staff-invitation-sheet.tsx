"use client"
import { useStaffInvitationParams } from "@/hooks/use-staff-invitation-params"
import { Button } from "@ewatrade/ui"

export function OpenStaffInvitationSheet({ commandId }: { commandId: string }) {
  const { open } = useStaffInvitationParams()
  return (
    <Button variant="outline" size="sm" onClick={() => void open(commandId)}>
      Open invitation
    </Button>
  )
}
