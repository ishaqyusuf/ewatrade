import { expect, test } from "bun:test"
import type { LedgerStatement } from "../../components/customer-ledger/types"
import {
  collectCustomerLedgerExport,
  customerLedgerCsv,
} from "./statement-export"
const first: LedgerStatement = {
  accountId: "a",
  customerId: "c",
  currencyCode: "NGN",
  currentRevision: "4",
  snapshotSequence: "3",
  coverage: "POSTED_CUSTOMER_LEDGER_ENTRIES",
  completeness: "INCOMPLETE_SOURCE_COVERAGE",
  totals: {
    debitMinor: "9007199254740993",
    creditMinor: "1",
    allocatedMinor: "0",
    outstandingDebtMinor: "9007199254740993",
    availableCreditMinor: "1",
    netBalanceMinor: "9007199254740992",
  },
  entries: [
    {
      id: "entry",
      sequence: "1",
      kind: "RECEIPT",
      side: "CREDIT",
      amountMinor: "1",
      sourceKind: "CUSTOMER_RECEIPT",
      sourceId: "receipt",
      orderId: null,
      storeId: null,
      actorUserId: "owner",
      reversalOfId: null,
      effectiveAt: new Date("2026-10-02"),
      recordedAt: new Date("2026-10-02"),
      description: '=SUM(1,2) "quoted"',
      runningBalanceMinor: "-1",
    },
  ],
  nextCursor: "1",
}
function fixtureEntry() {
  const entry = first.entries.at(0)
  if (!entry) throw new Error("Fixture entry missing")
  return entry
}
test("whole export reads each page at the original snapshot, preserving exact integers", async () => {
  let calls = 0
  const entries = await collectCustomerLedgerExport(first, async (after) => {
    expect(after).toBe("1")
    calls++
    return {
      ...first,
      entries: [
        {
          ...(first.entries.at(0) ??
            (() => {
              throw new Error("Fixture entry missing")
            })()),
          id: "second",
          sequence: "2",
          kind: "OPENING_DEBT",
          side: "DEBIT",
          amountMinor: first.totals.debitMinor,
          runningBalanceMinor: first.totals.netBalanceMinor,
        },
      ],
      nextCursor: null,
    }
  })
  expect(calls).toBe(1)
  expect(entries).toHaveLength(2)
  const csv = customerLedgerCsv(first, entries)
  expect(csv).toContain("9007199254740993")
  expect(csv).toContain("incomplete source coverage")
  expect(csv).toContain("'=SUM")
  expect(csv).toContain('"-1"')
  expect(csv).not.toContain('"\'-1"')
  expect(csv).toContain('"Account ID","a"')
})
test("changed snapshot, cyclic cursor and oversize exports refuse a partial file", async () => {
  await expect(
    collectCustomerLedgerExport(first, async () => ({
      ...first,
      snapshotSequence: "4",
      nextCursor: null,
    })),
  ).rejects.toThrow("snapshot changed")
  await expect(
    collectCustomerLedgerExport(first, async () => ({ ...first, entries: [] })),
  ).rejects.toThrow("invalid cursor")
  await expect(
    collectCustomerLedgerExport(first, async () => first, 1),
  ).rejects.toThrow("safe bound")
})
test("duplicate identities, missing entries and incorrect intermediate balances refuse export", async () => {
  const creditOnly = {
    ...first,
    snapshotSequence: "2",
    totals: {
      debitMinor: "0",
      creditMinor: "2",
      allocatedMinor: "0",
      outstandingDebtMinor: "0",
      availableCreditMinor: "2",
      netBalanceMinor: "-2",
    },
    entries: [],
    nextCursor: null,
  }
  const entry = fixtureEntry()
  for (const entries of [
    [entry, { ...entry, sequence: "2", runningBalanceMinor: "-2" }],
    [
      { ...entry, runningBalanceMinor: "0" },
      { ...entry, id: "second", sequence: "2", runningBalanceMinor: "-2" },
    ],
    [entry],
    [{ ...entry, sequence: "3" }],
    [{ ...entry, amountMinor: "-1" }],
  ])
    await expect(
      collectCustomerLedgerExport(
        { ...creditOnly, entries },
        async () => creditOnly,
      ),
    ).rejects.toThrow("does not reconcile")
})
test("all-page controls stay pinned while live account revision may advance", async () => {
  const second = {
    ...first,
    currentRevision: "5",
    entries: [
      {
        ...fixtureEntry(),
        id: "second",
        sequence: "2",
        side: "DEBIT",
        amountMinor: first.totals.debitMinor,
        runningBalanceMinor: first.totals.netBalanceMinor,
      },
    ],
    nextCursor: null,
  }
  for (const patch of [
    { customerId: "other" },
    { totals: { ...first.totals, availableCreditMinor: "2" } },
  ])
    await expect(
      collectCustomerLedgerExport(first, async () => ({ ...second, ...patch })),
    ).rejects.toThrow("snapshot changed")
  for (const field of ["coverage", "completeness"]) {
    const corrupted = { ...second }
    Object.defineProperty(corrupted, field, {
      value: "UNKNOWN_TRANSPORT_VALUE",
    })
    await expect(
      collectCustomerLedgerExport(first, async () => corrupted),
    ).rejects.toThrow("snapshot changed")
  }
  expect(
    await collectCustomerLedgerExport(first, async () => second),
  ).toHaveLength(2)
})
test("leaving the account before or during export prevents a completed file", async () => {
  let calls = 0
  let cancelled = true
  const read = async () => {
    calls++
    cancelled = true
    return first
  }
  await expect(
    collectCustomerLedgerExport(first, read, 10000, () => cancelled),
  ).rejects.toThrow("cancelled")
  expect(calls).toBe(0)
  cancelled = false
  await expect(
    collectCustomerLedgerExport(first, read, 10000, () => cancelled),
  ).rejects.toThrow("cancelled")
  expect(calls).toBe(1)
})
