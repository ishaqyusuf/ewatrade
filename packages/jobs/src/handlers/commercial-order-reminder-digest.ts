export type CommercialOrderReminderTiming =
  | "day_before"
  | "overdue"
  | "same_day"

/** Tenant-local hour the daily digest goes out. */
export const COMMERCIAL_ORDER_DIGEST_LOCAL_HOUR = 7
/** Later hours still send a missed digest; after this the day is skipped. */
export const COMMERCIAL_ORDER_DIGEST_CATCH_UP_HOURS = 3
/** Unfulfilled Orders this many local days past due are still flagged once. */
export const COMMERCIAL_ORDER_OVERDUE_LOOKBACK_DAYS = 7

function localParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(value)
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  )
  return {
    day: values.day ?? 1,
    hour: values.hour ?? 0,
    month: values.month ?? 1,
    year: values.year ?? 0,
  }
}

function localDayNumber(value: Date, timeZone: string) {
  const { day, month, year } = localParts(value, timeZone)
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}

export function localDateKey(value: Date, timeZone: string) {
  const { day, month, year } = localParts(value, timeZone)
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-")
}

/** True during the hours a Tenant's daily digest may be sent. */
export function isCommercialOrderDigestWindow(now: Date, timeZone: string) {
  const { hour } = localParts(now, timeZone)
  return (
    hour >= COMMERCIAL_ORDER_DIGEST_LOCAL_HOUR &&
    hour <
      COMMERCIAL_ORDER_DIGEST_LOCAL_HOUR +
        COMMERCIAL_ORDER_DIGEST_CATCH_UP_HOURS
  )
}

export function commercialOrderReminderTiming(input: {
  deliveryDueAt: Date
  now: Date
  timeZone: string
}): CommercialOrderReminderTiming | null {
  const daysUntilDelivery =
    localDayNumber(input.deliveryDueAt, input.timeZone) -
    localDayNumber(input.now, input.timeZone)
  if (daysUntilDelivery === 0) return "same_day"
  if (daysUntilDelivery === 1) return "day_before"
  if (
    daysUntilDelivery < 0 &&
    daysUntilDelivery >= -COMMERCIAL_ORDER_OVERDUE_LOOKBACK_DAYS
  ) {
    return "overdue"
  }
  return null
}

export type ReminderSettings = {
  dayBeforeEnabled: boolean
  enabled: boolean
  sameDayEnabled: boolean
}

export function storeRemindsFor(
  settings: ReminderSettings | null | undefined,
  timing: CommercialOrderReminderTiming,
) {
  if (!(settings?.enabled ?? true)) return false
  if (timing === "day_before") return settings?.dayBeforeEnabled ?? true
  // Overdue follows same-day: both are about deliveries that should go out now.
  return settings?.sameDayEnabled ?? true
}

export type DigestRecipient = {
  accessMode: "LEGACY" | "SCOPED"
  email: string
  /** Stores where the person holds an active Store Manager assignment. */
  managedStoreIds: readonly string[]
  name: string | null
  role: string
}

/**
 * Owners and Admins hear about every Store. A Manager on legacy access keeps
 * business-wide reminders; scoped staff hear only about Stores they manage.
 */
export function recipientStoreFilter(
  recipient: DigestRecipient,
): ((storeId: string) => boolean) | null {
  const role = recipient.role.trim().toUpperCase()
  if (role === "OWNER" || role === "ADMIN") return () => true
  if (recipient.accessMode === "LEGACY") {
    return role === "MANAGER" ? () => true : null
  }
  if (!recipient.managedStoreIds.length) return null
  const managed = new Set(recipient.managedStoreIds)
  return (storeId) => managed.has(storeId)
}

export type DigestOrder = {
  customerName: string | null
  deliveryDueAt: Date
  id: string
  orderNumber: string
  settings: ReminderSettings | null
  storeId: string
  storeName: string
}

export type PlannedDigestEntry = {
  order: DigestOrder
  timing: CommercialOrderReminderTiming
}

export type PlannedDigest = {
  entries: PlannedDigestEntry[]
  recipient: DigestRecipient
}

export function reminderCoverageKey(input: {
  email: string
  orderId: string
  timing: CommercialOrderReminderTiming
}) {
  return [input.orderId, input.timing, input.email].join(":")
}

/**
 * Builds one digest per recipient for a single Tenant and local day. An Order
 * already reminded for the same timing (sent coverage) is left out, so each
 * Order appears at most once as due tomorrow, due today and overdue.
 */
export function planCommercialOrderReminderDigests(input: {
  coveredKeys: ReadonlySet<string>
  now: Date
  orders: readonly DigestOrder[]
  recipients: readonly DigestRecipient[]
  timeZone: string
}): PlannedDigest[] {
  const timed = input.orders.flatMap((order) => {
    const timing = commercialOrderReminderTiming({
      deliveryDueAt: order.deliveryDueAt,
      now: input.now,
      timeZone: input.timeZone,
    })
    return timing && storeRemindsFor(order.settings, timing)
      ? [{ order, timing }]
      : []
  })
  timed.sort(
    (left, right) =>
      left.order.deliveryDueAt.getTime() - right.order.deliveryDueAt.getTime(),
  )

  const seen = new Set<string>()
  return input.recipients.flatMap((recipient) => {
    const email = recipient.email.trim().toLowerCase()
    if (!email || seen.has(email)) return []
    seen.add(email)
    const canSee = recipientStoreFilter(recipient)
    if (!canSee) return []
    const entries = timed.filter(
      (entry) =>
        canSee(entry.order.storeId) &&
        !input.coveredKeys.has(
          reminderCoverageKey({
            email,
            orderId: entry.order.id,
            timing: entry.timing,
          }),
        ),
    )
    return entries.length
      ? [{ entries, recipient: { ...recipient, email } }]
      : []
  })
}

function dueLabel(
  deliveryDueAt: Date,
  timing: CommercialOrderReminderTiming,
  timeZone: string,
) {
  const time = new Intl.DateTimeFormat("en-NG", {
    timeStyle: "short",
    timeZone,
  }).format(deliveryDueAt)
  if (timing === "same_day") return `Today, ${time}`
  if (timing === "day_before") return `Tomorrow, ${time}`
  const day = new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    timeZone,
    weekday: "short",
  }).format(deliveryDueAt)
  return `Was due ${day}, ${time}`
}

export function commercialOrderDigestSections(input: {
  dashboardUrl: string | null
  entries: readonly PlannedDigestEntry[]
  timeZone: string
}) {
  const timings: CommercialOrderReminderTiming[] = [
    "overdue",
    "same_day",
    "day_before",
  ]
  return timings.flatMap((timing) => {
    const orders = input.entries
      .filter((entry) => entry.timing === timing)
      .map(({ order }) => ({
        customerName: order.customerName?.trim() || null,
        dueLabel: dueLabel(order.deliveryDueAt, timing, input.timeZone),
        orderNumber: order.orderNumber,
        orderUrl: input.dashboardUrl
          ? `${input.dashboardUrl}/sales/orders/${encodeURIComponent(order.id)}`
          : null,
        storeName: order.storeName,
      }))
    return orders.length ? [{ orders, timing }] : []
  })
}
