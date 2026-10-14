"use client"
import { useStaffActivityParams } from "@/hooks/use-staff-activity-params"
import type { StaffActivityTarget } from "@ewatrade/assistant/general/staff-activity-target"
import { Button } from "@ewatrade/ui"

export function OpenStaffActivitySheet({
  target,
}: {
  target: StaffActivityTarget
}) {
  const { open } = useStaffActivityParams()
  return (
    <Button variant="outline" size="sm" onClick={() => void open(target)}>
      Open activity
    </Button>
  )
}
