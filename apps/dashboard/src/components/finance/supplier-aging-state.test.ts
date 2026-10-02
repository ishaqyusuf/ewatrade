import { expect, test } from "bun:test"
import {
  type SupplierAging,
  isSupplierAgingDay,
  matchesSupplierAgingScope,
} from "./supplier-aging-state"

test("as-of days reject normalization, partial input and days before the UTC Book start", () => {
  const start = "2026-01-01T23:59:59Z"
  expect(isSupplierAgingDay("2026-01-01", start)).toBe(true)
  expect(isSupplierAgingDay("2028-02-29", start)).toBe(true)
  for (const day of [
    "2026-02-29",
    "2026-02-31",
    "2026-1-1",
    "2026-10",
    "2025-12-31",
    "9999-12-31",
    "2026-10-02T00:00Z",
    "",
  ]) {
    expect(isSupplierAgingDay(day, start)).toBe(false)
  }
})

test("cache scope rejects supplier, Book, UTC day and pinned sequence mismatches", () => {
  const scope = {
    bookId: "book-a",
    supplierId: "supplier-a",
    asOfDate: "2026-10-02",
    snapshotSequence: "214",
  }
  const result: SupplierAging = {
    supplier: {
      id: scope.supplierId,
      bookId: scope.bookId,
      name: "Supplier",
      code: "SUP-1",
    },
    currencyCode: "NGN",
    asOfDate: scope.asOfDate,
    snapshotSequence: scope.snapshotSequence,
    dateBasis: "UTC",
    controlScope: "SUPPLIER_ALL_STORES",
    payableMinor: "0",
    advanceMinor: "0",
    buckets: [],
    sourceLimit: 1000,
    sourcesRead: 0,
    outstandingSourceCount: 0,
    data: [],
    nextCursor: null,
  }
  expect(matchesSupplierAgingScope(result, scope)).toBe(true)
  expect(
    matchesSupplierAgingScope(result, {
      ...scope,
      snapshotSequence: undefined,
    }),
  ).toBe(true)
  for (const mismatch of [
    { ...scope, bookId: "book-b" },
    { ...scope, supplierId: "supplier-b" },
    { ...scope, asOfDate: "2026-10-01" },
    { ...scope, snapshotSequence: "215" },
  ]) {
    expect(matchesSupplierAgingScope(result, mismatch)).toBe(false)
  }
})
