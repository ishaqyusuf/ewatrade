export function publicBookingFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : ""
  if (message.includes("no longer available") || message.includes("capacity")) {
    return "That time is no longer available. Choose another slot and try again."
  }
  if (message.includes("changed") || message.includes("expired")) {
    return "This booking link or availability changed. Refresh available times and try again."
  }
  return "This booking action is unavailable right now. Refresh and try again."
}

const BOOKING_PAGE_WINDOW_MS = 7 * 86_400_000

export function publicBookingWindowStart(
  value: string | string[] | undefined,
  now = new Date(),
) {
  const raw = Array.isArray(value) ? value[0] : value
  const requested = raw ? new Date(raw) : now
  if (Number.isNaN(requested.getTime()) || requested < now) return now
  return requested
}

export function publicBookingWindow(start: Date, now = new Date()) {
  return {
    next: new Date(start.getTime() + BOOKING_PAGE_WINDOW_MS),
    previous: new Date(
      Math.max(now.getTime(), start.getTime() - BOOKING_PAGE_WINDOW_MS),
    ),
    to: new Date(start.getTime() + BOOKING_PAGE_WINDOW_MS),
  }
}
