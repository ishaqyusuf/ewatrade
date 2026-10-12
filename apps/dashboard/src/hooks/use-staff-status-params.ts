"use client"
import { staffStatusTargetSchema } from "@ewatrade/assistant/general/staff-status"
import { useQueryStates } from "nuqs"
import {
  assistantObjectParams,
  closedAssistantObjectParams,
} from "./use-assistant-receipt"

export function useStaffStatusParams() {
  const [{ staffStatusEvent }, setParams] = useQueryStates(
    assistantObjectParams,
    { history: "push" },
  )
  const parsed = staffStatusTargetSchema.safeParse({
    kind: "staff_status",
    eventId: staffStatusEvent,
  })
  return {
    isOpen: staffStatusEvent !== null,
    eventId: parsed.success ? parsed.data.eventId : null,
    open: (eventId: string) =>
      setParams({
        ...closedAssistantObjectParams,
        staffStatusEvent: staffStatusTargetSchema.parse({
          kind: "staff_status",
          eventId,
        }).eventId,
      }),
    close: () => setParams({ staffStatusEvent: null }),
  }
}
