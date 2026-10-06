import { expect, test } from "bun:test"
import { staffProcedureAction } from "./staff-procedure-policy"

test("scoped procedures fail closed, including new queries and privileged mutations", () => {
  for (const path of [
    "finance.expenses",
    "retailOps.inviteStaff",
    "tenant.createStore",
    "orders.newProcedure",
    "serviceReporting.export",
  ])
    expect(staffProcedureAction(path, "mutation")).toBeNull()
  expect(staffProcedureAction("orders.get", "mutation")).toBeNull()
  expect(staffProcedureAction("catalog.createItem", "query")).toBeNull()
})
test("stock, reconciliation and business catalog grants are distinct", () => {
  expect(
    staffProcedureAction("inventory.postBalanceOperation", "mutation"),
  ).toBe("stock")
  expect(staffProcedureAction("inventory.finalizeCloseout", "mutation")).toBe(
    "reconciliation",
  )
  expect(staffProcedureAction("catalog.createItem", "mutation")).toBe("catalog")
  expect(staffProcedureAction("orders.listPage", "query")).toBe("read")
})
