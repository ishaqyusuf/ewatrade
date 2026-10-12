"use client"
import { staffAccessTargetSchema } from "@ewatrade/assistant/general/staff-access"
import { useQueryStates } from "nuqs"
import {
  assistantObjectParams,
  closedAssistantObjectParams,
} from "./use-assistant-receipt"

export function useStaffAccessParams() {
  const [{ staffAccessEvent }, setParams] = useQueryStates(
    assistantObjectParams,
    { history: "push" },
  )
  const parsed = staffAccessTargetSchema.safeParse({
    kind: "staff_access",
    eventId: staffAccessEvent,
  })
  return {
    isOpen: staffAccessEvent !== null,
    eventId: parsed.success ? parsed.data.eventId : null,
    open: (eventId: string) =>
      setParams({
        ...closedAssistantObjectParams,
        staffAccessEvent: staffAccessTargetSchema.parse({
          kind: "staff_access",
          eventId,
        }).eventId,
      }),
    close: () => setParams({ staffAccessEvent: null }),
  }
}
