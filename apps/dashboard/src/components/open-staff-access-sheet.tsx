"use client"
import { useStaffAccessParams } from "@/hooks/use-staff-access-params"
import { Button } from "@ewatrade/ui"

export function OpenStaffAccessSheet({ eventId }: { eventId: string }) {
  const { open } = useStaffAccessParams()
  return (
    <Button variant="outline" size="sm" onClick={() => void open(eventId)}>
      Open original access
    </Button>
  )
}
