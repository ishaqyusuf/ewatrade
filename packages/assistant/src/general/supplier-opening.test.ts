import { expect, test } from "bun:test"
import { capabilityForAction } from "../capabilities/manifest"
import { generalActionSchema, generalActionSummary } from "./contracts"
const payload = {
  action: "supplier_opening" as const,
  bookId: "book",
  supplierId: "supplier",
  kind: "PAYABLE" as const,
  amountMinor: "600",
  description: " Opening balance ",
  openingBalanceConfirmed: true as const,
}
test("opening draft binds exact supplier/kind and requires explicit pre-existing balance", () => {
  expect(generalActionSchema.parse(payload)).toEqual({
    ...payload,
    description: "Opening balance",
  })
  expect(
    generalActionSchema.parse({
      ...payload,
      kind: "ADVANCE",
      amountMinor: "100000000000000",
    }),
  ).toMatchObject({ amountMinor: "100000000000000" })
  for (const change of [
    { bookId: "" },
    { supplierId: "" },
    { kind: "PAYMENT" },
    { amountMinor: "0" },
    { amountMinor: "-1" },
    { amountMinor: "1.25" },
    { amountMinor: "bad" },
    { amountMinor: "100000000000001" },
    { description: "" },
    { description: "x".repeat(401) },
    { openingBalanceConfirmed: false },
    { effectiveAt: "2026-01-01T00:00:00Z" },
    { moneyAccountId: "money" },
    { lines: [] },
    { tenantId: "other" },
    { actorUserId: "other" },
    { clientCommandId: "caller" },
    { paymentAlreadyMade: true },
  ])
    expect(
      generalActionSchema.safeParse({ ...payload, ...change }).success,
    ).toBe(false)
  expect(generalActionSummary(payload, "NGN")).toContain("opening payable")
  expect(capabilityForAction(payload.action)).toMatchObject({
    id: "finance.supplier.opening",
    rollout: "planned",
    scope: "book",
    clients: ["dashboard"],
    policy: { roles: ["OWNER", "ADMIN"] },
    procedures: ["finance.recordSupplierOpening"],
    receipt: "finance_supplier",
  })
})
