import {
  type ServiceBookingTarget,
  serviceBookingTargetSchema,
} from "@ewatrade/assistant/general/booking-read"

export function parseAssistantBooking(raw: string | null) {
  if (raw === null) return null
  try {
    const parsed = serviceBookingTargetSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function assistantBookingOpenParams(target: ServiceBookingTarget) {
  return {
    assistantBooking: JSON.stringify(serviceBookingTargetSchema.parse(target)),
  }
}

export const assistantBookingCloseParams = {
  assistantBooking: null,
} as const

/** Cached facts cannot stand in for a current original-tuple authorization read. */
export function assistantBookingReadState(
  target: ServiceBookingTarget,
  query: {
    isPending: boolean
    isFetching: boolean
    isPaused: boolean
    isError: boolean
    isSuccess: boolean
    isFetchedAfterMount: boolean
    data?: { id: string; sourceId: string; offeringId: string }
  },
) {
  if (query.isPending || query.isFetching || query.isPaused)
    return "loading" as const
  if (query.isError) return "unavailable" as const
  if (!query.isFetchedAfterMount) return "loading" as const
  if (
    !query.isSuccess ||
    !query.data ||
    query.data.id !== target.bookingId ||
    query.data.sourceId !== target.sourceId ||
    query.data.offeringId !== target.offeringId
  ) {
    return "unavailable" as const
  }
  return "ready" as const
}
