import { beforeEach, expect, mock, test } from "bun:test"
import {
  type RetailOpsPlanId,
  findRetailOpsPlan,
} from "@ewatrade/db/subscription-plans"
import { isValidElement } from "react"

let signedIn = true
let hasTenant = true
let failPlan = false
let planId: RetailOpsPlanId = "starter"
let source = "owner_subscription"
const planReads: { tenantId: string }[] = []
const workspaceReads: string[] = []
const SettingsNavigation = () => null

mock.module("@ewatrade/db", () => ({ prisma: {} }))
mock.module("@ewatrade/db/retail-ops-subscriptions", () => ({
  getRetailOpsTenantPlan: async (_db: unknown, input: { tenantId: string }) => {
    planReads.push(input)
    if (failPlan) throw new Error("private database error must not be rendered")
    const plan = findRetailOpsPlan(planId)
    if (!plan) throw new Error("missing plan")
    return { plan, subscription: { source } }
  },
}))
mock.module("@ewatrade/db/website-domains-launch-gate", () => ({
  isWebsiteDomainsLaunchApproved: () => false,
}))
mock.module("@/lib/session", () => ({
  getServerSession: async () =>
    signedIn ? { user: { id: "current-actor" } } : null,
}))
mock.module("@/lib/tenant", () => ({
  getActiveTenant: async (userId: string) => {
    workspaceReads.push(userId)
    return hasTenant
      ? {
          tenant: { id: "current-workspace" },
          membership: { role: "OWNER" },
          stores: [],
        }
      : null
  },
}))
mock.module("@/components/settings/settings-navigation", () => ({
  SettingsNavigation,
}))
const { default: SettingsLayout } = await import("./layout")

async function renderSettings() {
  return SettingsLayout({ children: "Existing settings content" })
}

function hasReceipts(node: Awaited<ReturnType<typeof renderSettings>>) {
  const nav = node.props.children[0]
  if (!isValidElement<{ items: { href: string }[] }>(nav))
    throw new Error("Missing settings navigation")
  return nav.props.items.some((item) => item.href === "/settings/receipts")
}

beforeEach(() => {
  signedIn = true
  hasTenant = true
  failPlan = false
  planId = "starter"
  source = "owner_subscription"
  planReads.length = 0
  workspaceReads.length = 0
})

test("server wrapper reports the resolved plan from its single current-workspace read", async () => {
  for (const id of ["starter", "growth", "pro", "free"] as const) {
    planId = id
    source = id === "free" ? "owner_billing_free" : "owner_subscription"
    const node = await renderSettings()
    expect(node.props["data-billing-plan-read"]).toBe("resolved")
    expect(node.props["data-billing-plan-id"]).toBe(id)
    expect(node.props["data-billing-plan-source"]).toBe(source)
    expect(hasReceipts(node)).toBe(id !== "free")
    expect(node.props.children[1].props.children).toBe(
      "Existing settings content",
    )
  }
  expect(planReads).toEqual(
    Array.from({ length: 4 }, () => ({ tenantId: "current-workspace" })),
  )
  expect(workspaceReads).toEqual(Array(4).fill("current-actor"))
})

test("a failed fresh read reports unavailable without a stale plan, source or error", async () => {
  await renderSettings()
  failPlan = true
  const node = await renderSettings()
  expect(node.props["data-billing-plan-read"]).toBe("unavailable")
  expect(node.props["data-billing-plan-id"]).toBeUndefined()
  expect(node.props["data-billing-plan-source"]).toBeUndefined()
  expect(hasReceipts(node)).toBe(true)
  expect(JSON.stringify(node)).not.toContain("private database error")
  expect(planReads).toHaveLength(2)
})

test("no session or workspace emits no plan result and starts no plan read", async () => {
  signedIn = false
  const signedOut = await renderSettings()
  expect(workspaceReads).toEqual([])
  signedIn = true
  hasTenant = false
  const noWorkspace = await renderSettings()
  for (const node of [signedOut, noWorkspace]) {
    expect(node.props["data-billing-plan-read"]).toBeUndefined()
    expect(node.props["data-billing-plan-id"]).toBeUndefined()
    expect(node.props["data-billing-plan-source"]).toBeUndefined()
  }
  expect(planReads).toEqual([])
})

test("launch fallback stays distinguishable from owner coverage without forcing a paid result", async () => {
  source = "launch_default"
  const node = await renderSettings()
  expect(node.props["data-billing-plan-read"]).toBe("resolved")
  expect(node.props["data-billing-plan-id"]).toBe("starter")
  expect(node.props["data-billing-plan-source"]).toBe("launch_default")
})
