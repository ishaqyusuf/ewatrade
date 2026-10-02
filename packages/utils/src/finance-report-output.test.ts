import { describe, expect, test } from "bun:test"
import {
  type FinanceLedgerOutput,
  collectFinanceLedgerPages,
} from "./finance-report-output"

const from = new Date("2026-10-01T00:00:00Z")
const through = new Date("2026-10-02T23:59:59.999Z")
const page: FinanceLedgerOutput = {
  account: { id: "payable", name: "Supplier payable" },
  currencyCode: "ZAR",
  from,
  through,
  snapshotSequence: "42",
  coverage: "POSTED_FINANCE_ENTRIES",
  balanceConvention: "ACCOUNT_NORMAL_SIDE",
  normalSide: "CREDIT",
  openingBalanceMinor: "0",
  debitMinor: "5",
  creditMinor: "10",
  closingBalanceMinor: "5",
  pageOpeningBalanceMinor: "0",
  nextCursor: null,
  items: [
    {
      id: "first",
      sequence: "2",
      effectiveAt: from,
      recordedAt: through,
      description: "Correction",
      sourceKind: "REVERSAL",
      sourceId: "original",
      debitMinor: "5",
      creditMinor: "0",
      balanceMinor: "-5",
      reversalOfId: "original",
      reversedById: null,
    },
    {
      id: "second",
      sequence: "1",
      effectiveAt: through,
      recordedAt: through,
      description: "Bill",
      sourceKind: "PURCHASE_BILL",
      sourceId: "bill",
      debitMinor: "0",
      creditMinor: "10",
      balanceMinor: "5",
      reversalOfId: null,
      reversedById: null,
    },
  ],
}
function changeEntry(
  index: number,
  changes: Partial<FinanceLedgerOutput["items"][number]>,
) {
  return {
    ...page,
    items: page.items.map((e, i) => (i === index ? { ...e, ...changes } : e)),
  }
}
describe("full ledger export evidence", () => {
  test("valid effective-date order supports backdated lower journal sequences", async () => {
    expect(
      await collectFinanceLedgerPages(page, async () => page),
    ).toHaveLength(2)
  })
  test("rejects an incorrect intermediate balance even when final balance and sums agree", async () => {
    await expect(
      collectFinanceLedgerPages(page, async () =>
        changeEntry(0, { balanceMinor: "99" }),
      ),
    ).rejects.toThrow("running balance")
  })
  test("rejects out-of-window, beyond-snapshot and negative debit/credit entries", async () => {
    for (const changes of [
      { effectiveAt: new Date("2026-09-30") },
      { effectiveAt: new Date("2026-10-03") },
      { sequence: "43" },
      { debitMinor: "-5" },
      { creditMinor: "-5" },
    ])
      await expect(
        collectFinanceLedgerPages(page, async () => changeEntry(0, changes)),
      ).rejects.toThrow("invalid or out-of-order")
  })
  test("rejects effective-date reversal and repeated sequence within an effective timestamp", async () => {
    await expect(
      collectFinanceLedgerPages(page, async () =>
        changeEntry(0, { effectiveAt: through }),
      ),
    ).rejects.toThrow("out-of-order")
    await expect(
      collectFinanceLedgerPages(page, async () =>
        changeEntry(1, { effectiveAt: from, sequence: "2" }),
      ),
    ).rejects.toThrow("out-of-order")
  })
  test("rejects changed coverage and unsupported normal-side conventions", async () => {
    await expect(
      collectFinanceLedgerPages(page, async () => ({
        ...page,
        coverage: "OTHER",
      })),
    ).rejects.toThrow("snapshot changed")
    await expect(
      collectFinanceLedgerPages(
        { ...page, normalSide: "UNKNOWN" },
        async () => page,
      ),
    ).rejects.toThrow("unsupported")
    await expect(
      collectFinanceLedgerPages(
        { ...page, balanceConvention: "MONEY_IN_OUT" },
        async () => page,
      ),
    ).rejects.toThrow("unsupported")
  })
  test("cancellation before preparation performs no further fetch", async () => {
    let calls = 0
    await expect(
      collectFinanceLedgerPages(
        page,
        async () => {
          calls++
          return page
        },
        undefined,
        () => true,
      ),
    ).rejects.toThrow("cancelled")
    expect(calls).toBe(0)
  })
})
