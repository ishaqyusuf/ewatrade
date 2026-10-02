import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import {
  assertReviewedCostDiscoveryScopeRows as assertScope,
  readReviewedCostDiscoveryScopeInTransaction as readScope,
} from "./reviewed-cost-discovery-scope"

const references = [
  "BALANCE",
  "OPERATION",
  "TRANSFER",
  "ORDER_LINE",
  "RETURN",
  "REVIEW_ALLOCATION",
  "COUNT",
  "COUNT_LINE",
  "CLOSEOUT",
  "CLOSEOUT_LINE",
].map((kind) => ({ kind, id: "same-id-across-models" }))
const rows = () => references.map((row) => ({ ...row, valid: true }))
test("complete discovery requires every typed owner even when model IDs coincide", () => {
  expect(() =>
    assertScope(
      [...references, { kind: "MOVEMENT", id: "physical-proof-separately" }],
      rows().reverse(),
    ),
  ).not.toThrow()
})
for (const reference of references) {
  test(`rejects a crossed or missing ${reference.kind} scope`, () => {
    const invalid = rows().map((row) => ({
      ...row,
      valid: row.kind !== reference.kind,
    }))
    expect(() => assertScope(references, invalid)).toThrow("missing, crossed")
    expect(() =>
      assertScope(
        references,
        rows().filter((row) => row.kind !== reference.kind),
      ),
    ).toThrow("missing, crossed")
  })
}
test("rejects duplicate rows replacing a different owner", () => {
  const actual = rows()
  actual[1] = { kind: "BALANCE", id: "same-id-across-models", valid: true }
  expect(() => assertScope(references, actual)).toThrow("missing, crossed")
})
test("rejects an unexpected identity replacing an owner", () => {
  const actual = rows()
  actual[1] = { kind: "OPERATION", id: "other", valid: true }
  expect(() => assertScope(references, actual)).toThrow("missing, crossed")
})
test("rejects duplicate requested identities", () => {
  expect(() =>
    assertScope(
      [...references, { kind: "BALANCE", id: "same-id-across-models" }],
      rows(),
    ),
  ).toThrow("missing, crossed")
})
test("rejects unsupported owner kinds before reading", async () => {
  await expect(
    readScope({} as Prisma.TransactionClient, {
      tenantId: "tenant",
      bookId: "book",
      currencyCode: "NGN",
      references: [{ kind: "GUESSED_OWNER", id: "unknown" }],
    }),
  ).rejects.toThrow("missing, crossed")
})
test("rejects missing original identity before reading", async () => {
  await expect(
    readScope({} as Prisma.TransactionClient, {
      tenantId: "tenant",
      bookId: "book",
      currencyCode: "NGN",
      references: [{ kind: "BALANCE", id: " " }],
    }),
  ).rejects.toThrow("missing, crossed")
})
test("retains the complete reference bound before any scope query", async () => {
  await expect(
    readScope({} as Prisma.TransactionClient, {
      tenantId: "tenant",
      bookId: "book",
      currencyCode: "NGN",
      references: Array.from({ length: 32769 }, (_, i) => ({
        kind: "MOVEMENT",
        id: String(i),
      })),
    }),
  ).rejects.toThrow("missing, crossed")
})
test("an empty owner scope does not query or hide physical responsibility", async () => {
  await expect(
    readScope({} as Prisma.TransactionClient, {
      tenantId: "tenant",
      bookId: "book",
      currencyCode: "NGN",
      references: [{ kind: "MOVEMENT", id: "movement" }],
    }),
  ).resolves.toBeUndefined()
})
