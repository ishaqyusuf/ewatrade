import { expect, test } from "bun:test"
import { financeSupplierPayableAgingSchema } from "./finance-supplier-aging"

const input = { bookId: "book", supplierId: "supplier", asOfDate: "2026-10-02" }
test("aging schema accepts exact dates/sequences with bounded page size", () => {
  expect(financeSupplierPayableAgingSchema.parse(input).limit).toBe(30)
  expect(
    financeSupplierPayableAgingSchema.parse({
      ...input,
      asOfDate: "2024-02-29",
      snapshotSequence: "9223372036854775807",
      cursor: {
        sequence: "9007199254740993",
        bookId: "book",
        supplierId: "supplier",
        asOfDate: "2024-02-29",
        snapshotSequence: "9223372036854775807",
      },
      limit: 50,
    }).cursor?.sequence,
  ).toBe("9007199254740993")
})
test("aging schema refuses scope overrides, Store filtering, invalid dates and unpinned continuation", () => {
  for (const change of [
    { tenantId: "other" },
    { actorUserId: "other" },
    { storeId: "store" },
    { cursor: "1" },
    { snapshotSequence: "01" },
    { snapshotSequence: "9223372036854775808" },
    { asOfDate: "2026-02-29" },
    { asOfDate: "2026-10-02T10:00:00Z" },
    { asOfDate: "2026-10-2" },
    { limit: 51 },
    { limit: 0 },
    { limit: 1.5 },
  ]) {
    expect(
      financeSupplierPayableAgingSchema.safeParse({ ...input, ...change })
        .success,
    ).toBe(false)
  }
  const pinned = {
    ...input,
    snapshotSequence: "7",
    cursor: { ...input, sequence: "1", snapshotSequence: "7" },
  }
  for (const change of [
    { asOfDate: "2026-10-01" },
    { snapshotSequence: "6" },
    { supplierId: "other" },
    { bookId: "other" },
  ]) {
    expect(
      financeSupplierPayableAgingSchema.safeParse({ ...pinned, ...change })
        .success,
    ).toBe(false)
  }
})
