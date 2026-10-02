import { describe, expect, test } from "bun:test"
import {
  type CashReviewSource,
  prepareCashAdjustment,
  prepareCashAdjustmentReversal,
  prepareCashCount,
} from "./finance-cash-input"
const source: CashReviewSource = {
  id: "count",
  asOf: "2026-10-02T10:30:00.000Z",
  differenceMinor: "-2000",
  currentSnapshotSequence: "8",
  reviewRequired: false,
  adjustment: null,
}
const count = {
  bookId: "book",
  accountId: "cash",
  activeCashAccountIds: ["cash"],
  startsAt: "2026-10-01T00:00:00Z",
  asOf: new Date(source.asOf),
  amount: "0",
  reference: " Till count ",
  now: new Date("2026-10-03T00:00:00Z"),
}
describe("mobile cash count preparation", () => {
  test("physical count permits zero and freezes exact reviewed time", () => {
    const result = prepareCashCount(count)
    expect(result.observedBalanceMinor).toBe("0")
    expect(result.reference).toBe("Till count")
    expect(result.asOf.toISOString()).toBe(source.asOf)
    expect(result.asOf).not.toBe(count.asOf)
  })
  test("rejects foreign/archived cash accounts, invalid times and private references", () => {
    expect(() => prepareCashCount({ ...count, accountId: "bank" })).toThrow()
    expect(() =>
      prepareCashCount({ ...count, asOf: new Date("2026-09-30") }),
    ).toThrow()
    expect(() =>
      prepareCashCount({ ...count, asOf: new Date("2026-10-04") }),
    ).toThrow()
    expect(() => prepareCashCount({ ...count, reference: " " })).toThrow()
    expect(() => prepareCashCount({ ...count, amount: "-1" })).toThrow()
    expect(() => prepareCashCount({ ...count, amount: "0.001" })).toThrow()
  })
  test("adjustment binds the count and restores its original reviewed snapshot", () => {
    const result = prepareCashAdjustment({
      bookId: "book",
      count: source,
      reason: " Investigated till shortage ",
      metadata: { countId: "count", expectedSnapshotSequence: "6" },
    })
    expect(result.countId).toBe("count")
    expect(result.reason).toBe("Investigated till shortage")
    expect(result.expectedSnapshotSequence).toBe("6")
    expect(source.differenceMinor).toBe("-2000")
  })
  test("matching, changed-history, already-adjusted and oversized counts cannot be adjusted", () => {
    for (const changed of [
      { ...source, differenceMinor: "0" },
      { ...source, reviewRequired: true },
      { ...source, adjustment: { id: "a", reversal: null } },
      { ...source, differenceMinor: "100000000000001" },
    ])
      expect(() =>
        prepareCashAdjustment({
          bookId: "book",
          count: changed,
          reason: "Investigated",
        }),
      ).toThrow()
    expect(() =>
      prepareCashAdjustment({ bookId: "book", count: source, reason: " " }),
    ).toThrow()
    expect(() =>
      prepareCashAdjustment({
        bookId: "book",
        count: source,
        reason: "Investigated",
        metadata: { countId: "other" },
      }),
    ).toThrow()
  })
  test("reversal binds the original adjustment and preserves its same-day timestamp", () => {
    const result = prepareCashAdjustmentReversal({
      bookId: "book",
      count: { ...source, adjustment: { id: "adjustment", reversal: null } },
      reason: "Wrong investigation",
      date: "2026-10-02",
      metadata: {
        countId: "count",
        entryId: "adjustment",
        expectedSnapshotSequence: "7",
      },
      now: count.now,
    })
    expect(result.entryId).toBe("adjustment")
    expect(result.expectedSnapshotSequence).toBe("7")
    expect(result.effectiveAt.toISOString()).toBe(source.asOf)
  })
  test("reversal rejects missing/reversed/changed originals and invalid/future dates", () => {
    const input = {
      bookId: "book",
      count: { ...source, adjustment: { id: "adjustment", reversal: null } },
      reason: "Wrong investigation",
      date: "2026-10-02",
      now: count.now,
    }
    expect(() =>
      prepareCashAdjustmentReversal({ ...input, count: source }),
    ).toThrow()
    expect(() =>
      prepareCashAdjustmentReversal({
        ...input,
        count: {
          ...source,
          adjustment: { id: "adjustment", reversal: { id: "reversal" } },
        },
      }),
    ).toThrow()
    expect(() =>
      prepareCashAdjustmentReversal({
        ...input,
        metadata: { entryId: "other" },
      }),
    ).toThrow()
    expect(() =>
      prepareCashAdjustmentReversal({ ...input, date: "2026-10-01" }),
    ).toThrow()
    expect(() =>
      prepareCashAdjustmentReversal({ ...input, date: "2026-10-04" }),
    ).toThrow()
    expect(() =>
      prepareCashAdjustmentReversal({ ...input, date: "2026-02-30" }),
    ).toThrow()
  })
})
