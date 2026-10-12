import { expect, test } from "bun:test"
import { generalActionSchema } from "./contracts"
import { capabilityForAction } from "../capabilities/manifest"
const payload = { action: "product_line_return", orderLineId: "line", quantity: "0.000001", disposition: "restock", reason: "Customer returned unused item" }
test("return preserves exact quantity and rejects authority, financial and date overrides", () => {
  expect<unknown>(generalActionSchema.parse(payload)).toEqual(payload)
  for (const field of ["tenantId", "storeId", "actorUserId", "clientReturnId", "schemaVersion", "expectedReviewRevision", "refundMinor", "sourceCostMinor", "effectiveAt"])
    expect(generalActionSchema.safeParse({ ...payload, [field]: "override" }).success).toBe(false)
  for (const quantity of ["0", "0.000000", "-1", "1e2", "0.0000001", "1000000000000"])
    expect(generalActionSchema.safeParse({ ...payload, quantity }).success).toBe(false)
})
test("return destination is meaningful only for restock; every disposition is explicit", () => {
  for (const disposition of ["restock", "damaged", "quarantine", "no_restock"]) {
    expect(generalActionSchema.safeParse({ ...payload, disposition }).success).toBe(true)
    expect(generalActionSchema.safeParse({ ...payload, disposition, destinationBalanceSourceId: "balance" }).success).toBe(disposition === "restock")
  }
  expect(generalActionSchema.safeParse({ ...payload, disposition: undefined }).success).toBe(false)
  const capability = capabilityForAction("product_line_return")
  expect(capability.clients).toEqual(["dashboard"])
  expect(capability.rollout).toBe("planned")
  expect(capability.procedures).toEqual(["orders.returnProductLine"])
})
