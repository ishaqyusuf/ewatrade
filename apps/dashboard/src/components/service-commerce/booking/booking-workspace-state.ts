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

export function eligibleBookingSources<Request extends BookingRequest>(
  requests: Request[],
  offeringId: string,
) {
  return requests.filter(
    (request) =>
      !UNBOOKABLE_REQUEST_STATUSES.has(request.status) &&
      request.lines.some((line) => line.offeringId === offeringId),
  )
}

/**
 * One customer can have several requests for the same service, so the picker
 * shows the receipt reference (or a short id) and when the request came in.
 */
export function bookingSourceLabel(
  request: BookingRequest & {
    createdAt: Date | string
    reference?: string | null
  },
  offeringId: string,
  timeZone?: string,
) {
  const line = request.lines.find((item) => item.offeringId === offeringId)
  const created = new Date(request.createdAt)
  const date = Number.isNaN(created.getTime())
    ? null
    : new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        timeZone,
      }).format(created)
  return [
    request.customerName,
    line?.offeringName ?? "Service",
    request.reference ?? `#${request.id.slice(-6)}`,
    date,
  ]
    .filter(Boolean)
    .join(" · ")
}
