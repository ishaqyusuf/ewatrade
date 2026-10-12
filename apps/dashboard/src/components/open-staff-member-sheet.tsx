"use client"
import { useStaffMemberParams } from "@/hooks/use-staff-member-params"
import { Button } from "@ewatrade/ui"

export function OpenStaffMemberSheet({
  membershipId,
}: { membershipId: string }) {
  const { open } = useStaffMemberParams()
  return (
    <Button variant="outline" size="sm" onClick={() => void open(membershipId)}>
      Open staff
    </Button>
  )
}
