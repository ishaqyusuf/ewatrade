import { expect, test } from "bun:test"
import { generalActionSchema } from "./contracts"
import { capabilityForAction } from "../capabilities/manifest"
test("reserved product action cannot override quantity, source, scope, cost or dates", () => {
  const payload = { action: "product_line_fulfill", orderLineId: "line", reason: "Collected by customer" }
  expect(generalActionSchema.parse(payload)).toEqual(payload)
  for (const field of ["quantity", "reservationId", "balanceSourceId", "tenantId", "storeId", "cost", "effectiveAt", "status", "expectedReviewRevision"])
    expect(generalActionSchema.safeParse({ ...payload, [field]: "override" }).success).toBe(false)
  expect(capabilityForAction("product_line_fulfill").clients).toEqual(["dashboard"])
})
