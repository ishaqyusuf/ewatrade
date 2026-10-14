import {
  type BusinessActivityCategory,
  type BusinessActivityListInput,
  type BusinessEventType,
  businessActivityCategories,
  businessEventTypes,
} from "@ewatrade/notifications/business-events"
import {
  type LoaderInput,
  createLoader,
  type inferParserType,
  parseAsArrayOf,
  parseAsString,
  parseAsStringEnum,
} from "nuqs/server"

export const ACTIVITY_RANGES = [
  "today",
  "yesterday",
  "last7",
  "last30",
  "custom",
] as const
export type ActivityRange = (typeof ACTIVITY_RANGES)[number]

export const ACTIVITY_RANGE_LABELS: Record<ActivityRange, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
  last30: "Last 30 days",
  custom: "Custom dates",
}

/** Unknown recorded actor is its own choice, never a fake membership ID. */
export const UNKNOWN_ACTIVITY_PERSON = "unknown"

const DAY = /^\d{4}-\d{2}-\d{2}$/
const MAX_DAYS = 92

export const activityFilterParams = {
  activityQuery: parseAsString,
  activityCategories: parseAsArrayOf(
    parseAsStringEnum([...businessActivityCategories]),
  ),
  activityTypes: parseAsArrayOf(parseAsStringEnum([...businessEventTypes])),
  activityPerson: parseAsString,
  activityStores: parseAsArrayOf(parseAsString),
  activityRange: parseAsStringEnum([...ACTIVITY_RANGES]),
  activityFrom: parseAsString,
  activityTo: parseAsString,
}

export type ActivityFilters = {
  query: string | null
  categories: BusinessActivityCategory[]
  /** Exact event types; unknown keys are dropped by the URL parser. */
  types: BusinessEventType[]
  person: string | null
  storeIds: string[]
  range: ActivityRange
  from: string | null
  to: string | null
}

const loadActivityFilterState = createLoader(activityFilterParams)

export function toActivityFilters(
  params: inferParserType<typeof activityFilterParams>,
): ActivityFilters {
  const from = params.activityFrom && DAY.test(params.activityFrom)
  const to = params.activityTo && DAY.test(params.activityTo)
  const custom = params.activityRange === "custom" && from && to
  return {
    query: params.activityQuery?.trim().slice(0, 160) || null,
    categories: [...new Set(params.activityCategories ?? [])],
    types: [...new Set(params.activityTypes ?? [])].slice(0, 100),
    person: params.activityPerson?.trim().slice(0, 160) || null,
    storeIds: [...new Set(params.activityStores ?? [])].slice(0, 100),
    range: custom
      ? "custom"
      : params.activityRange && params.activityRange !== "custom"
        ? params.activityRange
        : "last7",
    from: custom ? params.activityFrom : null,
    to: custom ? params.activityTo : null,
  }
}

export async function loadActivityFilterParams(
  searchParams: LoaderInput | Promise<LoaderInput>,
): Promise<ActivityFilters> {
  return toActivityFilters(loadActivityFilterState(await searchParams))
}

export function hasActivityFilters(filter: ActivityFilters) {
  return Boolean(
    filter.query ||
      filter.categories.length ||
      filter.types.length ||
      filter.person ||
      filter.storeIds.length ||
      filter.range !== "last7",
  )
}

/** Calendar day (YYYY-MM-DD) of an instant in the Business time zone. */
export function businessDay(instant: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant)
}

function dayParts(day: string): [number, number, number] {
  const [y = Number.NaN, m = Number.NaN, d = Number.NaN] = day
    .split("-")
    .map(Number)
  return [y, m, d]
}

export function shiftDay(day: string, days: number) {
  const [y, m, d] = dayParts(day)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function zoneOffsetMs(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant)
  const part = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  )
  return asUtc - Math.floor(instant / 1000) * 1000
}

/** UTC instant of local midnight starting `day` in the Business time zone. */
export function businessDayStart(day: string, timeZone: string) {
  const [y, m, d] = dayParts(day)
  const guess = Date.UTC(y, m - 1, d)
  let instant = guess - zoneOffsetMs(guess, timeZone)
  // A second pass settles days whose offset changes around midnight.
  instant = guess - zoneOffsetMs(instant, timeZone)
  return new Date(instant)
}

/** Half-open [from, to) window for the chosen range, in UTC ISO strings. */
export function activityDateWindow(
  filter: Pick<ActivityFilters, "range" | "from" | "to">,
  timeZone: string,
  now: Date,
) {
  const today = businessDay(now, timeZone)
  let first = shiftDay(today, -6)
  let last = today
  if (filter.range === "today") first = today
  if (filter.range === "yesterday") first = last = shiftDay(today, -1)
  if (filter.range === "last30") first = shiftDay(today, -29)
  if (filter.range === "custom" && filter.from && filter.to) {
    first = filter.from <= filter.to ? filter.from : filter.to
    last = filter.from <= filter.to ? filter.to : filter.from
    if (shiftDay(first, MAX_DAYS - 1) < last)
      last = shiftDay(first, MAX_DAYS - 1)
  }
  return {
    from: businessDayStart(first, timeZone).toISOString(),
    to: businessDayStart(shiftDay(last, 1), timeZone).toISOString(),
    firstDay: first,
    lastDay: last,
  }
}

export function getActivityListPageInput(
  filter: ActivityFilters,
  timeZone: string,
  now: Date,
): BusinessActivityListInput {
  const { from, to } = activityDateWindow(filter, timeZone, now)
  const unknown = filter.person === UNKNOWN_ACTIVITY_PERSON
  return {
    q: filter.query ?? undefined,
    categories: filter.categories.length ? filter.categories : undefined,
    types: filter.types.length ? filter.types : undefined,
    actorMembershipId: filter.person && !unknown ? filter.person : undefined,
    actorKind: unknown ? "unknown" : undefined,
    storeIds: filter.storeIds.length ? filter.storeIds : undefined,
    from,
    to,
    sort: "newest",
    limit: 25,
  }
}
