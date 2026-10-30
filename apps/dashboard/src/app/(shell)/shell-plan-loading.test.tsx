import { beforeEach, expect, mock, test } from "bun:test"
import { isValidElement } from "react"
import * as billing from "../../../../../packages/db/src/queries/retail-ops-subscriptions"

const reads: string[] = []
let signedIn = true
let hasTenant = true
let free = false
let failPlan = false
let projectedFeatures: billing.RetailOpsPlanFeature[] | undefined
const prisma = {
  tenant: {
    findUniqueOrThrow: async () => {
      reads.push("tenant")
      if (failPlan) throw new Error("plan unavailable")
      return {
        id: "tenant",
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
        metadata: free
          ? { retailOps: { subscription: { planId: "free" } } }
          : {},
        subscription: null,
      }
    },
  },
  subscriptionPlan: {
    findMany: async () => {
      reads.push("plan directory")
      return []
    },
  },
  tenantSubscription: {
    findUnique: async () => {
      reads.push("subscription")
      return null
    },
  },
}
const Sidebar = () => null
const empty = () => null
mock.module("@ewatrade/db", () => ({ prisma }))
mock.module("@ewatrade/db/queries", () => ({
  ...billing,
  isWebsiteDomainsLaunchApproved: () => false,
}))
mock.module("@/lib/session", () => ({
  getServerSession: async () =>
    signedIn ? { user: { id: "actor", isPlatformAdmin: false } } : null,
}))
mock.module("@/lib/tenant", () => ({
  getActiveTenant: async () =>
    hasTenant
      ? {
          membership: { role: "OWNER", staffAccessMode: "LEGACY" },
          tenant: {
            id: "tenant",
            timezone: "UTC",
            planFeatures: projectedFeatures,
          },
          activeStore: { id: "store", name: "Store", currencyCode: "NGN" },
          stores: [{ id: "store", name: "Store", currencyCode: "NGN" }],
        }
      : null,
}))
mock.module("next/headers", () => ({
  headers: async () => new Headers({ "x-pathname": "/" }),
}))
mock.module("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`)
  },
}))
mock.module("@/components/dashboard/sidebar", () => ({
  DashboardSidebar: Sidebar,
}))
mock.module("@/components/dashboard/header", () => ({ DashboardHeader: empty }))
mock.module("@/components/dashboard/page-loading", () => ({
  PageLoading: empty,
}))
mock.module("@/components/quick-assistant/quick-assistant", () => ({
  QuickAssistant: empty,
}))
mock.module("@/components/sheets/global-sheets-provider", () => ({
  GlobalSheetsProvider: empty,
}))
mock.module("@/components/catalog-item/catalog-create-access", () => ({
  CatalogCreateAccessProvider: empty,
}))
const { default: ShellLayout } = await import("./layout")

async function renderShell() {
  const pending = ShellLayout({ children: null }).props.children
  return await pending.type(pending.props)
}
function sidebarProps(
  node: unknown,
): { navItems: { href: string }[] } | undefined {
  if (
    !isValidElement<{ children?: unknown; navItems: { href: string }[] }>(node)
  )
    return
  if (node.type === Sidebar) return node.props
  for (const child of [node.props.children].flat()) {
    const found = sidebarProps(child)
    if (found) return found
  }
}

beforeEach(() => {
  reads.length = 0
  signedIn = true
  hasTenant = true
  free = false
  failPlan = false
  projectedFeatures = undefined
})

test("actual shell reads only current plan features in one repository round trip", async () => {
  const shell = await renderShell()
  expect(
    sidebarProps(shell)?.navItems.some((item) => item.href === "/finance"),
  ).toBe(true)
  expect(reads).toEqual(["tenant"])
})
test("Free plan navigation remains gated without loading the plan directory", async () => {
  free = true
  expect(
    sidebarProps(await renderShell())?.navItems.some(
      (item) => item.href === "/finance",
    ),
  ).toBe(false)
  expect(reads).toEqual(["tenant"])
})
test("optional plan failure retains the existing navigation fallback", async () => {
  failPlan = true
  expect(
    sidebarProps(await renderShell())?.navItems.some(
      (item) => item.href === "/finance",
    ),
  ).toBe(true)
  expect(reads).toEqual(["tenant"])
})
test("signed-out and missing-workspace requests never start a plan read", async () => {
  signedIn = false
  await expect(renderShell()).rejects.toThrow("redirect:/login")
  signedIn = true
  hasTenant = false
  await expect(renderShell()).rejects.toThrow("redirect:/login?error=no_tenant")
  expect(reads).toEqual([])
})

test("the actual shell consumes joined workspace features without a second plan read", async () => {
  projectedFeatures = ["finance"]
  failPlan = true
  expect(
    sidebarProps(await renderShell())?.navItems.some(
      (item) => item.href === "/finance",
    ),
  ).toBe(true)
  expect(reads).toEqual([])
})

test("an empty joined feature list remains authoritative Free navigation", async () => {
  projectedFeatures = []
  failPlan = true
  expect(
    sidebarProps(await renderShell())?.navItems.some(
      (item) => item.href === "/finance",
    ),
  ).toBe(false)
  expect(reads).toEqual([])
})
