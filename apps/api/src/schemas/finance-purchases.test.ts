import { expect, test } from "bun:test"
import { financePurchaseRecognitionsSchema } from "./finance-purchases"

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
