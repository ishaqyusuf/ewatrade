import { afterAll, beforeAll, expect, test } from "bun:test"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import type { GeneralContext } from "./general-context"
import { assertGeneralAction, canUseCapability } from "./general-context"
import { createGeneralTools } from "./general-tools"

const env = {
  enabled: process.env.ASSISTANT_GENERAL_ENABLED,
  key: process.env.ASSISTANT_APPROVAL_SIGNING_KEY,
  capabilities: process.env.ASSISTANT_GENERAL_CAPABILITIES,
}
beforeAll(() => {
  Reflect.deleteProperty(process.env, "ASSISTANT_GENERAL_CAPABILITIES")
  process.env.ASSISTANT_GENERAL_ENABLED = "true"
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "k".repeat(32)
})
afterAll(() => {
  if (env.capabilities === undefined)
    Reflect.deleteProperty(process.env, "ASSISTANT_GENERAL_CAPABILITIES")
  else process.env.ASSISTANT_GENERAL_CAPABILITIES = env.capabilities
  process.env.ASSISTANT_GENERAL_ENABLED = env.enabled
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = env.key
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
    expect(allowedActions(actor("OWNER"))).not.toContain(action)
    expect(allowedActions(cashier)).not.toContain(action)
    expect(allowedActions(manager)).not.toContain(action)
    expect(allowedActions(editor)).toContain(action)
  }
})

test("owners get every capability; Free plan hides finance-gated ledger reads", () => {
  expect(listed(actor("OWNER"))).toEqual([
    "searchRecords",
    "readCatalogItem",
    "readOfferingStock",
    "readOrders",
    "readSalesSummary",
    "readOrder",
    "readServices",
    "readCustomerAccounts",
    "readCustomer",
    "draftAction",
  ])
  expect(listed(actor("OWNER", { plan: "free" }))).not.toContain(
    "readCustomerAccounts",
  )
  expect(allowedActions(actor("OWNER"))).toEqual([
    "customer_create",
    "product_create",
    "order_create",
    "payment_record",
    "customer_update",
  ])
})

test("sales reps can read orders and draft sales only", () => {
  const rep = actor("CASHIER")
  expect(listed(rep)).toEqual([
    "searchRecords",
    "readCatalogItem",
    "readOrders",
    "readSalesSummary",
    "readOrder",
    "draftAction",
  ])
  expect(allowedActions(rep)).toEqual(["order_create"])
  expect(() => assertGeneralAction(rep, "payment_record")).toThrow(
    "Sales reps can draft sales",
  )
})

test("scoped managers inherit the canonical Store grants of each procedure", () => {
  const manager = actor("MANAGER", { scoped: { storeRole: "MANAGER" } })
  // Customer create/update and service queue pages are Owner/Admin-only for scoped staff.
  expect(allowedActions(manager)).toEqual(["order_create", "payment_record"])
  expect(listed(manager)).not.toContain("readServices")
  expect(listed(manager)).not.toContain("readCustomerAccounts")
  expect(
    allowedActions(
      actor("MANAGER", {
        scoped: { storeRole: "MANAGER", catalogEditor: true },
      }),
    ),
  ).toEqual(["product_create", "order_create", "payment_record"])
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

test("pilot restriction hides tools and rejects direct action authority", () => {
  const previous = process.env.ASSISTANT_GENERAL_CAPABILITIES
  try {
    process.env.ASSISTANT_GENERAL_CAPABILITIES = "sales.summary.read"
    const owner = actor("OWNER")
    owner.requestHeaders = new Headers({ "x-assistant-client": "dashboard" })
    expect(listed(owner)).toEqual(["readSalesSummary"])
    expect(allowedActions(owner)).toEqual([])
    expect(() => assertGeneralAction(owner, "customer_create")).toThrow(
      "not enabled",
    )
    process.env.ASSISTANT_GENERAL_CAPABILITIES = "customers.create"
    expect(() =>
      assertGeneralAction(actor("CASHIER"), "customer_create"),
    ).toThrow()
  } finally {
    if (previous === undefined)
      Reflect.deleteProperty(process.env, "ASSISTANT_GENERAL_CAPABILITIES")
    else process.env.ASSISTANT_GENERAL_CAPABILITIES = previous
  }
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
  expect(listed(actor("OWNER"))).not.toContain("readLowStock")
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
  expect(listed(actor("OWNER"))).not.toContain("readOrderContactCount")
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
  for (const [role, plan, allowed] of [["OWNER", "pro", true], ["ADMIN", "pro", true], ["OWNER", "free", false], ["MANAGER", "pro", false], ["CASHIER", "pro", false]] as const) {
    const ctx = actor(role, { plan })
    ctx.requestHeaders = new Headers({ "x-assistant-client": "dashboard" })
    expect(listed(ctx).includes("readReceivables")).toBe(allowed)
  }
})
