import { expect, test } from "bun:test"
import { capabilityForAction } from "../capabilities/manifest"
import { generalActionSchema, generalActionSummary } from "./contracts"
test("order metadata distinguishes omission from explicit clear and forbids financial fields", () => {
  const action = {
    action: "order_metadata_update",
    orderId: "order",
    reason: "Request",
    patch: { notes: null },
  }
  expect(generalActionSchema.parse(action)).toMatchObject(action)
  for (const patch of [
    {},
    { status: "CANCELLED" },
    { amountPaidMinor: 0 },
    { customerName: "Invented" },
  ])
    expect(generalActionSchema.safeParse({ ...action, patch }).success).toBe(
      false,
    )
})
test("order replacement takes exact source line changes and no payment or actor injection", () => {
  const action = {
    action: "order_replace",
    orderId: "order",
    reason: "Request",
    changes: [{ orderLineId: "line", quantity: "3", unitPriceMinor: 125 }],
  }
  expect(generalActionSchema.safeParse(action).success).toBe(true)
  for (const extra of [
    { tenantId: "foreign" },
    { storeId: "foreign" },
    { actorUserId: "foreign" },
    { initialPayment: { amountMinor: 10 } },
    { status: "PAID" },
  ])
    expect(generalActionSchema.safeParse({ ...action, ...extra }).success).toBe(
      false,
    )
  expect(
    generalActionSchema.safeParse({
      ...action,
      changes: [{ orderLineId: "line", quantity: "0" }],
    }).success,
  ).toBe(false)
})
test("amendment capabilities are dashboard source entries and summaries remain explicit", () => {
  for (const action of [
    "order_cancel",
    "order_metadata_update",
    "order_replace",
  ] as const) {
    const capability = capabilityForAction(action)
    expect(capability.clients).toEqual(["dashboard"])
    expect(capability.rollout).toBe("source")
    expect(capability.policy.roles).not.toContain("CASHIER")
  }
  expect(
    generalActionSummary(
      { action: "order_cancel", orderId: "order", reason: "Requested" },
      "NGN",
    ),
  ).toContain("Cancel order")
})
