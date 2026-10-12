import { expect, test } from "bun:test"
import {
  generalActionSchema,
  generalActionSummary,
  generalReceiptSchema,
} from "./contracts"
import { capabilityForAction } from "../capabilities/manifest"

const payload = {
  action: "supplier_allocation_release" as const,
  bookId: "book",
  allocationId: "allocation",
  amountMinor: "50",
  effectiveAt: "2026-10-05T12:00:00.123Z",
  reason: "Restore part of the original advance",
  releaseConfirmed: true as const,
}
test("allocation release requires an exact original source, positive exact amount and explicit release fact", () => {
  expect(generalActionSchema.parse(payload)).toEqual(payload)
  for (const change of [
    { allocationId: " " },
    { bookId: " " },
    { amountMinor: "0" },
    { amountMinor: "1e3" },
    { amountMinor: "2.5" },
    { amountMinor: "100000000000001" },
    { reason: " " },
    { releaseConfirmed: false },
    { releaseConfirmed: undefined },
    { effectiveAt: "yesterday" },
    { tenantId: "other" },
    { actorUserId: "other" },
    { clientCommandId: "supplied" },
    { moneyAccountId: "cash" },
    { billId: "supplied" },
    { advanceEntryId: "supplied" },
    { paymentAlreadyMade: true },
  ])
    expect(
      generalActionSchema.safeParse({ ...payload, ...change }).success,
    ).toBe(false)
  expect(generalActionSummary(payload, "NGN")).toContain(payload.reason)
  expect(capabilityForAction(payload.action)).toMatchObject({
    id: "finance.supplier.allocation.release",
    rollout: "source",
    scope: "book",
    clients: ["dashboard"],
    policy: { roles: ["OWNER", "ADMIN"] },
    procedures: ["finance.releaseSupplierAllocation"],
    receipt: "finance_purchase_bill",
  })
  const receipt = {
    kind: "finance_purchase_bill",
    recordId: "bill",
    bookId: "book",
    title: "Allocation released",
    detail: "No cash moved",
  }
  expect(generalReceiptSchema.safeParse(receipt).success).toBe(true)
  expect(
    generalReceiptSchema.safeParse({ ...receipt, bookId: undefined }).success,
  ).toBe(false)
})
