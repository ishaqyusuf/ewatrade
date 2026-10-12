import { afterAll, beforeAll, expect, test } from "bun:test"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import type { GeneralContext } from "./general-context"
import { assertGeneralAction, canUseCapability } from "./general-context"

const previousKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "k".repeat(32)
})
afterAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = previousKey
})
const ids = [
  "finance.purchase.payment.reverse",
  "finance.supplier.allocation.release",
  "finance.supplier.create",
  "finance.suppliers.read",
  "finance.supplier_statement.read",
  "finance.purchase.register",
  "finance.purchase.recognize",
  "finance.purchase_registrations.read",
  "finance.purchase_recognition.read",
  "finance.purchases.read",
  "finance.purchase.read",
  "finance.supplier.advance",
  "finance.supplier.advance.allocate",
  "finance.purchase.pay",
]
const capabilities = capabilityManifest.filter((c) => ids.includes(c.id))
function actor(role: string, plan = "pro", scoped = false) {
  return {
    session: { user: { id: "user" }, session: { id: "session" } },
    requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
    tenantContext: {
      tenant: {
        id: "tenant",
        dataClassification: "QA",
        retailOpsPlanId: plan,
        currencyCode: "NGN",
      },
      membership: { id: "membership", role },
      activeStore: { id: "store", name: "Shop", currencyCode: "NGN" },
      stores: [{ id: "store" }],
      staffAccess: {
        businessRole: role,
        status: "ACTIVE",
        mode: scoped ? "SCOPED" : "LEGACY",
        catalogEditor: false,
        assignments: scoped
          ? [{ storeId: "store", role: "MANAGER", status: "ACTIVE" }]
          : [],
      },
    },
  } as unknown as GeneralContext
}
test("all supplier/purchase tools keep Owner/Admin finance authority across roles and scoped staff", () => {
  expect(capabilities).toHaveLength(14)
  for (const role of ["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"]) {
    const ctx = actor(role)
    const allowed = role === "OWNER" || role === "ADMIN"
    for (const c of capabilities) {
      expect(canUseCapability(ctx, c)).toBe(allowed)
      if (c.mode === "write") {
        if (allowed)
          expect(() => assertGeneralAction(ctx, c.action)).not.toThrow()
        else expect(() => assertGeneralAction(ctx, c.action)).toThrow()
      }
    }
  }
  for (const c of capabilities)
    expect(canUseCapability(actor("MANAGER", "pro", true), c)).toBe(false)
})
test("supplier/purchase finance access disappears on Free plan, revoked access or inaccessible Store", () => {
  const free = actor("OWNER", "free")
  const suspended = actor("OWNER")
  suspended.tenantContext.staffAccess = {
    ...suspended.tenantContext.staffAccess,
    status: "SUSPENDED",
  } as GeneralContext["tenantContext"]["staffAccess"]
  const elsewhere = actor("MANAGER", "pro", true)
  elsewhere.tenantContext.staffAccess = {
    ...elsewhere.tenantContext.staffAccess,
    assignments: [{ storeId: "elsewhere", role: "MANAGER", status: "ACTIVE" }],
  } as GeneralContext["tenantContext"]["staffAccess"]
  for (const ctx of [free, suspended, elsewhere])
    for (const c of capabilities) {
      expect(canUseCapability(ctx, c)).toBe(false)
      if (c.mode === "write")
        expect(() => assertGeneralAction(ctx, c.action)).toThrow()
    }
})

test("purchase fact reversal retains finance authority when source-visible", () => {
  const capability = capabilityManifest.find(
    (c) => c.id === "finance.purchase.fact.reverse",
  )
  if (!capability) throw Error("Purchase fact reversal capability required")
  expect(capability.rollout).toBe("source")
  expect(canUseCapability(actor("OWNER"), capability)).toBe(true)
  const source = { ...capability, rollout: "source" as const }
  for (const role of ["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"])
    expect(canUseCapability(actor(role), source)).toBe(
      role === "OWNER" || role === "ADMIN",
    )
  expect(canUseCapability(actor("OWNER", "free"), source)).toBe(false)
  expect(canUseCapability(actor("MANAGER", "pro", true), source)).toBe(false)
  const suspended = actor("OWNER")
  suspended.tenantContext.staffAccess = {
    ...suspended.tenantContext.staffAccess,
    status: "SUSPENDED",
  } as GeneralContext["tenantContext"]["staffAccess"]
  expect(canUseCapability(suspended, source)).toBe(false)
})

test("supplier entry reversal stays planned and keeps original finance authority", () => {
  const capability = capabilityManifest.find(
    (c) => c.id === "finance.supplier.entry.reverse",
  )
  if (!capability) throw Error("Supplier entry reversal capability required")
  expect(capability.rollout).toBe("planned")
  expect(canUseCapability(actor("OWNER"), capability)).toBe(false)
  const source = { ...capability, rollout: "source" as const }
  for (const role of ["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"])
    expect(canUseCapability(actor(role), source)).toBe(
      role === "OWNER" || role === "ADMIN",
    )
  expect(canUseCapability(actor("OWNER", "free"), source)).toBe(false)
  expect(canUseCapability(actor("MANAGER", "pro", true), source)).toBe(false)
  const suspended = actor("OWNER")
  suspended.tenantContext.staffAccess = {
    ...suspended.tenantContext.staffAccess,
    status: "SUSPENDED",
  } as GeneralContext["tenantContext"]["staffAccess"]
  expect(canUseCapability(suspended, source)).toBe(false)
})

test("supplier opening stays planned and keeps Owner/Admin finance authority", () => {
  const capability = capabilityManifest.find(
    (c) => c.id === "finance.supplier.opening",
  )
  if (!capability) throw Error("Supplier opening capability required")
  expect(capability.rollout).toBe("planned")
  expect(canUseCapability(actor("OWNER"), capability)).toBe(false)
  const source = { ...capability, rollout: "source" as const }
  for (const role of ["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"])
    expect(canUseCapability(actor(role), source)).toBe(
      role === "OWNER" || role === "ADMIN",
    )
  expect(canUseCapability(actor("OWNER", "free"), source)).toBe(false)
  expect(canUseCapability(actor("MANAGER", "pro", true), source)).toBe(false)
  const suspended = actor("OWNER")
  suspended.tenantContext.staffAccess = {
    ...suspended.tenantContext.staffAccess,
    status: "SUSPENDED",
  } as GeneralContext["tenantContext"]["staffAccess"]
  expect(canUseCapability(suspended, source)).toBe(false)
})

test("direct purchase stays planned and retains Owner/Admin finance scope", () => {
  const capability = capabilityManifest.find(
    (c) => c.id === "finance.purchase.record",
  )
  if (!capability) throw Error("Direct purchase capability required")
  expect(capability.rollout).toBe("planned")
  expect(canUseCapability(actor("OWNER"), capability)).toBe(false)
  const source = { ...capability, rollout: "source" as const }
  for (const role of ["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"])
    expect(canUseCapability(actor(role), source)).toBe(
      role === "OWNER" || role === "ADMIN",
    )
  expect(canUseCapability(actor("OWNER", "free"), source)).toBe(false)
  expect(canUseCapability(actor("MANAGER", "pro", true), source)).toBe(false)
  const suspended = actor("OWNER")
  suspended.tenantContext.staffAccess = {
    ...suspended.tenantContext.staffAccess,
    status: "SUSPENDED",
  } as GeneralContext["tenantContext"]["staffAccess"]
  expect(canUseCapability(suspended, source)).toBe(false)
})
