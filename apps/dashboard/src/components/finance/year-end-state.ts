import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

export type FinanceYearEndPreview = RouterOutputs["finance"]["yearEndPreview"]

export const FINANCE_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const

// February is 28 here: the server rejects a recurring 29 February start.
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const ZERO = BigInt(0)

/** The recurring year-end day for a saved fiscal start (month 1-12). */
export function financeYearEndFromStart(startMonth: number, startDay: number) {
  if (startDay > 1)
    return { month: startMonth, day: startDay - 1, lastDayOfMonth: false }
  const month = startMonth === 1 ? 12 : startMonth - 1
  return { month, day: MONTH_DAYS[month - 1] ?? 31, lastDayOfMonth: true }
}

/** "31 December", or "Last day of February" (29 in a leap year). */
export function financeYearEndLabel(startMonth: number, startDay: number) {
  const end = financeYearEndFromStart(startMonth, startDay)
  const name = FINANCE_MONTH_NAMES[end.month - 1] ?? ""
  if (end.month === 2 && end.lastDayOfMonth) return `Last day of ${name}`
  return `${end.day} ${name}`
}

/** A year that ends on the last day of `endMonth` starts on the 1st of the next month. */
export function financeFiscalStartForYearEnd(endMonth: number) {
  return { startMonth: endMonth === 12 ? 1 : endMonth + 1, startDay: 1 }
}

/**
 * Mirror of the server's first-year rule, used only to show the dates before
 * saving: the first year runs from the Book start to the day before the next
 * recurring start. It is short (a stub) unless the Book started on that start.
 */
export function financeFirstFiscalYear({
  startMonth,
  startDay,
  bookStartsAt,
  now,
}: {
  startMonth: number
  startDay: number
  bookStartsAt: Date | string
  now: Date
}) {
  const fiscalStart = new Date(bookStartsAt)
  const year = fiscalStart.getUTCFullYear()
  let boundary = Date.UTC(year, startMonth - 1, startDay)
  if (boundary <= fiscalStart.getTime())
    boundary = Date.UTC(year + 1, startMonth - 1, startDay)
  const fiscalEnd = new Date(boundary - 1)
  const firstPeriodStub = !(
    fiscalStart.getUTCMonth() + 1 === startMonth &&
    fiscalStart.getUTCDate() === startDay &&
    fiscalStart.getUTCHours() === 0 &&
    fiscalStart.getUTCMinutes() === 0 &&
    fiscalStart.getUTCSeconds() === 0 &&
    fiscalStart.getUTCMilliseconds() === 0
  )
  return {
    fiscalStart,
    fiscalEnd,
    firstPeriodStub,
    cutoffCompleted: fiscalEnd.getTime() < now.getTime(),
  }
}

/** Calendar months a fiscal period touches: 3 Mar – 31 Dec is 10. */
export function financeFiscalMonths(
  from: Date | string,
  through: Date | string,
) {
  const start = new Date(from)
  const end = new Date(through)
  return (
    end.getUTCFullYear() * 12 +
    end.getUTCMonth() -
    (start.getUTCFullYear() * 12 + start.getUTCMonth()) +
    1
  )
}

// Plain words for the preview's source gaps; unknown ids keep a readable form.
const GAP_LABELS: Record<string, [string, string]> = {
  CASH_AND_BANK_RECONCILIATION: [
    "Cash and bank checks",
    "Cash counts and bank statement matches aren't checked for the last day of the year.",
  ],
  COMMERCIAL_SALES_AND_CUSTOMER_PAYMENTS: [
    "Sales and Customer payments",
    "Some sales and payments are recorded outside Finance.",
  ],
  SUPPLIER_DOCUMENTS_AND_SETTLEMENTS: [
    "Supplier bills and payments",
    "Supplier bills and what you paid them aren't fully checked.",
  ],
  INVENTORY_COSTS: [
    "Stock costs",
    "What your stock cost isn't fully linked to Finance yet.",
  ],
  OPENING_BALANCE_RECONCILIATION: [
    "Starting balances",
    "The balances you added once aren't checked against your old books.",
  ],
  ASSETS_LOANS_ACCRUALS_AND_TAX: [
    "Equipment, loans, unpaid bills and tax",
    "These aren't recorded in Finance yet.",
  ],
}

export function financeYearEndGapLabel(gap: string): [string, string] {
  const known = GAP_LABELS[gap]
  if (known) return known
  const words = gap.toLowerCase().split("_").join(" ")
  return [words.charAt(0).toUpperCase() + words.slice(1), ""]
}

export type FinanceYearEndBlocker = {
  id: string
  title: string
  detail: string
}

function names(list: string[]) {
  if (list.length < 2) return list.join("")
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`
}

/**
 * Every reason the preview can't close, in the order people should act on
 * them. The server always answers canClose: false until the close command
 * exists, so "not available yet" is always listed.
 */
export function financeYearEndBlockers(
  preview: Pick<
    FinanceYearEndPreview,
    "cutoffCompleted" | "fiscalEnd" | "coverageGaps" | "cashEvidence"
  >,
  formatDate: (value: Date | string) => string,
): FinanceYearEndBlocker[] {
  const through = formatDate(preview.fiscalEnd)
  const blockers: FinanceYearEndBlocker[] = []
  if (!preview.cutoffCompleted)
    blockers.push({
      id: "YEAR_NOT_ENDED",
      title: "The year hasn't ended",
      detail: `Your year ends ${through}. These numbers change until then.`,
    })
  blockers.push({
    id: "CLOSE_NOT_AVAILABLE",
    title: "Closing a year isn't in EwaTrade yet",
    detail: "You can see what will happen. The close step comes later.",
  })
  if (preview.coverageGaps.length)
    blockers.push({
      id: "SOURCE_GAPS",
      title: "Some records aren't checked yet",
      detail: `${preview.coverageGaps.length} kinds of records aren't fully linked to Finance, so profit may be incomplete.`,
    })
  const cash = preview.cashEvidence
  const different = cash.cash.filter((row) => row.status === "BLOCKED")
  const uncounted = cash.cash.filter(
    (row) => row.status !== "PASS" && row.observedBalanceMinor === null,
  )
  if (different.length)
    blockers.push({
      id: "CASH_DIFFERENT",
      title: "Cash counted doesn't match your records",
      detail: `Check ${names(different.map((row) => row.name))} for ${through}.`,
    })
  if (uncounted.length)
    blockers.push({
      id: "CASH_NOT_COUNTED",
      title: "Cash isn't counted on the last day",
      detail: `Count ${names(uncounted.map((row) => row.name))} on ${through}.`,
    })
  if (!cash.countCoverageComplete || !cash.commandCoverageComplete)
    blockers.push({
      id: "CASH_REVIEW_LIMIT",
      title: "Too many cash counts to check here",
      detail: `There are more than ${cash.reviewLimit} cash counts for ${through}, so this check is incomplete.`,
    })
  return blockers
}

export type FinanceYearEndAccountRow = {
  accountId: string
  code: string
  name: string
  nowMinor: string
  afterMinor: string
}

/**
 * What year end does to each account: every income and expense balance goes
 * to zero and the profit (or loss) lands in Retained earnings. Accounts with
 * nothing to move are left out.
 */
export function financeYearEndAccountRows(
  preview: Pick<
    FinanceYearEndPreview,
    | "temporaryAccounts"
    | "trialBalance"
    | "retainedEarningsAccountId"
    | "earningsMinor"
  >,
) {
  const moving = preview.temporaryAccounts.filter(
    (row) => BigInt(row.closingBalanceMinor) !== ZERO,
  )
  const toRow = (row: (typeof moving)[number]): FinanceYearEndAccountRow => ({
    accountId: row.accountId,
    code: row.code,
    name: row.name,
    nowMinor: row.closingBalanceMinor,
    afterMinor: "0",
  })
  const income = moving.filter((row) => row.kind === "INCOME").map(toRow)
  const expenses = moving.filter((row) => row.kind === "EXPENSE").map(toRow)
  const control = preview.trialBalance.accounts.find(
    (row) => row.accountId === preview.retainedEarningsAccountId,
  )
  const retainedNow = control?.closingBalanceMinor ?? "0"
  return {
    income,
    expenses,
    earnedMinor: income
      .reduce((total, row) => total + BigInt(row.nowMinor), ZERO)
      .toString(),
    costsMinor: expenses
      .reduce((total, row) => total + BigInt(row.nowMinor), ZERO)
      .toString(),
    retained: {
      accountId: preview.retainedEarningsAccountId,
      code: control?.code ?? "",
      name: control?.name ?? "Retained earnings",
      nowMinor: retainedNow,
      afterMinor: (
        BigInt(retainedNow) + BigInt(preview.earningsMinor)
      ).toString(),
    } satisfies FinanceYearEndAccountRow,
    hasActivity: moving.length > 0,
  }
}

export type FinanceYearEndEntryLine = {
  key: string
  name: string
  code: string
  debitMinor: string | null
  creditMinor: string | null
}

/** The proposed closing entries with account names, one list per journal. */
export function financeYearEndEntries(
  preview: Pick<FinanceYearEndPreview, "journals" | "trialBalance">,
): FinanceYearEndEntryLine[][] {
  const accounts = new Map(
    preview.trialBalance.accounts.map((row) => [row.accountId, row]),
  )
  return preview.journals.map((lines, journal) =>
    lines.map((line, index) => {
      const account = accounts.get(line.accountId)
      return {
        key: `${journal}:${index}`,
        name: account?.name ?? "Unknown account",
        code: account?.code ?? "",
        debitMinor: line.side === "DEBIT" ? line.amountMinor : null,
        creditMinor: line.side === "CREDIT" ? line.amountMinor : null,
      }
    }),
  )
}

/** Sort a year-end read failure into the states the screen shows. */
export function financeYearEndErrorKind(error: {
  message: string
  data?: { code?: string } | null
}) {
  if (error.data?.code === "FORBIDDEN") return "forbidden" as const
  if (/configure the fiscal calendar/i.test(error.message))
    return "not-configured" as const
  return "other" as const
}
