/** How a Store handles Return items or Refund (CommercialOrderChangeMode). */
export type OrderChangeMode = "OFF" | "OPEN" | "APPROVAL_REQUIRED"

export type OrderChangePolicyModes = {
  returnsMode: OrderChangeMode
  refundsMode: OrderChangeMode
}

export const OPEN_ORDER_CHANGE_POLICY: OrderChangePolicyModes = {
  returnsMode: "OPEN",
  refundsMode: "OPEN",
}

export const ORDER_CHANGE_MANAGERS_ONLY = "Owners and managers only"

export type OrderChangeRequirement =
  | { kind: "direct" }
  | { kind: "ask" }
  | { kind: "blocked"; reason: string }

/**
 * Whether this person may return or refund now, must ask an Owner/Admin
 * first, or cannot at all. A Return that pays money back also follows the
 * refunds setting. Owners and Admins approve, so they never ask.
 */
export function orderChangeRequirement(
  policy: OrderChangePolicyModes,
  input: {
    action: "return" | "refund"
    /** Owner or Admin. */
    isApprover: boolean
    /** Owner, Admin or Manager: may move money when the Store is open. */
    canManageMoney: boolean
    /** A Return that lowers the total (credit), with or without cash back. */
    withMoney?: boolean
    /** A Return that pays money back to the customer. */
    cashBack?: boolean
  },
): OrderChangeRequirement {
  if (input.action === "refund") {
    if (policy.refundsMode === "OFF")
      return { kind: "blocked", reason: "Refunds are off for this store" }
    if (input.isApprover) return { kind: "direct" }
    if (policy.refundsMode === "APPROVAL_REQUIRED") return { kind: "ask" }
    return input.canManageMoney
      ? { kind: "direct" }
      : { kind: "blocked", reason: ORDER_CHANGE_MANAGERS_ONLY }
  }
  if (policy.returnsMode === "OFF")
    return { kind: "blocked", reason: "Returns are off for this store" }
  if (input.cashBack && policy.refundsMode === "OFF")
    return {
      kind: "blocked",
      reason: "Refunds are off for this store, so no money can go back",
    }
  if (input.isApprover) return { kind: "direct" }
  if (
    policy.returnsMode === "APPROVAL_REQUIRED" ||
    (input.cashBack && policy.refundsMode === "APPROVAL_REQUIRED")
  )
    return { kind: "ask" }
  if (input.withMoney && !input.canManageMoney)
    return { kind: "blocked", reason: ORDER_CHANGE_MANAGERS_ONLY }
  return { kind: "direct" }
}

/** The next local midnight after `now` in the business time zone. */
export function endOfBusinessDay(now: Date, timeZone: string) {
  const zone = validTimeZone(timeZone) ? timeZone : "Africa/Lagos"
  const parts = zonedParts(now, zone)
  const nextMidnight = Date.UTC(parts.year, parts.month - 1, parts.day + 1)
  // Two passes settle the offset when a DST change falls inside the day.
  let guess = nextMidnight - zoneOffset(now, zone)
  guess = nextMidnight - zoneOffset(new Date(guess), zone)
  return new Date(guess)
}

function validTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format()
    return true
  } catch {
    return false
  }
}

function zonedParts(date: Date, timeZone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      second: "2-digit",
      timeZone,
      year: "numeric",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>
  return values
}

/** Milliseconds the zone is ahead of UTC at `date`. */
function zoneOffset(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone)
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}
