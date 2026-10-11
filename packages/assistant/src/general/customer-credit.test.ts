import { expect, test } from "bun:test"
import { generalActionSchema } from "./contracts"
import { capabilityForAction } from "../capabilities/manifest"
const apply = {
  action: "customer_credit_apply",
  bookId: "book",
  accountId: "account",
  creditEntryId: "credit",
  chargeEntryId: "debt",
  amountMinor: "100",
}
const release = {
  action: "customer_allocation_release",
  bookId: "book",
  accountId: "account",
  allocationId: "allocation",
  amountMinor: "100",
  reason: "Correct the selected debt",
}
test("credit actions require exact positive bounded money and source identities", () => {
  for (const action of [apply, release]) {
    expect(generalActionSchema.safeParse(action).success).toBe(true)
    for (const amountMinor of ["0", "-1", "1.2", "01", "100000000000001"])
      expect(
        generalActionSchema.safeParse({ ...action, amountMinor }).success,
      ).toBe(false)
    for (const extra of [
      { tenantId: "other" },
      { actorUserId: "other" },
      { expectedRevision: "4" },
      { clientCommandId: "key" },
      { effectiveAt: "2026-01-01" },
    ])
      expect(
        generalActionSchema.safeParse({ ...action, ...extra }).success,
      ).toBe(false)
  }
  expect(
    generalActionSchema.safeParse({ ...apply, creditEntryId: "" }).success,
  ).toBe(false)
  expect(
    generalActionSchema.safeParse({ ...release, reason: " " }).success,
  ).toBe(false)
})
test("credit capabilities remain planned, dashboard-only and finance-manager restricted", () => {
  for (const action of [
    "customer_credit_apply",
    "customer_allocation_release",
  ] as const)
    expect(capabilityForAction(action)).toMatchObject({
      rollout: "planned",
      clients: ["dashboard"],
      policy: { roles: ["OWNER", "ADMIN"] },
      scope: "book",
      receipt: "customer",
    })
})
