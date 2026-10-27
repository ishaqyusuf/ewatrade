"use client"
import { parseAsStringLiteral, useQueryStates } from "nuqs"

const yearEndViews = ["settings", "preview"] as const
export type YearEndView = (typeof yearEndViews)[number]

/** Which year-end sheet is open on Finance Reports, kept in the URL. */
export function useYearEndParams() {
  const [params, setParams] = useQueryStates(
    { financeYearEnd: parseAsStringLiteral(yearEndViews) },
    { history: "push" },
  )
  return {
    view: params.financeYearEnd,
    open: (view: YearEndView) => setParams({ financeYearEnd: view }),
    close: () => setParams({ financeYearEnd: null }),
  }
}
