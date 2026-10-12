import { expect, test } from "bun:test"
import { postedProfitBusinessReport } from "./finance"
test("G01 posted profit retains canonical missing costs instead of claiming actual zero", () => {
  const report = postedProfitBusinessReport({
    bookId: "book",
    snapshotSequence: "9",
    currencyCode: "NGN",
    from: new Date("2026-10-10T00:00:00Z"),
    through: new Date("2026-10-12T00:00:00Z"),
    coverage: "POSTED_FINANCE_ENTRIES",
    completeness: "INCOMPLETE_SOURCE_COVERAGE",
    coverageGaps: [
      "COMMERCIAL_SALES_AND_CUSTOMER_PAYMENTS",
      "INVENTORY_COSTS",
      "OPENING_BALANCE_RECONCILIATION",
    ],
    profitAndLoss: {
      accounts: [],
      revenueMinor: "1000",
      costOfSalesMinor: "0",
      grossProfitMinor: "1000",
      expensesMinor: "20",
      netProfitMinor: "980",
    },
  })
  expect(report.summary).toContain(
    "whole-business profit and cost completeness remain unknown",
  )
  expect(report.sourceCoverage?.gaps).toContain("INVENTORY_COSTS")
  expect(report.gaps.join(" ")).toContain("inventory costs")
  expect(report.rows[1]?.detail).toContain("not known zero actual cost")
  expect(report.period?.end).toBe("inclusive")
  expect(report.scope).toContain("all Stores")
})
test("G01 scope projection shares canonical allocation release arithmetic exactly", async () => {
  const { customerLedgerTotalsFromAggregates } = await import(
    "../customer-ledger/totals-projection"
  )
  expect(
    customerLedgerTotalsFromAggregates({
      debit: 9007199254740993n,
      credit: 700n,
      allocations: 600n,
      releases: 100n,
    }),
  ).toEqual({
    debitMinor: "9007199254740993",
    creditMinor: "700",
    allocatedMinor: "500",
    outstandingDebtMinor: "9007199254740493",
    availableCreditMinor: "200",
    netBalanceMinor: "9007199254740293",
  })
})

test("G01 supplier buckets retain whole canonical payable and separate advances", async () => {
  const { supplierAgingBusinessReport } = await import("./finance")
  const report = supplierAgingBusinessReport({
    supplier: {
      id: "original_supplier",
      bookId: "original_book",
      code: "SUP1",
      name: "Original supplier",
    },
    asOfDate: "2026-10-12",
    snapshotSequence: "9",
    currencyCode: "NGN",
    payableMinor: "9007199254740993",
    advanceMinor: "500",
    sourcesRead: 147,
    sourceLimit: 1000,
    buckets: [
      { bucket: "UNDATED", amountMinor: "9007199254740993", sourceCount: 147 },
    ],
  })
  expect(report.summary).toContain("payable 9007199254740993; advance 500")
  expect(report.rows[0]?.detail).toContain("original_supplier")
  expect(report.rows[0]?.value).toContain("9007199254740993")
  expect(report.gaps.join(" ")).toContain("No limited source page is summed")
  expect(report.scope).toContain("all Stores")
})
