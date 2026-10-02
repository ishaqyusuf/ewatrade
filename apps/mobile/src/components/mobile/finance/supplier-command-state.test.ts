import { describe, expect, it } from "bun:test"

import {
  prepareSupplierEntry,
  prepareSupplierIdentity,
  prepareSupplierReversal,
} from "./supplier-command-state"

describe("native supplier command payloads", () => {
  it("normalizes supplier identity without creating a finance entry", () => {
    expect(
      prepareSupplierIdentity({
        bookId: "book-1",
        code: "  acme-02 ",
        name: "  Acme Wholesale  ",
      }),
    ).toEqual({ bookId: "book-1", code: "ACME-02", name: "Acme Wholesale" })
  })

  it("keeps amounts as exact minor-unit strings and uses UTC dates", () => {
    const payload = prepareSupplierEntry({
      bookId: "book-1",
      supplierId: "supplier-1",
      amount: "12345.67",
      description: " Opening inventory payable ",
      date: "2026-10-01",
      startsAt: "2026-10-01T00:00:00.000Z",
      kind: "PAYABLE",
      opening: true,
    })
    expect(payload.amountMinor).toBe("1234567")
    expect(payload.effectiveAt.toISOString()).toBe("2026-10-01T00:00:00.000Z")
    expect(payload.kind).toBe("PAYABLE")
  })

  it("requires an active money account for a paid advance", () => {
    expect(() =>
      prepareSupplierEntry({
        bookId: "book-1",
        supplierId: "supplier-1",
        amount: "10.00",
        description: "Advance",
        date: "2026-10-02",
        startsAt: "2026-10-01T00:00:00.000Z",
        today: "2026-10-02",
        moneyAccountId: "old-account",
        activeMoneyAccountIds: [],
      }),
    ).toThrow("currently active")
  })

  it("rejects malformed money, future dates and a shifted opening date", () => {
    const base = {
      bookId: "book-1",
      supplierId: "supplier-1",
      amount: "1.001",
      description: "Opening",
      date: "2026-10-02",
      startsAt: "2026-10-01T00:00:00.000Z",
      kind: "PAYABLE" as const,
      opening: true,
    }
    expect(() => prepareSupplierEntry(base)).toThrow()
    expect(() => prepareSupplierEntry({ ...base, amount: "1.00" })).toThrow(
      "book start date",
    )
    expect(() =>
      prepareSupplierEntry({
        ...base,
        opening: false,
        date: "2026-10-03",
        today: "2026-10-02",
        moneyAccountId: "cash",
        activeMoneyAccountIds: ["cash"],
        amount: "1.00",
      }),
    ).toThrow("future")
  })

  it("requires reversal reason and clamps same-day reversal time to its source", () => {
    const payload = prepareSupplierReversal({
      bookId: "book-1",
      entryId: "entry-1",
      reason: " Duplicate advance ",
      date: "2026-10-02",
      originalAt: "2026-10-01T12:30:00.000Z",
      today: "2026-10-02",
    })
    expect(payload.reason).toBe("Duplicate advance")
    expect(payload.effectiveAt.toISOString()).toBe("2026-10-02T00:00:00.000Z")
    const sameDay = prepareSupplierReversal({
      bookId: "book-1",
      entryId: "entry-1",
      reason: "Duplicate advance",
      date: "2026-10-01",
      originalAt: "2026-10-01T12:30:00.000Z",
      today: "2026-10-02",
    })
    expect(sameDay.effectiveAt.toISOString()).toBe("2026-10-01T12:30:00.000Z")
    const sourceDay = prepareSupplierReversal({
      bookId: "book-1",
      entryId: "entry-1",
      reason: "Same day correction",
      date: "2026-10-01",
      originalAt: "2026-10-01T12:30:00.000Z",
      today: "2026-10-02",
    })
    expect(sourceDay.effectiveAt.toISOString()).toBe("2026-10-01T12:30:00.000Z")
  })
})
