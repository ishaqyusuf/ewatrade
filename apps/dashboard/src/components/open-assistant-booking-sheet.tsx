"use client"

import { useAssistantBookingParams } from "@/hooks/use-assistant-booking-params"
import {
  type ServiceBookingTarget,
  serviceBookingTargetSchema,
} from "@ewatrade/assistant/general/booking-read"
import { Button } from "@ewatrade/ui"

export function OpenAssistantBookingSheet({
  target,
}: { target: ServiceBookingTarget }) {
  const { open } = useAssistantBookingParams()
  const parsed = serviceBookingTargetSchema.safeParse(target)
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={!parsed.success}
      onClick={() => {
        if (parsed.success) void open(parsed.data)
      }}
    >
      Open booking
    </Button>
  )
}
