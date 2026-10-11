import { expect, test } from "bun:test"
import { generalActionSchema, generalReceiptSchema } from "./contracts"
import { capabilityForAction } from "../capabilities/manifest"
const line = { balanceSourceId: "balance", enteredInventoryUnitId: "unit", expectedConfigurationVersionId: "config", enteredQuantity: "2.5", amountMinor: "1000", description: "Goods", categories: [{ name: "Purchase" }] }
const payload = { action: "purchase_register", bookId: "book", supplierId: "supplier", description: "Agreement", agreedAt: "2026-10-01T12:00:00.123Z", agreementOnly: true, lines: [line] }
test("purchase registration is strict and requires explicit agreement-only exact goods", () => {
  expect(generalActionSchema.safeParse(payload).success).toBe(true)
  for (const change of [{ agreementOnly: false }, { storeId: "other" }, { tenantId: "other" }, { clientCommandId: "key" }, { agreedAt: "yesterday" }, { lines: [] }, { lines: [line,line] }, { lines: [{ ...line, enteredQuantity: "1e2" }] }, { lines: [{ ...line, amountMinor: "0" }] }, { lines: [{ ...line, categories: [] }] }, { lines: [{ ...line, amountMinor: "100000000000000" }, { ...line, balanceSourceId: "other", amountMinor: "1" }] }]) expect(generalActionSchema.safeParse({ ...payload,...change }).success).toBe(false)
  expect(capabilityForAction("purchase_register")).toMatchObject({ rollout: "source", clients: ["dashboard"], scope: "store", policy: { roles: ["OWNER","ADMIN"] } })
  expect(generalReceiptSchema.safeParse({ kind: "finance_purchase_registration", recordId: "recognition", title: "Registered", detail: "Agreement" }).success).toBe(false)
})
