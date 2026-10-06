import { describe, expect, test } from "bun:test"
import { WorkspaceDropdown } from "@/components/dashboard/workspace-dropdown"
import type { TenantContext } from "@/lib/tenant"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createWorkspaceSwitchActions } from "./use-workspace-switch"

const context: TenantContext = {
  membership: {
    id: "membership-a",
    role: "OWNER",
    tenantId: "business-a",
  },
  tenant: {
    id: "business-a",
    slug: "business-a",
    name: "Business A",
    type: "retail",
    enabledModes: ["retail"],
    currencyCode: "NGN",
    timezone: "Africa/Lagos",
  },
  tenants: [
    {
      id: "business-a",
      name: "Business A",
      role: "OWNER",
      slug: "business-a",
    },
    {
      id: "business-b",
      name: "Business B",
      role: "ADMIN",
      slug: "business-b",
    },
  ],
  stores: [
    {
      id: "store-a",
      slug: "store-a",
      name: "Store A",
      status: "ACTIVE",
      currencyCode: "NGN",
    },
    {
      id: "store-b",
      slug: "store-b",
      name: "Store B",
      status: "ACTIVE",
      currencyCode: "NGN",
    },
  ],
  activeStore: {
    id: "store-a",
    slug: "store-a",
    name: "Store A",
    status: "ACTIVE",
    currencyCode: "NGN",
  },
}

function createHarness(response: Response) {
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
  const assignedUrls: string[] = []
  const effects: string[] = []
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({ input, init })
    return response
  }

  return {
    assignedUrls,
    effects,
    requests,
    dependencies: {
      assign: (url: string) => assignedUrls.push(url),
      clearCache: () => effects.push("clear-cache"),
      fetcher,
      pathname: "/sales?view=open",
    },
  }
}

describe("workspace switch actions", () => {
  test("keeps a single business visible and enables the selector for multiple businesses", () => {
    const singleBusiness = {
      ...context,
      tenants: context.tenants.slice(0, 1),
      stores: context.stores.slice(0, 1),
    }
    const single = renderToStaticMarkup(
      createElement(WorkspaceDropdown, {
        ctx: singleBusiness,
        isExpanded: true,
      }),
    )
    const multiple = renderToStaticMarkup(
      createElement(WorkspaceDropdown, { ctx: context, isExpanded: true }),
    )

    expect(single).toContain("Business A")
    expect(single).toContain('disabled=""')
    expect(multiple).toContain(
      'aria-label="Business Business A, store Store A"',
    )
    expect(multiple).not.toContain('disabled=""')
  })

  test("posts the selected business and current path, clears cache, and follows its returned dashboard URL", async () => {
    const harness = createHarness(
      new Response(
        JSON.stringify({
          dashboardUrl: "https://business-b.ewatrade.com/sales",
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    )
    const actions = createWorkspaceSwitchActions(context, harness.dependencies)
    const result = await actions.switchTenant("business-b", () =>
      harness.effects.push("close-mobile-menu"),
    )

    expect(result).toEqual({ status: "success" })
    expect(harness.requests).toHaveLength(1)
    expect(harness.requests[0]?.input).toBe("/api/tenants/active")
    expect(JSON.parse(String(harness.requests[0]?.init?.body))).toEqual({
      path: "/sales?view=open",
      tenantId: "business-b",
    })
    expect(harness.effects).toEqual(["clear-cache", "close-mobile-menu"])
    expect(harness.assignedUrls).toEqual([
      "https://business-b.ewatrade.com/sales",
    ])
  })

  test("reports server errors without clearing cache, closing the menu, or navigating", async () => {
    const harness = createHarness(
      new Response(JSON.stringify({ error: "Business not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    )
    const actions = createWorkspaceSwitchActions(context, harness.dependencies)
    const result = await actions.switchTenant("business-b", () =>
      harness.effects.push("close-mobile-menu"),
    )

    expect(result).toEqual({
      error: "Business not found.",
      status: "error",
    })
    expect(harness.requests).toHaveLength(1)
    expect(harness.effects).toEqual([])
    expect(harness.assignedUrls).toEqual([])
  })

  test("switches stores through the existing store endpoint and reloads the current path", async () => {
    const harness = createHarness(
      new Response(JSON.stringify({ success: true })),
    )
    const actions = createWorkspaceSwitchActions(context, harness.dependencies)
    const result = await actions.switchStore("store-b")

    expect(result).toEqual({ status: "success" })
    expect(harness.requests[0]?.input).toBe("/api/stores/active")
    expect(JSON.parse(String(harness.requests[0]?.init?.body))).toEqual({
      storeId: "store-b",
    })
    expect(harness.effects).toEqual(["clear-cache"])
    expect(harness.assignedUrls).toEqual(["/sales?view=open"])
  })

  test("does not request or navigate when the business or store is already selected", async () => {
    const harness = createHarness(new Response(null, { status: 500 }))
    const actions = createWorkspaceSwitchActions(context, harness.dependencies)

    expect(await actions.switchTenant("business-a")).toEqual({
      status: "unchanged",
    })
    expect(await actions.switchStore("store-a")).toEqual({
      status: "unchanged",
    })
    expect(harness.requests).toEqual([])
    expect(harness.effects).toEqual([])
    expect(harness.assignedUrls).toEqual([])
  })
})

test("All stores navigates to Inventory and a concrete selection exits All stores even for the default", async () => {
  const harness = createHarness(new Response(JSON.stringify({ success: true })))
  const actions = createWorkspaceSwitchActions(
    { ...context, inventoryScope: "all" },
    harness.dependencies,
  )
  expect(await actions.switchAllStores()).toEqual({ status: "success" })
  expect(JSON.parse(String(harness.requests[0]?.init?.body))).toEqual({
    scope: "all",
  })
  expect(harness.assignedUrls).toEqual(["/inventory"])
  expect(await actions.switchStore("store-a")).toEqual({ status: "success" })
  expect(harness.requests).toHaveLength(2)
})

test("a revoked cookie can be repaired even when only one Store remains", async () => {
  const harness = createHarness(
    new Response(JSON.stringify({ success: true }), { status: 200 }),
  )
  const repaired = {
    ...context,
    storeSelectionNeedsRepair: true,
    stores: context.stores.slice(0, 1),
    tenants: context.tenants.slice(0, 1),
  }
  const actions = createWorkspaceSwitchActions(repaired, harness.dependencies)
  expect(await actions.switchStore("store-a")).toEqual({ status: "success" })
  expect(harness.requests).toHaveLength(1)
  expect(harness.requests[0]?.init?.body).toBe(
    JSON.stringify({ storeId: "store-a" }),
  )
  expect(harness.effects).toEqual(["clear-cache"])
  expect(
    renderToStaticMarkup(createElement(WorkspaceDropdown, { ctx: repaired })),
  ).not.toContain('disabled=""')
})
