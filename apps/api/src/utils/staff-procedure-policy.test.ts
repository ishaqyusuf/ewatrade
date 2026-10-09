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

test("assistant staging delegates decisions to scoped action checks; stock inspection is read-only", () => {
  for (const path of [
    "assistant.start",
    "assistant.editProposal",
    "assistant.decideProposal",
  ])
    expect(staffProcedureAction(path, "mutation")).toBe("read")
  expect(
    staffProcedureAction("inventory.configuredOfferingAvailability", "query"),
  ).toBe("read")
  expect(
    staffProcedureAction(
      "inventory.configuredOfferingAvailability",
      "mutation",
    ),
  ).toBeNull()
  expect(
    staffProcedureAction("assistant.executeAnyAction", "mutation"),
  ).toBeNull()
})
