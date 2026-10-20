/** "14 Oct 2026": the one date format Finance lists and pages use. */
export function formatFinanceDate(value: Date | string, timeZone?: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  })
}

/** "14 Oct": for rows inside a list, where the year is usually the current one. */
export function formatFinanceShortDate(
  value: Date | string,
  timeZone?: string,
) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone,
  })
}
