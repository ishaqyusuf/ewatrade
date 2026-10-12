import { afterAll, beforeAll, expect, test } from "bun:test"
import {
  capabilityForAction,
  capabilityManifest,
} from "@ewatrade/assistant/capabilities/manifest"
import type { GeneralContext } from "./general-context"
import { assertGeneralAction, canUseCapability } from "./general-context"
import { createGeneralTools } from "./general-tools"

const previousKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "k".repeat(32)
})
afterAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = previousKey
})

function actor(
  role: string,
  options: {
    plan?: string
    scoped?: { storeRole: string; catalogEditor?: boolean }
  } = {},
) {
  return {
    session: { user: { id: "user" }, session: { id: "session" } },
    tenantContext: {
      tenant: {
        id: "tenant",
        dataClassification: "LIVE",
        retailOpsPlanId: options.plan ?? "pro",
        currencyCode: "NGN",
      },
      membership: { id: "membership", role },
      activeStore: { id: "store", name: "Shop", currencyCode: "NGN" },
      stores: [{ id: "store" }],
      staffAccess: {
        businessRole: role,
        status: "ACTIVE",
        mode: options.scoped ? "SCOPED" : "LEGACY",
        catalogEditor: options.scoped?.catalogEditor ?? false,
        assignments: options.scoped
          ? [
              {
                storeId: "store",
                role: options.scoped.storeRole,
                status: "ACTIVE",
              },
            ]
          : [],
      },
    },
  } as unknown as GeneralContext
}
const listed = (ctx: GeneralContext) =>
  Object.keys(
    createGeneralTools(
      ctx,
      "conversation",
      () => {},
      () => {},
    ),
  )
const allowedActions = (ctx: GeneralContext) =>
  capabilityManifest
    .filter((capability) => capability.mode === "write")
    .filter((capability) => canUseCapability(ctx, capability))
    .map((capability) => capability.action)

test("dashboard product edits retain Catalog role and Store authority", () => {
  const owner = actor("OWNER")
  owner.requestHeaders = new Headers({ "x-assistant-client": "dashboard" })
  const cashier = actor("CASHIER")
  cashier.requestHeaders = owner.requestHeaders
  const manager = actor("MANAGER", {
    scoped: { storeRole: "MANAGER", catalogEditor: false },
  })
  manager.requestHeaders = owner.requestHeaders
  const editor = actor("MANAGER", {
    scoped: { storeRole: "MANAGER", catalogEditor: true },
  })
  editor.requestHeaders = owner.requestHeaders
  for (const action of [
    "product_price_update",
    "product_details_update",
    "product_identifiers_update",
    "product_availability_update",
    "product_unit_configuration_draft",
    "product_unit_configuration_publish",
  ] as const) {
    expect(allowedActions(owner)).toContain(action)
    // Mobile gets an edit only when its capability lists the mobile client.
    expect(allowedActions(actor("OWNER")).includes(action)).toBe(
      capabilityForAction(action).clients.some((client) => client === "mobile"),
    )
    expect(allowedActions(cashier)).not.toContain(action)
    expect(allowedActions(manager)).not.toContain(action)
    expect(allowedActions(editor)).toContain(action)
  }
})

test("owners get every capability; Free plan hides finance-gated ledger reads", () => {
  expect(listed(actor("OWNER"))).toEqual([
    "readPurchaseRegistrations",
    "readPurchaseRecognition",
    "readPurchaseBills",
    "readPurchaseBill",
    "readSuppliers",
    "readSupplierStatement",
    "readExpenseCategories",
    "readMoneyAccounts",
    "searchRecords",
    "readCatalogHistory",
    "readCatalogItem",
    "readInventoryTotals",
    "readInventoryBalances",
    "readOfferingStock",
    "readOrders",
    "readSalesSummary",
    "readOrder",
    "readServices",
    "readReceivables",
    "readCustomerAccounts",
    "readCustomer",
    "readOrderSummary",
    "readLowStock",
    "readCatalogCount",
    "readOrderContactCount",
    "readCustomerCount",
    "readStoreCount",
    "readCustomers",
    "readCatalogPage",
    "lookupOpenOrders",
    "readStockCount",
    "readStockOperations",
    "readStockOperation",
    "readInventoryCloseouts",
    "readInventoryCloseout",
    "readStockTransfers",
    "readStockTransfer",
    "draftAction",
  ])
  expect(listed(actor("OWNER", { plan: "free" }))).not.toContain(
    "readCustomerAccounts",
  )
  expect(allowedActions(actor("OWNER"))).toEqual([
    "order_cancel",
    "order_metadata_update",
    "order_attachment_add",
    "customer_create",
    "product_create",
    "order_create",
    "payment_record",
    "customer_update",
    "product_price_update",
    "product_details_update",
    "product_identifiers_update",
    "product_availability_update",
  ])
  // Dashboard-only drafts stay off the mobile client.
  expect(allowedActions(actor("OWNER"))).not.toContain("stock_receive")
  expect(allowedActions(actor("OWNER"))).not.toContain("expense_record")
})

test("sales reps can read orders and draft sales only", () => {
  const rep = actor("CASHIER")
  expect(listed(rep)).toEqual([
    "searchRecords",
    "readCatalogHistory",
    "readCatalogItem",
    "readOrders",
    "readSalesSummary",
    "readOrder",
    "readOrderSummary",
    "readCatalogCount",
    "readOrderContactCount",
    "readStoreCount",
    "readCatalogPage",
    "lookupOpenOrders",
    "draftAction",
  ])
  expect(allowedActions(rep)).toEqual(["order_attachment_add", "order_create"])
  expect(() => assertGeneralAction(rep, "payment_record")).toThrow(
    "Sales reps can draft sales",
  )
})

test("scoped managers inherit the canonical Store grants of each procedure", () => {
  const manager = actor("MANAGER", { scoped: { storeRole: "MANAGER" } })
  // Customer create/update and service queue pages are Owner/Admin-only for scoped staff.
  expect(allowedActions(manager)).toEqual([
    "order_cancel",
    "order_metadata_update",
    "order_attachment_add",
    "order_create",
    "payment_record",
  ])
  expect(listed(manager)).not.toContain("readServices")
  expect(listed(manager)).not.toContain("readCustomerAccounts")
  expect(
    allowedActions(
      actor("MANAGER", {
        scoped: { storeRole: "MANAGER", catalogEditor: true },
      }),
    ),
  ).toEqual([
    "order_cancel",
    "order_metadata_update",
    "order_attachment_add",
    "product_create",
    "order_create",
    "payment_record",
    "product_price_update",
    "product_details_update",
    "product_identifiers_update",
    "product_availability_update",
  ])
  expect(() => assertGeneralAction(manager, "customer_create")).toThrow(
    "Your role does not permit this action at this Store.",
  )
})

test("scoped staff without the Store assignment lose the assistant entirely", () => {
  const elsewhere = actor("MANAGER", { scoped: { storeRole: "MANAGER" } })
  elsewhere.tenantContext.staffAccess = {
    ...elsewhere.tenantContext.staffAccess,
    assignments: [{ storeId: "other", role: "MANAGER", status: "ACTIVE" }],
  } as GeneralContext["tenantContext"]["staffAccess"]
  expect(() => assertGeneralAction(elsewhere, "order_create")).toThrow(
    "Choose an accessible Store",
  )
})

test("dashboard operational reads respect stock Store grants and order role ceilings", () => {
  const owner = actor("OWNER")
  const manager = actor("MANAGER", { scoped: { storeRole: "MANAGER" } })
  const scopedRep = actor("MANAGER", { scoped: { storeRole: "CASHIER" } })
  const cashier = actor("CASHIER")
  for (const ctx of [owner, manager, scopedRep, cashier])
    ctx.requestHeaders = new Headers({ "x-assistant-client": "dashboard" })
  expect(listed(owner)).toContain("readInventoryTotals")
  expect(listed(manager)).toContain("readInventoryTotals")
  expect(listed(scopedRep)).not.toContain("readInventoryTotals")
  expect(listed(cashier)).not.toContain("readInventoryTotals")
  expect(listed(owner)).toContain("readInventoryBalances")
  expect(listed(manager)).toContain("readInventoryBalances")
  expect(listed(scopedRep)).not.toContain("readInventoryBalances")
  expect(listed(cashier)).not.toContain("readInventoryBalances")
  expect(listed(owner)).toContain("readLowStock")
  expect(listed(manager)).toContain("readLowStock")
  expect(listed(scopedRep)).not.toContain("readLowStock")
  expect(listed(cashier)).not.toContain("readLowStock")
  expect(listed(cashier)).toContain("readOrderSummary")
  // Mobile has had these reads since the native parity work (677293e1).
  expect(listed(actor("OWNER"))).toContain("readLowStock")
})

test("dashboard counts distinguish business directory permission from assigned Store visibility", () => {
  const owner = actor("OWNER")
  const manager = actor("MANAGER", { scoped: { storeRole: "MANAGER" } })
  const cashier = actor("CASHIER")
  for (const ctx of [owner, manager, cashier])
    ctx.requestHeaders = new Headers({ "x-assistant-client": "dashboard" })
  expect(listed(owner)).toContain("readOrderContactCount")
  expect(listed(manager)).toContain("readOrderContactCount")
  expect(listed(cashier)).toContain("readOrderContactCount")
  expect(listed(actor("OWNER"))).toContain("readOrderContactCount")
  expect(listed(owner)).toContain("readCustomers")
  expect(listed(manager)).not.toContain("readCustomers")
  expect(listed(cashier)).not.toContain("readCustomers")
  expect(listed(owner)).toContain("readCustomerCount")
  expect(listed(manager)).not.toContain("readCustomerCount")
  expect(listed(cashier)).not.toContain("readCustomerCount")
  expect(listed(manager)).toContain("readCatalogPage")
  expect(listed(cashier)).toContain("readCatalogPage")
  expect(listed(manager)).toContain("readCatalogCount")
  expect(listed(manager)).toContain("readStoreCount")
  expect(listed(cashier)).toContain("readStoreCount")
})

test("dashboard receivables retain finance plan and Owner/Admin restrictions", () => {
  for (const [role, plan, allowed] of [
    ["OWNER", "pro", true],
    ["ADMIN", "pro", true],
    ["OWNER", "free", false],
    ["MANAGER", "pro", false],
    ["CASHIER", "pro", false],
  ] as const) {
    const ctx = actor(role, { plan })
    ctx.requestHeaders = new Headers({ "x-assistant-client": "dashboard" })
    expect(listed(ctx).includes("readReceivables")).toBe(allowed)
  }
})

test("dashboard service performance and manager release retain separate role boundaries", () => {
  for (const role of ["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"]) {
    const ctx = actor(role)
    ctx.requestHeaders = new Headers({ "x-assistant-client": "dashboard" })
    expect(allowedActions(ctx)).toContain("service_line_fulfill")
    if (["OWNER", "ADMIN", "MANAGER"].includes(role))
      expect(allowedActions(ctx)).toContain("service_line_authorize")
    else expect(allowedActions(ctx)).not.toContain("service_line_authorize")
  }
})

test("customer funds reads retain finance authority and planned rollout", () => {
  const ids = [
    "finance.money_accounts.read",
    "customers.account.read",
    "customers.sources.read",
    "customers.statement.read",
  ]
  for (const capability of capabilityManifest.filter((value) =>
    ids.includes(value.id),
  )) {
    const owner = actor("OWNER")
    owner.requestHeaders = new Headers({ "x-assistant-client": "dashboard" })
    expect(canUseCapability(owner, capability)).toBe(
      capability.id === "finance.money_accounts.read",
    )
    const rollout = capability.rollout
    try {
      Object.assign(capability, { rollout: "source" })
      for (const role of ["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"]) {
        const ctx = actor(role)
        ctx.requestHeaders = owner.requestHeaders
        expect(canUseCapability(ctx, capability)).toBe(
          role === "OWNER" || role === "ADMIN",
        )
      }
      const free = actor("OWNER", { plan: "free" })
      free.requestHeaders = owner.requestHeaders
      expect(canUseCapability(free, capability)).toBe(false)
    } finally {
      Object.assign(capability, { rollout })
    }
  }
})
