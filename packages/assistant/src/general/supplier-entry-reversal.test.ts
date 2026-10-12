import { expect, test } from "bun:test"
import { capabilityForAction } from "../capabilities/manifest"
import { generalActionSchema, generalActionSummary } from "./contracts"
const payload = {
  action: "supplier_entry_reverse" as const,
  bookId: "book",
  entryId: "original-entry",
  effectiveAt: "2026-09-05T12:00:00.123Z",
  reason: " Correct duplicate advance ",
  bookkeepingOnly: true as const,
}
test("supplier correction binds only the original entry and bookkeeping acknowledgement", () => {
  expect(generalActionSchema.parse(payload)).toEqual({
    ...payload,
    reason: payload.reason.trim(),
  })
  for (const change of [
    { bookkeepingOnly: false },
    { entryId: "" },
    { bookId: "" },
    { reason: "" },
    { reason: "x".repeat(401) },
    { effectiveAt: "bad" },
    { amountMinor: "1" },
    { moneyAccountId: "other" },
    { supplierId: "other" },
    { kind: "ADVANCE" },
    { lines: [] },
    { tenantId: "other" },
    { actorUserId: "other" },
    { clientCommandId: "caller" },
  ])
    expect(
      generalActionSchema.safeParse({ ...payload, ...change }).success,
    ).toBe(false)
  expect(generalActionSummary(payload, "NGN")).toContain(payload.reason)
  expect(capabilityForAction(payload.action)).toMatchObject({
    id: "finance.supplier.entry.reverse",
    rollout: "planned",
    scope: "book",
    clients: ["dashboard"],
    policy: { roles: ["OWNER", "ADMIN"] },
    procedures: ["finance.reverseSupplierEntry"],
    receipt: "finance_supplier",
  })
})
