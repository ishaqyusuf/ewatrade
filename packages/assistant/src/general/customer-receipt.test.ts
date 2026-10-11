import { expect, test } from "bun:test"
import { generalActionSchema } from "./contracts"
import { capabilityForAction } from "../capabilities/manifest"
const payload = {
  action: "customer_receipt",
  bookId: "book",
  accountId: "account",
  moneyAccountId: "cash",
  amountMinor: "1000",
  method: "CASH",
  description: "New customer deposit",
  moneyAlreadyReceived: true,
}
test("receipt requires exact positive money and an explicit received-money acknowledgment", () => {
  expect(generalActionSchema.parse(payload)).toEqual(payload)
  for (const amountMinor of ["0", "01", "-1", "1.5", "1e3", "100000000000001"])
    expect(
      generalActionSchema.safeParse({ ...payload, amountMinor }).success,
    ).toBe(false)
  for (const moneyAlreadyReceived of [false, undefined, "true"])
    expect(
      generalActionSchema.safeParse({ ...payload, moneyAlreadyReceived })
        .success,
    ).toBe(false)
})
test("receipt rejects client authority, backdating, allocation and payment-source overrides", () => {
  for (const key of [
    "tenantId",
    "actorUserId",
    "storeId",
    "expectedRevision",
    "clientCommandId",
    "effectiveAt",
    "orderId",
    "paymentId",
    "creditEntryId",
  ])
    expect(
      generalActionSchema.safeParse({ ...payload, [key]: "injected" }).success,
    ).toBe(false)
  expect(capabilityForAction("customer_receipt")).toMatchObject({
    rollout: "planned",
    effect: "book",
    scope: "book",
    clients: ["dashboard"],
    policy: { roles: ["OWNER", "ADMIN"] },
  })
})
