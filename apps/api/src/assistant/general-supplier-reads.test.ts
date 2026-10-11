import { expect, test } from "bun:test"
import {
  generalSuppliersInput,
  generalSupplierStatementInput,
  generalSuppliersAnswer,
} from "./general-supplier-reads"
test("supplier discovery fixes page bounds and preserves exact Book scope", () => {
  expect(generalSuppliersInput.parse({ query: "  ACME  " })).toEqual({
    query: "ACME",
  })
  expect(generalSuppliersInput.safeParse({ cursor: "supplier" }).success).toBe(false)
  expect(
    generalSuppliersInput.parse({
      bookId: "book",
      query: "  flour  ",
      cursor: "cursor",
    }),
  ).toEqual({ bookId: "book", query: "flour", cursor: "cursor" })
  for (const override of [
    { tenantId: "other" },
    { storeId: "other" },
    { limit: 50 },
    { direction: "backward" },
  ])
    expect(
      generalSuppliersInput.safeParse({ bookId: "book", ...override }).success,
    ).toBe(false)
  const answer = generalSuppliersAnswer({
    data: [{ id: "s", bookId: "book", code: "FLOUR", name: "Flour supplier" }],
    nextCursor: "s",
  })
  expect(answer.detail).toContain("does not report amounts paid")
  expect(answer.detail).toContain("More suppliers")
})
test("supplier statement continuation requires an exact snapshot", () => {
  const base = { bookId: "book", supplierId: "supplier" }
  expect(generalSupplierStatementInput.safeParse(base).success).toBe(true)
  expect(
    generalSupplierStatementInput.safeParse({ ...base, cursor: "5" }).success,
  ).toBe(false)
  expect(
    generalSupplierStatementInput.safeParse({
      ...base,
      cursor: "5",
      snapshotSequence: "8",
    }).success,
  ).toBe(true)
  for (const override of [
    { snapshotSequence: "-1" },
    { snapshotSequence: "9223372036854775808" },
    { limit: 50 },
    { tenantId: "other" },
  ])
    expect(
      generalSupplierStatementInput.safeParse({ ...base, ...override }).success,
    ).toBe(false)
})
