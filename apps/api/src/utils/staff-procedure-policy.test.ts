import { expect, test } from "bun:test"
import {
  staffProcedureAction,
  staffProcedureStoreInput,
} from "./staff-procedure-policy"

test("exact stock editor reads require stock authority and remain query-only", () => {
  for (const path of [
    "inventory.balanceSource",
    "inventory.custodyAssignees",
  ]) {
    expect(staffProcedureAction(path, "query")).toBe("stock")
    expect(staffProcedureAction(path, "mutation")).toBeNull()
    expect(staffProcedureAction(path, "subscription")).toBeNull()
    expect(staffProcedureStoreInput.has(path)).toBe(true)
  }
  expect(
    staffProcedureAction("inventory.balanceSourceUnsafe", "query"),
  ).toBeNull()
})

test("service work editor and original record routes remain query-only", () => {
  for (const path of [
    "serviceAssistantWork.editorContext",
    "serviceAssistantWork.review",
    "serviceAssistantWork.original",
  ]) {
    expect(staffProcedureAction(path, "query")).toBe("read")
    expect(staffProcedureAction(path, "mutation")).toBeNull()
  }
  expect(
    staffProcedureAction("serviceAssistantWork.execute", "mutation"),
  ).toBeNull()
})

test("assistant booking detail admits only the exact protected query", () => {
  expect(
    staffProcedureAction("serviceCommerce.assistantBookingDetail", "query"),
  ).toBe("read")
  expect(
    staffProcedureAction("serviceCommerce.assistantBookingDetail", "mutation"),
  ).toBeNull()
  expect(
    staffProcedureAction("serviceCommerce.assistantBookingConfirm", "mutation"),
  ).toBeNull()
})

test("staff booking availability is query-only and cannot select another Store", () => {
  expect(
    staffProcedureAction("serviceAssistantBookings.availability", "query"),
  ).toBe("read")
  for (const type of ["mutation", "subscription"])
    expect(
      staffProcedureAction("serviceAssistantBookings.availability", type),
    ).toBeNull()
  expect(
    staffProcedureAction("serviceAssistantBookings.hold", "mutation"),
  ).toBeNull()
  expect(
    staffProcedureStoreInput.has("serviceAssistantBookings.availability"),
  ).toBe(false)
})

test("assistant quotation endpoints permit only audited reads and retain unknown-path refusal", () => {
  for (const path of [
    "serviceCommerce.assistantQuoteApprovalDetail",
    "serviceCommerce.assistantPendingQuoteApprovals",
  ]) {
    expect(staffProcedureAction(path, "query")).toBe("read")
    expect(staffProcedureAction(path, "mutation")).toBeNull()
  }
  expect(
    staffProcedureAction("serviceCommerce.assistantApproveQuote", "mutation"),
  ).toBeNull()
})

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

test("scoped staff read order history and options and add order notes", () => {
  for (const path of [
    "orders.timeline",
    "orders.changeOptions",
    "orders.activity.list",
  ]) {
    expect(staffProcedureAction(path, "query")).toBe("read")
    expect(staffProcedureAction(path, "mutation")).toBeNull()
  }
  expect(staffProcedureAction("orders.activity.add", "mutation")).toBe("orders")
})

test("scoped returns are order work; refunds are reconciliation", () => {
  expect(staffProcedureAction("orders.returnItems", "mutation")).toBe("orders")
  expect(staffProcedureAction("orders.refund", "mutation")).toBe(
    "reconciliation",
  )
})
