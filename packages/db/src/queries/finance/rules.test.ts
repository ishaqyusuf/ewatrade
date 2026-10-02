import { describe, expect, test } from "bun:test"
import {
  assertFinancePostingDate,
  financeAmount,
  financePayloadHash,
  validateFinanceLines,
} from "./rules"

describe("financial journal invariants", () => {
  test("exact large values do not use floating-point addition", () => {
    const lines = validateFinanceLines([
      { accountId: "cash", side: "DEBIT", amountMinor: "99999999999999" },
      { accountId: "cash", side: "DEBIT", amountMinor: "1" },
      { accountId: "capital", side: "CREDIT", amountMinor: "100000000000000" },
    ])
    expect(
      lines.reduce((sum, line) => sum + line.debitMinor - line.creditMinor, 0n),
    ).toBe(0n)
  })

  test("rejects malformed, rounded, signed and out-of-range amounts", () => {
    for (const value of [
      "0",
      "-1",
      "+1",
      "01",
      "1.1",
      "1e3",
      " 1",
      "100000000000001",
    ]) {
      expect(() => financeAmount(value)).toThrow()
    }
  })

  test("one minor-unit mismatch cannot post", () => {
    expect(() =>
      validateFinanceLines([
        { accountId: "cash", side: "DEBIT", amountMinor: "100" },
        { accountId: "income", side: "CREDIT", amountMinor: "99" },
      ]),
    ).toThrow("balance")
    expect(() => validateFinanceLines([])).toThrow()
  })

  test("command hashes ignore object-key order but preserve allocation order and values", () => {
    expect(financePayloadHash({ amount: "10", account: "a" })).toBe(
      financePayloadHash({ account: "a", amount: "10" }),
    )
    expect(financePayloadHash({ amount: "10" })).not.toBe(
      financePayloadHash({ amount: "11" }),
    )
    expect(financePayloadHash(["a", "b"])).not.toBe(
      financePayloadHash(["b", "a"]),
    )
  })

  test("closing boundary, opening cutoff and future date are enforced", () => {
    const context = {
      startsAt: new Date("2026-01-01T00:00:00Z"),
      closedThrough: new Date("2026-01-31T23:59:59.999Z"),
      now: new Date("2026-03-01T00:00:00Z"),
    }
    for (const value of ["2025-12-31", "2026-01-31", "2026-03-02", "invalid"]) {
      expect(() =>
        assertFinancePostingDate({ ...context, effectiveAt: new Date(value) }),
      ).toThrow()
    }
    expect(() =>
      assertFinancePostingDate({
        ...context,
        effectiveAt: new Date("2026-02-01"),
      }),
    ).not.toThrow()
  })
})
