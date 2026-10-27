export type BookingResourceOption = {
  capacity: number
  id: string
  label: string
}

type BookingRequest = {
  customerName: string
  id: string
  lines: Array<{ offeringId: string; offeringName: string }>
  status: string
}

export function mergeBookingResources(
  configured: BookingResourceOption[],
  recentlyCreated: BookingResourceOption[],
) {
  return [
    ...new Map(
      [...configured, ...recentlyCreated].map((item) => [item.id, item]),
    ).values(),
  ]
}

/**
 * Mirrors the server's booking-source rule (`assertEligibleBookingSource`): every
 * Service request can be booked except declined or withdrawn ones. A request that
 * already became an Order (CONVERTED) is the usual one to schedule.
 */
const UNBOOKABLE_REQUEST_STATUSES = new Set(["DECLINED", "WITHDRAWN"])

export function eligibleBookingSources(
  requests: BookingRequest[],
  offeringId: string,
) {
  return requests.filter(
    (request) =>
      !UNBOOKABLE_REQUEST_STATUSES.has(request.status) &&
      request.lines.some((line) => line.offeringId === offeringId),
  )
}
