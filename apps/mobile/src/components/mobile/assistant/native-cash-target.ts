import {
  cashCountTargetSchema,
  dayCloseTargetSchema,
} from "@ewatrade/assistant/general/contracts"

export function readNativeCashOriginalParams(
  bookId: unknown,
  countId: unknown,
) {
  const parsed = cashCountTargetSchema.safeParse({
    kind: "finance_cash_count",
    bookId,
    countId,
  })
  return parsed.success ? parsed.data : null
}
export function readNativeDayReviewTarget(raw: unknown) {
  if (typeof raw !== "string" || raw.length > 1024) return null
  try {
    const parsed = dayCloseTargetSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
export function nativeCashReadRoute(raw: unknown) {
  const count = cashCountTargetSchema.safeParse(raw)
  if (count.success)
    return {
      pathname: "/finance-count/[countId]" as const,
      params: { countId: count.data.countId, bookId: count.data.bookId },
    }
  const day = dayCloseTargetSchema.safeParse(raw)
  return day.success
    ? {
        pathname: "/finance-periods-modal" as const,
        params: { target: JSON.stringify(day.data) },
      }
    : null
}
