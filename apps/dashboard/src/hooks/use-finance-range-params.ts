"use client"

import { useQueryStates } from "nuqs"
import { parseAsIsoDate } from "nuqs/server"

export function useFinanceRangeParams({
  minimum,
  statement = false,
}: {
  minimum: string
  statement?: boolean
}) {
  const [params, setParams] = useQueryStates({
    financeReportFrom: parseAsIsoDate,
    financeReportThrough: parseAsIsoDate,
    statementFrom: parseAsIsoDate,
    statementThrough: parseAsIsoDate,
  })
  const requestedFrom = statement
    ? params.statementFrom
    : params.financeReportFrom
  const requestedThrough = statement
    ? params.statementThrough
    : params.financeReportThrough
  const today = new Date().toISOString().slice(0, 10)
  const defaultThrough = today >= minimum ? today : minimum
  const from = requestedFrom?.toISOString().slice(0, 10) ?? minimum
  const through = requestedThrough?.toISOString().slice(0, 10) ?? defaultThrough
  const valid = from >= minimum && through >= from
  return {
    from: valid ? from : minimum,
    through: valid ? through : defaultThrough,
    setRange: (range: { start: string; end: string }) =>
      setParams(
        statement
          ? {
              statementFrom: new Date(`${range.start}T00:00:00Z`),
              statementThrough: new Date(`${range.end}T00:00:00Z`),
            }
          : {
              financeReportFrom: new Date(`${range.start}T00:00:00Z`),
              financeReportThrough: new Date(`${range.end}T00:00:00Z`),
            },
        { history: "push" },
      ),
  }
}
