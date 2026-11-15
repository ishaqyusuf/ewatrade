import { beforeEach, expect, mock, test } from "bun:test"
import type { RetailOpsPlanFeature } from "@ewatrade/db/subscription-plans"
import { isValidElement } from "react"

let signedIn = true
let hasTenant = true
// What the joined workspace read carried; undefined = the join failed.
let joined: RetailOpsPlanFeature[] | undefined = ["invoices"]
let failFallback = false
let fallback: RetailOpsPlanFeature[] = ["invoices"]
const fallbackReads: string[] = []
const workspaceReads: string[] = []
const SettingsNavigation = () => null

mock.module("@/lib/plan-features", () => ({
  getDashboardPlanFeatures: async (tenant: {
    id: string
    planFeatures?: RetailOpsPlanFeature[]
  }) => {
    if (tenant.planFeatures) return tenant.planFeatures
    fallbackReads.push(tenant.id)
    return failFallback ? undefined : fallback
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
          tenant: { id: "current-workspace", planFeatures: joined },
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
  joined = ["invoices"]
  failFallback = false
  fallback = ["invoices"]
  fallbackReads.length = 0
  workspaceReads.length = 0
})

test("joined plan features gate the list with no plan read of its own", async () => {
  for (const features of [["invoices"], []] as RetailOpsPlanFeature[][]) {
    joined = features
    const node = await renderSettings()
    expect(node.props["data-billing-plan-read"]).toBe("resolved")
    expect(hasReceipts(node)).toBe(features.includes("invoices"))
    expect(node.props.children[1].props.children).toBe(
      "Existing settings content",
    )
  }
  expect(fallbackReads).toEqual([])
  expect(workspaceReads).toEqual(["current-actor", "current-actor"])
})

test("a failed join uses the shared fallback once; a failed fallback stays ungated", async () => {
  joined = undefined
  fallback = []
  const free = await renderSettings()
  expect(free.props["data-billing-plan-read"]).toBe("resolved")
  expect(hasReceipts(free)).toBe(false)
  failFallback = true
  const unknown = await renderSettings()
  expect(unknown.props["data-billing-plan-read"]).toBe("unavailable")
  expect(hasReceipts(unknown)).toBe(true)
  expect(fallbackReads).toEqual(["current-workspace", "current-workspace"])
})

test("no session or workspace emits no plan result and starts no plan read", async () => {
  signedIn = false
  const signedOut = await renderSettings()
  expect(workspaceReads).toEqual([])
  signedIn = true
  hasTenant = false
  const noWorkspace = await renderSettings()
  for (const node of [signedOut, noWorkspace])
    expect(node.props["data-billing-plan-read"]).toBeUndefined()
  expect(fallbackReads).toEqual([])
})
