import { expect, test } from "bun:test"
import { commercialOrderOperationalSummarySchema } from "../schemas/orders"

test("operational summaries require Store and reject client authority or reversed windows", () => {
  const valid = {
    storeId: "store",
    createdAfter: "2026-01-01T00:00:00Z",
    createdBefore: "2026-01-02T00:00:00Z",
    customerId: "customer",
  }
  expect(commercialOrderOperationalSummarySchema.safeParse(valid).success).toBe(
    true,
  )
  for (const patch of [
    { tenantId: "other" },
    { createdByUserId: "other" },
    { storeId: undefined },
    { createdBefore: valid.createdAfter },
    { statuses: [] },
    { statuses: ["invented"] },
  ])
    expect(
      commercialOrderOperationalSummarySchema.safeParse({ ...valid, ...patch })
        .success,
    ).toBe(false)
})
