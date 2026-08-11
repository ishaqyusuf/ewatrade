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

export function eligibleBookingSources(
  requests: BookingRequest[],
  offeringId: string,
) {
  return requests.filter(
    (request) =>
      !["DECLINED", "CONVERTED"].includes(request.status) &&
      request.lines.some((line) => line.offeringId === offeringId),
  )
}
