/**
 * Report date windows. Every Reports page uses whole UTC days with an
 * exclusive end, matching the report APIs: "Last 30 days" is the 30 UTC days
 * ending today, so `to` is the start of tomorrow.
 */
export type ReportRange = { from: Date; to: Date }

export const REPORT_RANGE_PRESETS = [7, 30, 90] as const
export type ReportRangePreset = (typeof REPORT_RANGE_PRESETS)[number]
export const REPORT_RANGE_DEFAULT_DAYS: ReportRangePreset = 30
export const REPORT_RANGE_MAX_DAYS = 366

const DAY_MS = 86_400_000

/** Fixed names: ICU versions disagree on "Sep" versus "Sept". */
const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const

function startOfUtcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  )
}

export function reportPresetRange(days: number, now = new Date()): ReportRange {
  const to = new Date(startOfUtcDay(now).getTime() + DAY_MS)
  return { from: new Date(to.getTime() - days * DAY_MS), to }
}

export function reportRangeDays(range: ReportRange) {
  return Math.round((range.to.getTime() - range.from.getTime()) / DAY_MS)
}

function isWholeUtcDay(value: Date) {
  return (
    Number.isFinite(value.getTime()) &&
    value.getTime() === startOfUtcDay(value).getTime()
  )
}

/** A valid URL range, or the default last 30 days. */
export function resolveReportRange(
  params: { from: Date | null; to: Date | null },
  now = new Date(),
): ReportRange {
  const { from, to } = params
  if (
    from &&
    to &&
    isWholeUtcDay(from) &&
    isWholeUtcDay(to) &&
    to > from &&
    reportRangeDays({ from, to }) <= REPORT_RANGE_MAX_DAYS
  ) {
    return { from, to }
  }
  return reportPresetRange(REPORT_RANGE_DEFAULT_DAYS, now)
}

/** The same number of days just before `range`. */
export function previousReportRange(range: ReportRange): ReportRange {
  const length = range.to.getTime() - range.from.getTime()
  return { from: new Date(range.from.getTime() - length), to: range.from }
}

/** 7, 30 or 90 when the range is that preset ending today, else null. */
export function matchReportRangePreset(
  range: ReportRange,
  now = new Date(),
): ReportRangePreset | null {
  return (
    REPORT_RANGE_PRESETS.find((days) => {
      const preset = reportPresetRange(days, now)
      return (
        preset.from.getTime() === range.from.getTime() &&
        preset.to.getTime() === range.to.getTime()
      )
    }) ?? null
  )
}

function dayMonth(value: Date, withYear = false) {
  const text = `${value.getUTCDate()} ${SHORT_MONTHS[value.getUTCMonth()]}`
  return withYear ? `${text} ${value.getUTCFullYear()}` : text
}

/** "19 Oct" for a "2026-10-19" day key. */
export function formatReportDay(date: string, withYear = false) {
  const value = new Date(`${date}T00:00:00.000Z`)
  return Number.isFinite(value.getTime()) ? dayMonth(value, withYear) : date
}

/** "Mon 19 Oct 2026" for a "2026-10-19" day key. */
export function formatReportDayLong(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`)
  return Number.isFinite(value.getTime())
    ? `${WEEKDAYS[value.getUTCDay()]} ${dayMonth(value, true)}`
    : date
}

/** The included days: "20 Sep – 19 Oct", with the year only when it differs. */
export function formatReportRangeDates(range: ReportRange, now = new Date()) {
  const first = range.from
  const last = new Date(range.to.getTime() - DAY_MS)
  const thisYear = now.getUTCFullYear()
  const showYear =
    first.getUTCFullYear() !== thisYear || last.getUTCFullYear() !== thisYear
  if (first.getTime() === last.getTime()) return dayMonth(last, showYear)
  return `${dayMonth(first, showYear && first.getUTCFullYear() !== last.getUTCFullYear())} – ${dayMonth(last, showYear)}`
}

/** "between 20 Sep and 19 Oct", or "on 19 Oct" for one day, for empty states. */
export function formatReportRangeBetween(range: ReportRange, now = new Date()) {
  const dates = formatReportRangeDates(range, now)
  return dates.includes(" – ")
    ? `between ${dates.replace(" – ", " and ")}`
    : `on ${dates}`
}

/** "Last 30 days" for a preset, otherwise "15 days". */
export function formatReportRangeName(range: ReportRange, now = new Date()) {
  const preset = matchReportRangePreset(range, now)
  if (preset) return `Last ${preset} days`
  const days = reportRangeDays(range)
  return `${days} ${days === 1 ? "day" : "days"}`
}

/** "Last 30 days · 20 Sep – 19 Oct". */
export function formatReportRangeLabel(range: ReportRange, now = new Date()) {
  return `${formatReportRangeName(range, now)} · ${formatReportRangeDates(range, now)}`
}

/** "2026-09-20" for the first included day; `to` is shown as the last included day. */
export function reportRangeFileDates(range: ReportRange) {
  const last = new Date(range.to.getTime() - DAY_MS)
  return `${range.from.toISOString().slice(0, 10)}_to_${last.toISOString().slice(0, 10)}`
}
