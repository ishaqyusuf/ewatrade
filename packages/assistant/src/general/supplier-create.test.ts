import { expect, test } from "bun:test"
import { generalActionSchema, generalReceiptSchema } from "./contracts"
import { capabilityForAction } from "../capabilities/manifest"
test("supplier creation normalizes identity and rejects financial or authority inputs", () => {
  const valid = { action: "supplier_create", bookId: "book", code: " acme-1 ", name: " ACME " }
  expect(generalActionSchema.parse(valid)).toEqual({ ...valid, code: "ACME-1", name: "ACME" })
  for (const change of [{ code: "_bad" }, { name: " " }, { code: "x".repeat(41) }, { name: "x".repeat(161) }, { bookId: "" }, { tenantId: "other" }, { actorUserId: "owner" }, { clientCommandId: "key" }, { amountMinor: "100" }, { openingPayable: "100" }])
    expect(generalActionSchema.safeParse({ ...valid, ...change }).success).toBe(false)
  expect(capabilityForAction("supplier_create")).toMatchObject({ rollout: "source", clients: ["dashboard"], policy: { roles: ["OWNER", "ADMIN"] }, receipt: "finance_supplier", procedures: ["finance.createSupplier"] })
  const receipt = { kind: "finance_supplier", recordId: "supplier", title: "Supplier created", detail: "ACME" }
  expect(generalReceiptSchema.safeParse(receipt).success).toBe(false)
  expect(generalReceiptSchema.safeParse({ ...receipt, bookId: "book" }).success).toBe(true)
})
