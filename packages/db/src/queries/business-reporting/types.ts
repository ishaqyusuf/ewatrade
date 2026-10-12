export type BusinessReportTotals =
  | {
      kind: "item_sales"
      groupCount: string
      lineCount: string
      bookedValueMinor: string
    }
  | {
      kind: "payment_collections"
      receivedMinor: string
      refundedMinor: string
      netMoneyMinor: string
      netCustomerCreditMinor: string
    }
  | {
      kind: "customer_debt"
      accountCount: string
      outstandingDebtMinor: string
      availableCreditMinor: string
      netBalanceMinor: string
    }
  | {
      kind: "supplier_aging"
      payableMinor: string
      advanceMinor: string
      sourcesRead: string
    }
  | {
      kind: "posted_profit"
      revenueMinor: string
      costOfSalesMinor: string
      expensesMinor: string
      netProfitMinor: string
    }

export type BusinessReportRow = {
  id: string
  label: string
  value: string
  detail: string
  moneyMinor?: string
  moneyLabel?: string
  moneyDetails?: Array<{ label: string; amountMinor: string }>
  target?: { kind: "catalog_item" | "customer"; id: string }
}
export type BusinessReport = {
  report:
    | "item_sales"
    | "payment_collections"
    | "customer_debt"
    | "stock"
    | "supplier_aging"
    | "posted_profit"
  asOf: string
  complete: boolean
  scope: string
  dateBasis: string
  currencyCode: string | null
  period: {
    from: string
    to: string
    end: "inclusive" | "exclusive"
    timezone: string
  } | null
  rows: BusinessReportRow[]
  summary: string
  totals?: BusinessReportTotals
  sourceCoverage?: {
    coverage: string
    completeness: string
    gaps: readonly string[]
  }
  gaps: string[]
  pagination?: { totalRows: string; nextCursor: string | null }
}
export type ReportPeriod = {
  from: Date
  before: Date
  timezone: string
  currencyCode: string
}
export function validateReportPeriod(input: ReportPeriod) {
  let timezoneValid = false
  try {
    new Intl.DateTimeFormat("en", { timeZone: input.timezone }).format()
    timezoneValid = true
  } catch {}
  if (
    !timezoneValid ||
    !/^[A-Z]{3}$/.test(input.currencyCode) ||
    !Number.isFinite(input.from.getTime()) ||
    !Number.isFinite(input.before.getTime()) ||
    input.before <= input.from ||
    input.before.getTime() - input.from.getTime() > 366 * 86_400_000
  )
    throw new Error("Invalid report period, timezone or currency.")
}
export function reportPeriod(input: ReportPeriod) {
  validateReportPeriod(input)
  return {
    from: input.from.toISOString(),
    to: input.before.toISOString(),
    end: "exclusive" as const,
    timezone: input.timezone,
  }
}
