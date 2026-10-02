import { expect, test } from "bun:test"
import {
  type SupplierAgingSource,
  calculateSupplierPayableAging,
  supplierAgingBucket,
  supplierAgingDate,
} from "./supplier-aging-rules"

const start = new Date("2026-01-01T00:00:00.000Z")
const date = (day: string) => new Date(`${day}T12:00:00.000Z`)
import { agingSource } from "./supplier-aging-test-fixture"

function calculate(
  sources: SupplierAgingSource[],
  payable: bigint,
  advance = BigInt(0),
  asOfDate = "2026-05-01",
) {
  return calculateSupplierPayableAging({
    bookId: "book",
    supplierId: "supplier",
    bookStartsAt: start,
    snapshotSequence: BigInt(2000),
    asOfDate,
    sources,
    payableControlMinor: payable,
    advanceControlMinor: advance,
  })
}

test("UTC due-date boundaries retain undated and distinguish due today", () => {
  for (const [days, bucket] of [
    [-1, "NOT_DUE"],
    [0, "DUE_TODAY"],
    [1, "OVERDUE_1_30"],
    [30, "OVERDUE_1_30"],
    [31, "OVERDUE_31_60"],
    [60, "OVERDUE_31_60"],
    [61, "OVERDUE_61_90"],
    [90, "OVERDUE_61_90"],
    [91, "OVERDUE_91_PLUS"],
  ] as const) {
    const due = new Date(
      Date.parse("2026-05-01T23:59:59.999Z") - days * 86_400_000,
    )
    expect(supplierAgingBucket(due, "2026-05-01")).toEqual({
      bucket,
      daysOverdue: Math.max(0, days),
    })
  }
  expect(supplierAgingBucket(null, "2026-05-01")).toEqual({
    bucket: "UNDATED",
    daysOverdue: null,
  })
  expect(
    supplierAgingBucket(new Date("2026-05-02T00:30:00+01:00"), "2026-05-01")
      .bucket,
  ).toBe("DUE_TODAY")
})

test("leap day and month/year crossings count exact UTC days", () => {
  expect(
    supplierAgingBucket(date("2024-02-29"), "2024-03-01").daysOverdue,
  ).toBe(1)
  expect(
    supplierAgingBucket(date("2024-01-31"), "2024-03-01").daysOverdue,
  ).toBe(30)
  expect(
    supplierAgingBucket(date("2025-12-31"), "2026-01-01").daysOverdue,
  ).toBe(1)
  expect(
    supplierAgingBucket(new Date("0099-01-01T00:00:00Z"), "0099-01-02")
      .daysOverdue,
  ).toBe(1)
  for (const invalid of [
    "2026-02-29",
    "2024-02-30",
    "2026-10-1",
    "2026-10-01T00:00:00Z",
    "0000-01-01",
    "9999-12-31",
  ]) {
    expect(() => supplierAgingDate(invalid)).toThrow()
  }
})

test("part-paid invoice and cash reversal reconstruct historical residuals", () => {
  const bill = agingSource({
    id: "bill",
    sequence: 1,
    dueAt: date("2026-04-01"),
  })
  const payment = agingSource({
    id: "payment",
    sequence: 2,
    kind: "PURCHASE_PAYMENT",
    billId: "bill",
    amount: BigInt(300),
    effectiveAt: date("2026-04-02"),
  })
  const reversal = agingSource({
    id: "reversal",
    sequence: 3,
    kind: "REVERSAL",
    reversal: payment,
    amount: BigInt(300),
    effectiveAt: date("2026-04-03"),
  })
  expect(
    calculate([bill, payment], BigInt(700)).data[0]?.outstandingMinor,
  ).toBe("700")
  expect(
    calculate([reversal, payment, bill], BigInt(1000)).data[0]
      ?.outstandingMinor,
  ).toBe("1000")
  expect(
    calculate([bill], BigInt(1000), BigInt(0), "2026-04-01").buckets.find(
      (b) => b.bucket === "DUE_TODAY",
    )?.amountMinor,
  ).toBe("1000")
})

test("invoice cancellation and opening reversal remove only their original liability", () => {
  const bill = agingSource({ id: "bill", sequence: 1 })
  const reversal = agingSource({
    id: "cancel",
    sequence: 2,
    kind: "REVERSAL",
    reversal: bill,
    effectiveAt: date("2026-04-01"),
  })
  const opening = agingSource({
    id: "opening",
    sequence: 3,
    kind: "OPENING_PAYABLE",
    amount: BigInt(50),
  })
  const result = calculate([bill, reversal, opening], BigInt(50))
  expect(result.data).toHaveLength(1)
  expect(
    result.buckets.find((bucket) => bucket.bucket === "UNDATED")?.amountMinor,
  ).toBe("50")
  const undo = agingSource({
    id: "undo-opening",
    sequence: 4,
    kind: "REVERSAL",
    reversal: opening,
    amount: BigInt(50),
    effectiveAt: date("2026-04-02"),
  })
  expect(calculate([bill, reversal, opening, undo], BigInt(0)).data).toEqual([])
})

test("allocation and partial release reduce one bill and retain a separate advance control", () => {
  const advance = agingSource({
    id: "advance",
    sequence: 1,
    kind: "ADVANCE",
  })
  const bill = agingSource({ id: "bill", sequence: 2 })
  const allocation = agingSource({
    id: "allocation",
    sequence: 3,
    kind: "ADVANCE_ALLOCATION",
    billId: "bill",
    amount: BigInt(400),
  })
  allocation.settledAllocation = {
    id: "allocation-doc",
    bookId: "book",
    supplierId: "supplier",
    billId: "bill",
    advanceEntryId: "advance",
    amountMinor: BigInt(400),
    effectiveAt: allocation.effectiveAt,
    actorUserId: "owner",
  }
  allocation.journalEntry.sourceId = "allocation-doc"
  const release = agingSource({
    id: "release",
    sequence: 4,
    kind: "ALLOCATION_RELEASE",
    billId: "bill",
    amount: BigInt(100),
  })
  release.releasedAllocation = {
    id: "release-doc",
    bookId: "book",
    supplierId: "supplier",
    amountMinor: BigInt(100),
    effectiveAt: release.effectiveAt,
    actorUserId: "owner",
    allocation: {
      id: "allocation-doc",
      billId: "bill",
      supplierEntryId: "allocation",
    },
  }
  release.journalEntry.sourceId = "release-doc"
  expect(
    calculate([advance, bill, allocation], BigInt(600), BigInt(600))
      .advanceMinor,
  ).toBe("600")
  const result = calculate(
    [advance, bill, allocation, release],
    BigInt(700),
    BigInt(700),
  )
  expect(result.payableMinor).toBe("700")
  expect(result.advanceMinor).toBe("700")
  expect(result.data[0]?.outstandingMinor).toBe("700")
  const secondAdvance = agingSource({
    id: "second-advance",
    sequence: 5,
    kind: "OPENING_ADVANCE",
  })
  const consumedReversal = agingSource({
    id: "consumed-reversal",
    sequence: 6,
    kind: "REVERSAL",
    reversal: advance,
  })
  expect(() =>
    calculate(
      [advance, bill, allocation, release, secondAdvance, consumedReversal],
      BigInt(700),
      BigInt(700),
    ),
  ).toThrow("reconciliation")
  const overRelease = structuredClone(release)
  overRelease.amountMinor = BigInt(401)
  if (!overRelease.releasedAllocation)
    throw new Error("Missing release fixture")
  overRelease.releasedAllocation.amountMinor = BigInt(401)
  expect(() =>
    calculate(
      [advance, bill, allocation, overRelease],
      BigInt(1001),
      BigInt(1001),
    ),
  ).toThrow("reconciliation")
})

test("large bucket totals stay exact beyond Number safe integer", () => {
  const sources = Array.from({ length: 101 }, (_, index) => {
    const source = agingSource({
      id: `bill-${index}`,
      sequence: index + 1,
      amount: BigInt(100_000_000_000_000),
    })
    if (source.bill) source.bill.totalMinor = source.amountMinor
    return source
  })
  expect(calculate(sources, BigInt("10100000000000000")).payableMinor).toBe(
    "10100000000000000",
  )
})

test("corrupt attribution, inverse, negative residual and mismatched controls fail explicitly", () => {
  const bill = agingSource({ id: "bill", sequence: 1 })
  for (const mutate of [
    (source: SupplierAgingSource) => {
      source.supplierId = "other"
    },
    (source: SupplierAgingSource) => {
      source.bookId = "other"
    },
    (source: SupplierAgingSource) => {
      source.journalEntry.sourceId = "other"
    },
    (source: SupplierAgingSource) => {
      source.journalEntry.sequence = BigInt(2001)
    },
    (source: SupplierAgingSource) => {
      source.effectiveAt = date("2026-05-02")
    },
    (source: SupplierAgingSource) => {
      if (source.bill) source.bill.dueAt = date("2025-12-01")
    },
  ]) {
    const changed = structuredClone(bill)
    mutate(changed)
    expect(() => calculate([changed], BigInt(1000))).toThrow("reconciliation")
  }
  const overpayment = agingSource({
    id: "over",
    sequence: 2,
    kind: "PURCHASE_PAYMENT",
    billId: "bill",
    amount: BigInt(1001),
  })
  expect(() => calculate([bill, overpayment], BigInt(-1))).toThrow(
    "reconciliation",
  )
  expect(() => calculate([bill], BigInt(999))).toThrow("reconciliation")
  const reversal = agingSource({
    id: "cancel",
    sequence: 2,
    kind: "REVERSAL",
    reversal: bill,
  })
  const firstLine = reversal.journalEntry.lines[0]
  if (!firstLine) throw new Error("Missing inverse line")
  firstLine.accountId = "wrong"
  expect(() => calculate([bill, reversal], BigInt(0))).toThrow("reconciliation")
  expect(() =>
    calculate(
      Array.from({ length: 1001 }, () => bill),
      BigInt(0),
    ),
  ).toThrow("source limit")
})
