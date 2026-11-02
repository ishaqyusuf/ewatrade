/**
 * Date presets for the Financial reports date editor, matching the dashboard's
 * list. Days are whole UTC days ("YYYY-MM-DD"), like the editor's fields. A
 * preset never starts before the books do or ends after today; one that ends
 * before the books start is left out.
 */
export type FinanceReportPreset = {
  key: string
  label: string
  from: string
  through: string
  /** The start moved up to when the books begin. */
  clamped: boolean
}

/** Fixed names: ICU versions disagree on "Sep" versus "Sept". */
const MONTHS = [
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

const utc = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10)

export function financeReportPresets(
  bookStartsAt: Date | string,
  now = new Date(),
): FinanceReportPreset[] {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const day = now.getUTCDate()
  const quarter = Math.floor(month / 3) * 3
  const today = utc(year, month, day)
  const start = new Date(bookStartsAt).toISOString().slice(0, 10)
  const ranges: Array<[string, string, string, string]> = [
    ["today", "Today", today, today],
    [
      "week",
      "This week",
      utc(year, month, day - ((now.getUTCDay() + 6) % 7)),
      today,
    ],
    ["month", "This month", utc(year, month, 1), today],
    ["last-month", "Last month", utc(year, month - 1, 1), utc(year, month, 0)],
    ["quarter", "This quarter", utc(year, quarter, 1), today],
    [
      "last-quarter",
      "Last quarter",
      utc(year, quarter - 3, 1),
      utc(year, quarter, 0),
    ],
    ["year", "Year to date", utc(year, 0, 1), today],
    ["last-year", "Last year", utc(year - 1, 0, 1), utc(year - 1, 11, 31)],
    ["30-days", "Last 30 days", utc(year, month, day - 29), today],
    ["90-days", "Last 90 days", utc(year, month, day - 89), today],
    ["all", "Since books began", start, today],
  ]
  return ranges
    .filter(([, , , through]) => through >= start)
    .map(([key, label, from, through]) => ({
      clamped: from < start,
      from: from < start ? start : from,
      key,
      label,
      through: through > today ? today : through,
    }))
}

/**
 * The preset the From and Through fields show: the one last picked while it
 * still matches, else the first that matches, else null (custom dates).
 */
export function matchFinanceReportPreset(
  presets: readonly FinanceReportPreset[],
  range: { from: string; through: string },
  picked?: string | null,
) {
  const matches = presets.filter(
    (preset) => preset.from === range.from && preset.through === range.through,
  )
  return matches.find((preset) => preset.key === picked) ?? matches[0] ?? null
}

/** "15 Oct", "1 – 30 Sep" or "1 Jul – 30 Sep", with years when not this year. */
export function financeReportRangeLabel(
  range: { from: string; through: string },
  now = new Date(),
) {
  const first = new Date(`${range.from}T00:00:00.000Z`)
  const last = new Date(`${range.through}T00:00:00.000Z`)
  if (!Number.isFinite(first.getTime()) || !Number.isFinite(last.getTime()))
    return `${range.from} – ${range.through}`
  const year = now.getUTCFullYear()
  const withYear =
    first.getUTCFullYear() !== year || last.getUTCFullYear() !== year
  const tail = (date: Date) =>
    `${MONTHS[date.getUTCMonth()]}${withYear ? ` ${date.getUTCFullYear()}` : ""}`
  if (range.from === range.through) return `${last.getUTCDate()} ${tail(last)}`
  return first.getUTCMonth() === last.getUTCMonth() &&
    first.getUTCFullYear() === last.getUTCFullYear()
    ? `${first.getUTCDate()} – ${last.getUTCDate()} ${tail(last)}`
    : `${first.getUTCDate()} ${tail(first)} – ${last.getUTCDate()} ${tail(last)}`
}
