import { expect, test } from "bun:test"
import { generalActionSchema } from "./contracts"
import { capabilityForAction } from "../capabilities/manifest"
const payload = { action: "bill_payment", bookId: "book", billId: "bill", funding: "BUSINESS_ACCOUNT", accountId: "cash", amountMinor: "250", effectiveAt: "2026-10-01T12:00:00.123Z", paymentAlreadyMade: true }
test("bill payment requires exact existing bill and completed funding evidence", () => {
  expect(generalActionSchema.safeParse(payload).success).toBe(true)
  expect(generalActionSchema.safeParse({ ...payload, funding: "OWNER_CAPITAL", accountId: undefined }).success).toBe(true)
  for (const change of [{ paymentAlreadyMade: false }, { accountId: undefined }, { billId: "" }, { amountMinor: "0" }, { amountMinor: "100000000000001" }, { effectiveAt: "yesterday" }, { funding: "OWNER_CAPITAL" }, { tenantId: "other" }, { paidMinor: "0" }, { clientCommandId: "key" }]) expect(generalActionSchema.safeParse({ ...payload, ...change }).success).toBe(false)
  expect(capabilityForAction("bill_payment")).toMatchObject({ rollout: "planned", clients: ["dashboard"], policy: { roles: ["OWNER", "ADMIN"] }, procedures: ["finance.payBill"] })
})
