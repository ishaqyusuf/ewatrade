export type FinanceReportAccountOutput = {
  accountId: string
  code: string
  name: string
  kind: string
  periodBalanceMinor: string
  closingBalanceMinor: string
  closingDebitMinor: string
  closingCreditMinor: string
}
export type FinanceReportOutput = {
  bookId: string
  currencyCode: string
  from: Date
  through: Date
  bookkeepingStartsAt: Date
  snapshotSequence: string
  coverage: string
  completeness: string
  coverageGaps: readonly string[]
  profitAndLoss: {
    revenueMinor: string
    costOfSalesMinor: string
    grossProfitMinor: string
    expensesMinor: string
    netProfitMinor: string
    accounts: FinanceReportAccountOutput[]
  }
  balanceSheet: {
    assetsMinor: string
    liabilitiesMinor: string
    postedEquityMinor: string
    unclosedEarningsMinor: string
    totalEquityMinor: string
    liabilitiesAndEquityMinor: string
    differenceMinor: string
    balanced: boolean
    assets: FinanceReportAccountOutput[]
    liabilities: FinanceReportAccountOutput[]
    equity: FinanceReportAccountOutput[]
  }
  cashFlow: {
    scope: string
    openingMinor: string
    operatingMinor: string
    financingMinor: string
    transfersAndClearingMinor: string
    openingAdjustmentsMinor: string
    unclassifiedMinor: string
    netChangeMinor: string
    closingMinor: string
    differenceMinor: string
    classificationComplete: boolean
    groups: { sourceKind: string; category: string; netMinor: string }[]
  }
  trialBalance: {
    accounts: FinanceReportAccountOutput[]
    debitMinor: string
    creditMinor: string
    differenceMinor: string
  }
}
export type FinanceLedgerOutput = {
  account: { id: string; name: string }
  currencyCode: string
  from: Date
  through: Date
  snapshotSequence: string
  coverage: string
  balanceConvention: string
  normalSide: string
  openingBalanceMinor: string
  debitMinor: string
  creditMinor: string
  closingBalanceMinor: string
  pageOpeningBalanceMinor: string
  nextCursor: string | null
  items: {
    id: string
    sequence: string
    effectiveAt: Date
    recordedAt: Date
    description: string
    sourceKind: string
    sourceId: string
    debitMinor: string
    creditMinor: string
    balanceMinor: string
    reversalOfId: string | null
    reversedById: string | null
  }[]
}

function financeCsvCell(value: string) {
  // Signed integer amounts are safe literals; preserve every digit for import.
  const safe =
    !/^-?\d+$/.test(value) && /^[\s]*[=+@-]/.test(value) ? `'${value}` : value
  return `"${safe.replaceAll('"', '""')}"`
}

export function buildFinanceReportCsv(report: FinanceReportOutput) {
  const profit = report.profitAndLoss
  const position = report.balanceSheet
  const cash = report.cashFlow
  const rows: string[][] = [
    ["EwaTrade financial report", "Posted finance entries only"],
    ["Book ID", report.bookId],
    ["Currency", report.currencyCode],
    ["Period from UTC", new Date(report.from).toISOString()],
    ["Period through UTC", new Date(report.through).toISOString()],
    [
      "Bookkeeping starts UTC",
      new Date(report.bookkeepingStartsAt).toISOString(),
    ],
    ["Journal snapshot", report.snapshotSequence],
    ["Coverage", report.coverage],
    ["Completeness", report.completeness],
    ["Missing coverage", report.coverageGaps.join("; ")],
    [
      "Amount convention",
      "Exact integer minor units. Import amount columns as text to preserve large values.",
    ],
    ["Important", "Balanced journals do not prove complete business records."],
    [],
    ["PROFIT AND LOSS", "Period amount (minor units)"],
    ["Revenue", profit.revenueMinor],
    ["Cost of sales", profit.costOfSalesMinor],
    ["Gross profit", profit.grossProfitMinor],
    ["Other expenses", profit.expensesMinor],
    ["Net profit / loss", profit.netProfitMinor],
    [],
    ["P&L account ID", "Code", "Name", "Kind", "Period balance minor"],
    ...profit.accounts.map((account) => [
      account.accountId,
      account.code,
      account.name,
      account.kind,
      account.periodBalanceMinor,
    ]),
    [],
    ["BALANCE SHEET", "As-of amount (minor units)"],
    ["Assets", position.assetsMinor],
    ["Liabilities", position.liabilitiesMinor],
    ["Posted equity", position.postedEquityMinor],
    ["Unclosed earnings", position.unclosedEarningsMinor],
    ["Total equity", position.totalEquityMinor],
    ["Liabilities and equity", position.liabilitiesAndEquityMinor],
    ["Equation difference", position.differenceMinor],
    [],
    [
      "Balance-sheet account ID",
      "Code",
      "Name",
      "Kind",
      "Closing balance minor",
    ],
    ...[...position.assets, ...position.liabilities, ...position.equity].map(
      (account) => [
        account.accountId,
        account.code,
        account.name,
        account.kind,
        account.closingBalanceMinor,
      ],
    ),
    [],
    ["CASH FLOW", "Period amount (minor units)"],
    ["Scope", cash.scope],
    ["Opening cash and bank", cash.openingMinor],
    ["Operating movement", cash.operatingMinor],
    ["Owner financing movement", cash.financingMinor],
    ["Transfers and clearing movement", cash.transfersAndClearingMinor],
    ["Opening imports", cash.openingAdjustmentsMinor],
    ["Unclassified movement", cash.unclassifiedMinor],
    ["Net change", cash.netChangeMinor],
    ["Closing cash and bank", cash.closingMinor],
    ["Reconciliation difference", cash.differenceMinor],
    ["Classification complete", String(cash.classificationComplete)],
    [],
    ["Cash source kind", "Classification", "Net movement minor"],
    ...cash.groups.map((group) => [
      group.sourceKind,
      group.category,
      group.netMinor,
    ]),
    [],
    ["TRIAL BALANCE", "As of period through date"],
    [
      "Account ID",
      "Code",
      "Name",
      "Kind",
      "Closing debit minor",
      "Closing credit minor",
    ],
    ...report.trialBalance.accounts.map((account) => [
      account.accountId,
      account.code,
      account.name,
      account.kind,
      account.closingDebitMinor,
      account.closingCreditMinor,
    ]),
    [
      "Total",
      "",
      "",
      "",
      report.trialBalance.debitMinor,
      report.trialBalance.creditMinor,
    ],
    ["Difference minor", report.trialBalance.differenceMinor],
  ]
  return rows.map((row) => row.map(financeCsvCell).join(",")).join("\r\n")
}

export function buildFinanceLedgerCsv(
  ledger: FinanceLedgerOutput,
  entries: FinanceLedgerOutput["items"],
) {
  const rows = [
    ["Account", ledger.account.name],
    ["Account ID", ledger.account.id],
    ["Currency", ledger.currencyCode],
    ["From UTC", ledger.from.toISOString()],
    ["Through UTC", ledger.through.toISOString()],
    ["Snapshot", ledger.snapshotSequence],
    ["Coverage", ledger.coverage],
    ["Balance convention", ledger.balanceConvention],
    ["Normal side", ledger.normalSide],
    [
      "Amounts",
      "Exact integer minor units. Import amount columns as text. Debits/credits are accounting sides, not money in/out.",
    ],
    ["Opening balance minor", ledger.openingBalanceMinor],
    ["Period debit minor", ledger.debitMinor],
    ["Period credit minor", ledger.creditMinor],
    ["Closing balance minor", ledger.closingBalanceMinor],
    [],
    [
      "Entry ID",
      "Sequence",
      "Effective UTC",
      "Recorded UTC",
      "Description",
      "Source kind",
      "Source ID",
      "Debit minor",
      "Credit minor",
      "Balance minor",
      "Reverses entry",
      "Reversed by entry",
    ],
    ...entries.map((e) => [
      e.id,
      e.sequence,
      e.effectiveAt.toISOString(),
      e.recordedAt.toISOString(),
      e.description,
      e.sourceKind,
      e.sourceId,
      e.debitMinor,
      e.creditMinor,
      e.balanceMinor,
      e.reversalOfId ?? "",
      e.reversedById ?? "",
    ]),
  ]
  return rows.map((row) => row.map(financeCsvCell).join(",")).join("\r\n")
}

export async function collectFinanceLedgerPages(
  first: FinanceLedgerOutput,
  fetchPage: (cursor?: string) => Promise<FinanceLedgerOutput>,
  onProgress?: (count: number) => void,
  cancelled: () => boolean = () => false,
) {
  const entries: FinanceLedgerOutput["items"] = []
  const cursors = new Set<string>()
  const ids = new Set<string>()
  let cursor: string | undefined
  let opening = first.openingBalanceMinor
  let debit = BigInt(0)
  let credit = BigInt(0)
  let previous: { effectiveAt: Date; sequence: bigint } | undefined
  if (
    first.balanceConvention !== "ACCOUNT_NORMAL_SIDE" ||
    !["DEBIT", "CREDIT"].includes(first.normalSide)
  )
    throw new Error("Account export has an unsupported balance convention.")
  do {
    if (cancelled()) throw new Error("Export cancelled.")
    const page = await fetchPage(cursor)
    if (cancelled()) throw new Error("Export cancelled.")
    if (
      page.snapshotSequence !== first.snapshotSequence ||
      page.account.id !== first.account.id ||
      page.currencyCode !== first.currencyCode ||
      page.from.getTime() !== first.from.getTime() ||
      page.through.getTime() !== first.through.getTime() ||
      page.openingBalanceMinor !== first.openingBalanceMinor ||
      page.closingBalanceMinor !== first.closingBalanceMinor ||
      page.debitMinor !== first.debitMinor ||
      page.creditMinor !== first.creditMinor ||
      page.normalSide !== first.normalSide ||
      page.balanceConvention !== first.balanceConvention ||
      page.coverage !== first.coverage ||
      page.pageOpeningBalanceMinor !== opening
    )
      throw new Error(
        "Account snapshot changed during export. Refresh and retry.",
      )
    for (const entry of page.items) {
      if (ids.has(entry.id))
        throw new Error("Account pagination repeated an entry.")
      const entryDebit = BigInt(entry.debitMinor)
      const entryCredit = BigInt(entry.creditMinor)
      const sequence = BigInt(entry.sequence)
      const at = entry.effectiveAt.getTime()
      if (
        entryDebit < BigInt(0) ||
        entryCredit < BigInt(0) ||
        sequence < BigInt(1) ||
        sequence > BigInt(first.snapshotSequence) ||
        !Number.isFinite(at) ||
        at < first.from.getTime() ||
        at > first.through.getTime() ||
        (previous &&
          (at < previous.effectiveAt.getTime() ||
            (at === previous.effectiveAt.getTime() &&
              sequence <= previous.sequence)))
      )
        throw new Error("Account export has invalid or out-of-order entries.")
      const movement =
        first.normalSide === "DEBIT"
          ? entryDebit - entryCredit
          : entryCredit - entryDebit
      if ((BigInt(opening) + movement).toString() !== entry.balanceMinor)
        throw new Error("Account export running balance does not reconcile.")
      previous = { effectiveAt: entry.effectiveAt, sequence }
      debit += entryDebit
      credit += entryCredit
      ids.add(entry.id)
      entries.push(entry)
      opening = entry.balanceMinor
    }
    onProgress?.(entries.length)
    cursor = page.nextCursor ?? undefined
    if (cursor && (cursors.has(cursor) || !page.items.length))
      throw new Error("Account pagination did not advance.")
    if (cursor) cursors.add(cursor)
  } while (cursor)
  if (opening !== first.closingBalanceMinor)
    throw new Error("Account export did not reach the closing balance.")
  if (
    debit.toString() !== first.debitMinor ||
    credit.toString() !== first.creditMinor
  )
    throw new Error("Account export totals do not reconcile.")
  return entries
}
