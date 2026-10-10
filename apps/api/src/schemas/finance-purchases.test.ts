import { expect, test } from "bun:test"
import {
  financePurchaseRecognitionsSchema,
  financePurchasesSchema,
} from "./finance-purchases"

test("strict API contract refuses client actor/scope injection and oversized pages", () => {
  const parsed = financePurchaseRecognitionsSchema.parse({
    bookId: "book",
    supplierId: "supplier",
  })
  expect(parsed.limit).toBe(30)
  for (const extra of [
    { tenantId: "other" },
    { actorUserId: "other" },
    { limit: 51 },
    { cursor: "" },
  ])
    expect(() =>
      financePurchaseRecognitionsSchema.parse({
        bookId: "book",
        supplierId: "supplier",
        ...extra,
      }),
    ).toThrow()
})

test("infinite-list paging direction is accepted, other values are not", () => {
  for (const schema of [
    financePurchaseRecognitionsSchema,
    financePurchasesSchema,
  ]) {
    expect(
      schema.parse({
        bookId: "book",
        supplierId: "supplier",
        direction: "forward",
      }).direction,
    ).toBe("forward")
    expect(() =>
      schema.parse({
        bookId: "book",
        supplierId: "supplier",
        direction: "sideways",
      }),
    ).toThrow()
  }
})
