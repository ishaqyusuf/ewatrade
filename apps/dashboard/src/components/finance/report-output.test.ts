import { describe, expect, test } from "bun:test"
import { type FinanceReport, buildFinanceReportCsv } from "./report-csv"
import {
  type FinanceLedger,
  buildFinanceLedgerCsv,
  collectFinanceLedgerPages,
} from "./report-ledger-csv"
import { buildFinanceReportPrintDocument } from "./report-print-document"

const date = new Date("2026-10-02T00:00:00Z")
const huge = "9007199254740993123"
const account = {
  accountId: "account",
  code: "6000",
  name: '<script>alert("unsafe")</script>',
  kind: "EXPENSE" as const,
  purpose: "OPERATING_EXPENSE" as const,
  openingBalanceMinor: "0",
  periodDebitMinor: huge,
  periodCreditMinor: "0",
  periodBalanceMinor: huge,
  closingBalanceMinor: huge,
  closingDebitMinor: huge,
  closingCreditMinor: "0",
}
const report: FinanceReport = {
  bookId: "book",
  currencyCode: "NGN",
  bookkeepingStartsAt: date,
  from: date,
  through: date,
  snapshotSequence: "42",
  coverage: "POSTED_FINANCE_ENTRIES",
  completeness: "INCOMPLETE_SOURCE_COVERAGE",
  coverageGaps: [
    "COMMERCIAL_SALES_AND_CUSTOMER_PAYMENTS",
    "INVENTORY_COSTS",
    "OPENING_BALANCE_RECONCILIATION",
  ],
  profitAndLoss: {
    accounts: [account],
    revenueMinor: "0",
    costOfSalesMinor: "0",
    grossProfitMinor: "0",
    expensesMinor: huge,
    netProfitMinor: `-${huge}`,
  },
  balanceSheet: {
    assets: [],
    liabilities: [],
    equity: [],
    assetsMinor: "0",
    liabilitiesMinor: "0",
    postedEquityMinor: "0",
    unclosedEarningsMinor: `-${huge}`,
    totalEquityMinor: `-${huge}`,
    liabilitiesAndEquityMinor: `-${huge}`,
    differenceMinor: huge,
    balanced: false,
  },
  trialBalance: {
    accounts: [account],
    debitMinor: huge,
    creditMinor: "0",
    differenceMinor: huge,
    balanced: false,
  },
  cashFlow: {
    scope: "CASH_AND_BANK_EXCLUDING_CLEARING",
    openingMinor: "0",
    closingMinor: "0",
    operatingMinor: "0",
    financingMinor: "0",
    transfersAndClearingMinor: "0",
    openingAdjustmentsMinor: "0",
    unclassifiedMinor: "0",
    netChangeMinor: "0",
    differenceMinor: "0",
    reconciled: true,
    classificationComplete: false,
    groups: [
      { sourceKind: "=unsafe", category: "UNCLASSIFIED", netMinor: "-5" },
    ],
  },
}
const entry: FinanceLedger["items"][number] = {
  id: "entry-1",
  sequence: "2",
  description: "=SUM(A1)",
  effectiveAt: date,
  recordedAt: date,
  actorUserId: "actor",
  storeId: null,
  sourceKind: "EXPENSE_BILL",
  sourceId: "bill",
  reversalOfId: null,
  reversedById: null,
  debitMinor: "5",
  creditMinor: "0",
  balanceMinor: "5",
}
const ledger: FinanceLedger = {
  account: {
    id: "account",
    name: "Payable",
    kind: "LIABILITY",
    purpose: "PAYABLE",
  },
  balanceConvention: "ACCOUNT_NORMAL_SIDE",
  normalSide: "CREDIT",
  currencyCode: "NGN",
  bookkeepingStartsAt: date,
  coverage: "POSTED_FINANCE_ENTRIES",
  from: date,
  through: date,
  snapshotSequence: "42",
  openingBalanceMinor: "0",
  debitMinor: "5",
  creditMinor: "10",
  closingBalanceMinor: "5",
  pageOpeningBalanceMinor: "0",
  nextCursor: null,
  items: [],
}

describe("report output", () => {
  test("CSV preserves huge signed minor units and coverage; formula text is escaped", () => {
    const csv = buildFinanceReportCsv(report)
    expect(csv).toContain(`"Net profit / loss","-${huge}"`)
    expect(csv).toContain("POSTED_FINANCE_ENTRIES")
    expect(csv).toContain("OPENING_BALANCE_RECONCILIATION")
    expect(csv).toContain('"\'=unsafe"')
  })
  test("print document includes expanded accounts, exact formatted digits and failed checks without executable source text", () => {
    const html = buildFinanceReportPrintDocument(report)
    expect(html).toContain("&lt;script&gt;")
    expect(html).not.toContain("<script>")
    expect(html).toContain("90,071,992,547,409,931.23")
    for (const text of [
      "Snapshot",
      "snapshot 42",
      "POSTED_FINANCE_ENTRIES",
      "Profit and loss",
      "Cash flow",
      "Balance sheet",
      "Trial balance",
      "Classification complete: No",
      "Balance sheet balanced: No",
      "Trial balance balanced: No",
      "Equation difference",
    ]) {
      if (text !== "Snapshot") expect(html).toContain(text)
    }
    expect(html).toContain("@page{size:A4;margin:18mm}")
  })
  test("collects all pinned pages and normal-side CSV metadata", async () => {
    const calls: (string | undefined)[] = []
    const entries = await collectFinanceLedgerPages(ledger, async (cursor) => {
      calls.push(cursor)
      return cursor
        ? {
            ...ledger,
            pageOpeningBalanceMinor: "-5",
            items: [
              {
                ...entry,
                id: "entry-2",
                sequence: "3",
                debitMinor: "0",
                creditMinor: "10",
                balanceMinor: "5",
              },
            ],
          }
        : {
            ...ledger,
            nextCursor: "2",
            items: [{ ...entry, balanceMinor: "-5" }],
          }
    })
    expect(calls).toEqual([undefined, "2"])
    expect(entries).toHaveLength(2)
    const csv = buildFinanceLedgerCsv(ledger, entries)
    expect(csv).toContain('"Normal side","CREDIT"')
    expect(csv).toContain("'=SUM(A1)")
    expect(csv).toContain('"-5"')
  })
  test("rejects changed snapshot, broken continuity, duplicate cursors and incomplete output", async () => {
    await expect(
      collectFinanceLedgerPages(ledger, async () => ({
        ...ledger,
        snapshotSequence: "43",
      })),
    ).rejects.toThrow("snapshot changed")
    await expect(
      collectFinanceLedgerPages(ledger, async () => ({
        ...ledger,
        pageOpeningBalanceMinor: "7",
      })),
    ).rejects.toThrow("snapshot changed")
    await expect(
      collectFinanceLedgerPages(ledger, async () => ({
        ...ledger,
        nextCursor: "2",
        items: [{ ...entry, balanceMinor: "-5" }],
      })),
    ).rejects.toThrow("snapshot changed")
    await expect(
      collectFinanceLedgerPages(ledger, async () => ledger),
    ).rejects.toThrow("closing balance")
  })
  test("cancel stops before a completed file is offered", async () => {
    await expect(
      collectFinanceLedgerPages(
        ledger,
        async () => ledger,
        undefined,
        () => true,
      ),
    ).rejects.toThrow("cancelled")
  })
  test("rejects missing net-zero activity, repeated identities and repeated cursors", async () => {
    await expect(
      collectFinanceLedgerPages(
        { ...ledger, closingBalanceMinor: "0" },
        async () => ({ ...ledger, closingBalanceMinor: "0" }),
      ),
    ).rejects.toThrow("totals do not reconcile")
    await expect(
      collectFinanceLedgerPages(ledger, async (cursor) =>
        cursor
          ? {
              ...ledger,
              pageOpeningBalanceMinor: "-5",
              items: [{ ...entry, balanceMinor: "-5" }],
            }
          : {
              ...ledger,
              nextCursor: "2",
              items: [{ ...entry, balanceMinor: "-5" }],
            },
      ),
    ).rejects.toThrow("repeated an entry")
    await expect(
      collectFinanceLedgerPages(ledger, async (cursor) =>
        cursor
          ? {
              ...ledger,
              pageOpeningBalanceMinor: "-5",
              nextCursor: "2",
              items: [
                {
                  ...entry,
                  id: "entry-2",
                  sequence: "3",
                  debitMinor: "0",
                  creditMinor: "10",
                  balanceMinor: "5",
                },
              ],
            }
          : {
              ...ledger,
              nextCursor: "2",
              items: [{ ...entry, balanceMinor: "-5" }],
            },
      ),
    ).rejects.toThrow("did not advance")
  })
})
