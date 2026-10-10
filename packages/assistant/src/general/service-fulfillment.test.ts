import { expect, test } from "bun:test"
import { generalActionSchema } from "./contracts"
import { capabilityForAction } from "../capabilities/manifest"
for (const action of ["service_line_authorize", "service_line_fulfill"] as const) {
  test(`${action} permits only saved line identity and an explicit reason`, () => {
    const payload = { action, orderLineId: "line", reason: "Customer work completed" }
    expect(generalActionSchema.parse(payload)).toEqual(payload)
    for (const field of ["tenantId", "storeId", "actorUserId", "quantity", "performedAt", "authorizedAt", "status", "expectedReviewRevision"])
      expect(generalActionSchema.safeParse({ ...payload, [field]: "override" }).success).toBe(false)
    expect(generalActionSchema.safeParse({ ...payload, reason: " " }).success).toBe(false)
    expect(capabilityForAction(action).clients).toEqual(["dashboard"])
  })
}
test("manager release has a stricter role policy than performance", () => {
  expect(capabilityForAction("service_line_authorize").policy.roles).toEqual(["OWNER", "ADMIN", "MANAGER"])
  expect(capabilityForAction("service_line_fulfill").policy.roles).toContain("CASHIER")
})
