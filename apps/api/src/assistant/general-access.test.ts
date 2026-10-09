import { afterAll, beforeAll, expect, test } from "bun:test"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import type { GeneralContext } from "./general-context"
import { assertGeneralAction, canUseCapability } from "./general-context"
import { createGeneralTools } from "./general-tools"

const env = {
  enabled: process.env.ASSISTANT_GENERAL_ENABLED,
  key: process.env.ASSISTANT_APPROVAL_SIGNING_KEY,
}
beforeAll(() => {
  process.env.ASSISTANT_GENERAL_ENABLED = "true"
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "k".repeat(32)
})
afterAll(() => {
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
  // Customer creation and service queue pages are Owner/Admin-only for scoped staff.
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
