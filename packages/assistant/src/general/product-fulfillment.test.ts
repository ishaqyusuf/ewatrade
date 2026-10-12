import { expect, test } from "bun:test"
import { generalActionSchema } from "./contracts"
import { capabilityForAction } from "../capabilities/manifest"
test("reserved product action cannot override quantity, source, scope, cost or dates", () => {
  const payload = { action: "product_line_fulfill", orderLineId: "line", reason: "Collected by customer" }
  expect<unknown>(generalActionSchema.parse(payload)).toEqual(payload)
  for (const field of ["quantity", "reservationId", "balanceSourceId", "tenantId", "storeId", "cost", "effectiveAt", "status", "expectedReviewRevision"])
    expect(generalActionSchema.safeParse({ ...payload, [field]: "override" }).success).toBe(false)
  expect(capabilityForAction("product_line_fulfill").clients).toEqual(["dashboard"])
})

test("batch fulfillment binds a saved order and cannot smuggle line, date or scope overrides", () => {
  const payload = { action: "product_batch_fulfill", orderId: "order", reason: "Ready for collection" }
  expect<unknown>(generalActionSchema.parse(payload)).toEqual(payload)
  for (const field of ["orderLineIds", "quantity", "storeId", "tenantId", "performedAt", "expectedReviewRevision", "status"])
    expect(generalActionSchema.safeParse({ ...payload, [field]: "override" }).success).toBe(false)
  expect(capabilityForAction("product_batch_fulfill").clients).toEqual(["dashboard"])
})
