import { formatMinorMoney } from "@ewatrade/utils"
import { SALE_STATUSES } from "./dashboard/green-till-home-model"
import { orderTotalsMoney, sumOrderTotals } from "./orders/orders-ledger-model"
import { exactPaymentTotals } from "./payment-display"
import {
  PAYMENT_METHOD_FILTERS,
  type PaymentMethodFilter,
  paymentMethodFilter,
  paymentMethodLabel,
} from "./payment-methods"

/** Reports period chips, in order. */
export const REPORT_PERIODS = ["today", "week", "month", "all"] as const
export type ReportPeriod = (typeof REPORT_PERIODS)[number]
export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  all: "All time",
  month: "This month",
  today: "Today",
  week: "This week",
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
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const

/**
 * Local-day window for a period, ending at the start of tomorrow: today, the
 * week from Monday, or the month from the 1st. All time has no window.
 */
export function reportPeriodWindow(
  period: ReportPeriod,
  now = new Date(),
): { after: Date; before: Date } | null {
  if (period === "all") return null
  const year = now.getFullYear()
  const month = now.getMonth()
  const day = now.getDate()
  const before = new Date(year, month, day + 1)
  const after =
    period === "today"
      ? new Date(year, month, day)
      : period === "week"
        ? new Date(year, month, day - ((now.getDay() + 6) % 7))
        : new Date(year, month, 1)
  return { after, before }
}

/** "Thu 15 Oct", "12 – 15 Oct" or "28 Sep – 1 Oct"; null for all time. */
export function reportPeriodRange(period: ReportPeriod, now = new Date()) {
  const window = reportPeriodWindow(period, now)
  if (!window) return null
  const first = window.after
  const last = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (first.getTime() === last.getTime())
    return `${WEEKDAYS[last.getDay()]} ${last.getDate()} ${MONTHS[last.getMonth()]}`
  return first.getMonth() === last.getMonth()
    ? `${first.getDate()} – ${last.getDate()} ${MONTHS[last.getMonth()]}`
    : `${first.getDate()} ${MONTHS[first.getMonth()]} – ${last.getDate()} ${MONTHS[last.getMonth()]}`
}

type OrderGroups = Parameters<typeof sumOrderTotals>[0]
type PaymentCurrencyTotals = Array<{
  currencyCode: string
  totalAmountMinor: number
  totalCount: number
  byMethod: Array<{ amountMinor: number; count: number; method: string }>
}>

export type ReceivedMethodRow = {
  key: string
  method: PaymentMethodFilter
  title: string
  meta: string
  amount: string
}

const whole = (value: string) => value.replace(/\.00$/, "")

/**
 * The period hero and Received rows from the server's exact totals. Sales are
 * open and completed Orders made in the period; Received is every payment
 * recorded in it, whichever Order it was for. Currencies are never added.
 */
export function buildReportPeriodFigures(input: {
  defaultCurrencyCode: string
  orderGroups: OrderGroups
  payments: PaymentCurrencyTotals
}) {
  const sales = sumOrderTotals(input.orderGroups, { statuses: SALE_STATUSES })
  const [only, ...others] = sales.currencies
  const zero = whole(formatMinorMoney(0, input.defaultCurrencyCode))
  const received = input.payments.filter((total) => total.totalCount > 0)
  const mixedPayments = received.length > 1
  const rows: ReceivedMethodRow[] = []
  for (const total of received)
    for (const row of [...total.byMethod].sort(
      (a, b) => b.amountMinor - a.amountMinor,
    )) {
      const method = paymentMethodFilter(row.method)
      if (!method || row.count === 0) continue
      rows.push({
        amount: whole(
          exactPaymentTotals([
            {
              currencyCode: total.currencyCode,
              totalAmountMinor: row.amountMinor,
            },
          ])[0] ?? "",
        ),
        key: `${total.currencyCode}:${method}`,
        meta: `${row.count} payment${row.count === 1 ? "" : "s"}`,
        method,
        title: mixedPayments
          ? `${paymentMethodLabel(row.method)} · ${total.currencyCode}`
          : paymentMethodLabel(row.method),
      })
    }
  if (mixedPayments)
    rows.sort(
      (a, b) =>
        PAYMENT_METHOD_FILTERS.indexOf(a.method) -
        PAYMENT_METHOD_FILTERS.indexOf(b.method),
    )
  return {
    average:
      only && !others.length && only.orderCount
        ? whole(
            formatMinorMoney(
              Math.round(only.orderValueMinor / only.orderCount),
              only.currencyCode,
            ),
          )
        : null,
    orderCount: sales.orderCount,
    owed: sales.currencies.length
      ? orderTotalsMoney(sales, "outstandingMinor")
      : zero,
    received: mixedPayments
      ? "Mixed currencies"
      : received[0]
        ? whole(exactPaymentTotals(received)[0] ?? "")
        : zero,
    receivedCount: received.reduce(
      (count, total) => count + total.totalCount,
      0,
    ),
    receivedRows: rows,
    sales: sales.currencies.length ? orderTotalsMoney(sales) : zero,
  }
}
