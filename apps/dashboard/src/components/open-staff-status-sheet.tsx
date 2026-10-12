"use client"
import { useStaffStatusParams } from "@/hooks/use-staff-status-params"
import { Button } from "@ewatrade/ui"

export function OpenStaffStatusSheet({ eventId }: { eventId: string }) {
  const { open } = useStaffStatusParams()
  return (
    <Button variant="outline" size="sm" onClick={() => void open(eventId)}>
      Open original status
    </Button>
  )
}
