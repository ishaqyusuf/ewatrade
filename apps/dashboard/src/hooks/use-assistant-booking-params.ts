"use client"

import {
  assistantBookingCloseParams,
  assistantBookingOpenParams,
  parseAssistantBooking,
} from "@/components/assistant-booking-state"
import type { ServiceBookingTarget } from "@ewatrade/assistant/general/booking-read"
import { parseAsString, useQueryStates } from "nuqs"
import {
  assistantObjectParams,
  closedAssistantObjectParams,
} from "./use-assistant-receipt"

const bookingParams = {
  ...assistantObjectParams,
  assistantBooking: parseAsString,
}

export function useAssistantBookingParams() {
  const [{ assistantBooking }, setParams] = useQueryStates(bookingParams, {
    history: "push",
    shallow: true,
  })
  return {
    isOpen: assistantBooking !== null,
    target: parseAssistantBooking(assistantBooking),
    open: (target: ServiceBookingTarget) =>
      setParams({
        ...closedAssistantObjectParams,
        ...assistantBookingOpenParams(target),
      }),
    close: () => setParams(assistantBookingCloseParams),
  }
}
