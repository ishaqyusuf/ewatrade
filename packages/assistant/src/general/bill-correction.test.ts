import { expect, test } from "bun:test"
import { generalActionSchema } from "./contracts"
import { capabilityForAction } from "../capabilities/manifest"
test("bill corrections require exact target, reason/date and bookkeeping acknowledgment", () => {
  for (const payload of [{ action: "expense_void", billId: "bill" }, { action: "bill_payment_reverse", paymentId: "payment" }]) {
    const valid = { ...payload, bookId: "book", effectiveAt: "2026-10-03T12:00:00Z", reason: "Duplicate", bookkeepingOnly: true }
    expect(generalActionSchema.safeParse(valid).success).toBe(true)
    for (const change of [{ reason: " " }, { bookkeepingOnly: false }, { effectiveAt: "yesterday" }, { tenantId: "other" }, { clientCommandId: "key" }, { amountMinor: "100" }]) expect(generalActionSchema.safeParse({ ...valid, ...change }).success).toBe(false)
  }
  for (const action of ["expense_void", "bill_payment_reverse"] as const) expect(capabilityForAction(action)).toMatchObject({ rollout: "planned", clients: ["dashboard"], policy: { roles: ["OWNER", "ADMIN"] }, receipt: "finance_bill" })
})
