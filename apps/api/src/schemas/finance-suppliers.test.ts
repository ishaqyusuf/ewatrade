import { expect, test } from "bun:test"
import {
  financeSupplierAdvanceSchema,
  financeSupplierCreateSchema,
  financeSupplierOpeningSchema,
  financeSupplierReversalSchema,
  financeSupplierStatementSchema,
  financeSuppliersSchema,
} from "./finance-suppliers"

const command = { bookId: "book-1", clientCommandId: "command-1" }

test("supplier identity is normalized and stays bounded", () => {
  expect(
    financeSupplierCreateSchema.parse({
      ...command,
      code: "  supplier_1 ",
      name: "  Example Supply  ",
    }),
  ).toMatchObject({ code: "SUPPLIER_1", name: "Example Supply" })
  for (const code of ["", "x".repeat(41), "bad code"]) {
    expect(
      financeSupplierCreateSchema.safeParse({
        ...command,
        code,
        name: "Supply",
      }).success,
    ).toBe(false)
  }
})

test("supplier commands reject arbitrary properties and invalid amounts", () => {
  const opening = {
    ...command,
    supplierId: "supplier-1",
    kind: "PAYABLE",
    amountMinor: "1000",
    description: "Opening payable",
    effectiveAt: "2026-10-01T00:00:00.000Z",
  }
  expect(financeSupplierOpeningSchema.safeParse(opening).success).toBe(true)
  expect(
    financeSupplierOpeningSchema.safeParse({ ...opening, tenantId: "foreign" })
      .success,
  ).toBe(false)
  for (const amountMinor of [
    "0",
    "-1",
    "1.5",
    "1e4",
    "not-money",
    "100000000000001",
  ]) {
    expect(
      financeSupplierOpeningSchema.safeParse({ ...opening, amountMinor })
        .success,
    ).toBe(false)
  }
  expect(
    financeSupplierAdvanceSchema.safeParse({
      ...command,
      supplierId: "supplier-1",
      moneyAccountId: "cash-1",
      amountMinor: "1000",
      description: "Advance sent",
      effectiveAt: "2026-10-01T00:00:00.000Z",
    }).success,
  ).toBe(true)
  expect(
    financeSupplierReversalSchema.safeParse({
      ...command,
      entryId: "entry-1",
      reason: "Entered in error",
      effectiveAt: "2026-10-01T00:00:00.000Z",
    }).success,
  ).toBe(true)
})

test("supplier reads enforce bounded IDs, pages, snapshots and continuation", () => {
  const suppliers = { bookId: "book-1", query: "  North  " }
  expect(financeSuppliersSchema.parse(suppliers)).toMatchObject({
    query: "North",
    limit: 30,
  })
  expect(
    financeSuppliersSchema.safeParse({ ...suppliers, direction: "forward" })
      .success,
  ).toBe(true)
  expect(
    financeSuppliersSchema.safeParse({
      ...suppliers,
      cursor: "supplier-1",
      direction: "forward",
    }).success,
  ).toBe(true)
  expect(
    financeSuppliersSchema.safeParse({ ...suppliers, direction: "sideways" })
      .success,
  ).toBe(false)
  expect(
    financeSuppliersSchema.safeParse({ ...suppliers, limit: 51 }).success,
  ).toBe(false)
  expect(
    financeSuppliersSchema.safeParse({
      ...suppliers,
      actorUserId: "attacker",
    }).success,
  ).toBe(false)
  const statement = {
    bookId: "book-1",
    supplierId: "supplier-1",
    snapshotSequence: "9223372036854775807",
    cursor: "12",
  }
  expect(financeSupplierStatementSchema.safeParse(statement).success).toBe(true)
  expect(
    financeSupplierStatementSchema.safeParse({
      ...statement,
      snapshotSequence: "9223372036854775808",
    }).success,
  ).toBe(false)
  for (const snapshotSequence of ["1e4", "not-a-sequence"]) {
    expect(
      financeSupplierStatementSchema.safeParse({
        ...statement,
        snapshotSequence,
      }).success,
    ).toBe(false)
  }
  expect(
    financeSupplierStatementSchema.safeParse({
      bookId: "book-1",
      supplierId: "supplier-1",
      cursor: "12",
    }).success,
  ).toBe(false)
})
