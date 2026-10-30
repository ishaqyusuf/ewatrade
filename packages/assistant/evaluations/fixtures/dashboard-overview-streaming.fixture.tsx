import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { type ReactNode, createElement } from "react"
import type { TenantContext } from "../../../../apps/dashboard/src/lib/tenant"
import type { Prisma } from "../../../../packages/db/generated/prisma/client"
import {
  getDashboardOverviewMetrics,
  getDashboardRecentOrders,
} from "../../../../packages/db/src/queries/dashboard-overview"
import { resolveOrderScope } from "../../../../packages/db/src/queries/order-visibility"
import type { WorkspaceFeatureAvailability } from "../../../../packages/db/src/queries/workspace-feature-availability"

// Run in an isolated react-server process. The installed Flight encoder has no
// declarations; this typed host port follows its actual exported interface.
const encoder: {
  renderToReadableStream: (
    model: ReactNode,
    manifest: Record<string, unknown>,
    options: { onError: (error: unknown) => string; signal: AbortSignal },
  ) => ReadableStream<Uint8Array>
  registerClientReference: (
    value: (props: Record<string, unknown>) => ReactNode,
    id: string,
    name: string,
  ) => (props: Record<string, unknown>) => ReactNode
} = require("next/dist/compiled/react-server-dom-turbopack/server.edge")
const manifest: Record<string, unknown> = {}
const app = (path: string) =>
  new URL(`../../../../apps/dashboard/src/${path}`, import.meta.url).pathname
function client(name: string) {
  const id = `inert/${name}`
  manifest[`${id}#${name}`] = { id, chunks: [], name, async: false }
  return encoder.registerClientReference(() => null, id, name)
}
// Client refs serialize through actual Flight; no client hook, controller,
// business command or provider executes in this server scheduling fixture.
for (const [path, names] of [
  ["components/collapsible-summary", ["CollapsibleSummary"]],
  ["components/dashboard/getting-started", ["GettingStarted"]],
  ["components/dashboard/overview-actions", ["OverviewActions"]],
  ["components/dashboard/overview-fab", ["OverviewFab"]],
  ["components/dashboard/overview-needs-you", ["OverviewNeedsYou"]],
  ["components/dashboard/overview-sheets", ["OverviewSheets"]],
  [
    "components/dashboard/owner-signup-home",
    ["OnlineStoreStrip", "OwnerBusinesses"],
  ],
  [
    "components/dashboard/workspace-error",
    ["OverviewNumbersError", "OverviewOrdersError"],
  ],
  ["components/page-header", ["PageHeader"]],
  ["components/setup-assistant/setup-assistant", ["SetupAssistant"]],
  ["components/orders/overview/order-overview-parts", ["Pill"]],
] as const) {
  mock.module(app(path), () =>
    Object.fromEntries(names.map((name) => [name, client(name)])),
  )
}
mock.module("next/dist/client/components/error-boundary", () => ({
  ErrorBoundary: client("ErrorBoundary"),
}))
mock.module("next/link", () => ({ default: client("Link") }))
mock.module("@hugeicons/react", () => ({
  HugeiconsIcon: client("HugeiconsIcon"),
}))
mock.module(app("components/orders/order-status"), () => ({
  orderStatusPill: () => ({ label: "Confirmed", tone: "neutral" }),
}))
mock.module("server-only", () => ({}))

function deferred<T>() {
  let resolve = (_value: T) => {}
  let reject = (_reason: unknown) => {}
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const store = {
  id: "store-a",
  slug: "store-a",
  name: "Store A",
  currencyCode: "NGN",
  status: "ACTIVE",
}
const facts: WorkspaceFeatureAvailability = {
  storeId: store.id,
  hasOrders: true,
  hasCatalogItems: true,
  hasProductItems: true,
  hasServiceItems: false,
  hasActiveSellableItems: true,
  hasCustomers: false,
  hasInventoryActivity: false,
  hasPrescriptionCommerce: false,
  hasReportableActivity: true,
  hasServiceJobs: false,
  hasStaff: true,
}
let ctx: TenantContext
let signedIn = true
let hasTenant = true
let presence = deferred<WorkspaceFeatureAvailability>()
let policy = deferred<{ salesRepOrderVisibility: string } | null>()
let tenantGate = deferred<void>()
let summaryGate = deferred<void>()
const reads: Array<{ kind: string; input: unknown }> = []
mock.module(app("lib/session"), () => ({
  getServerSession: async () => (signedIn ? { user: { id: "actor-a" } } : null),
}))
mock.module(app("lib/tenant"), () => ({
  getActiveTenant: async () => {
    await tenantGate.promise
    return hasTenant ? ctx : null
  },
}))
mock.module(app("lib/workspace-feature-availability"), () => ({
  getDashboardFeatureAvailability: (storeId: string, tenantId: string) => {
    reads.push({ kind: "presence", input: { storeId, tenantId } })
    return presence.promise
  },
}))
const prisma = {
  store: {
    findFirst: (input: unknown) => {
      reads.push({ kind: "policy", input })
      return policy.promise
    },
  },
  $queryRaw: async (query: Prisma.Sql) => {
    reads.push({ kind: "metrics", input: query.values })
    await summaryGate.promise
    return [
      {
        revenueTodayMinor: 123456n,
        ordersThisMonth: 3n,
        catalogItems: 4n,
        stockBalances: 5n,
      },
    ]
  },
  commercialOrder: {
    findMany: async (input: unknown) => {
      reads.push({ kind: "recent", input })
      return []
    },
  },
}
mock.module("@ewatrade/db", () => ({ prisma }))
mock.module("@ewatrade/db/queries", () => ({
  resolveOrderScope,
  getDashboardOverviewMetrics,
  getDashboardRecentOrders,
}))
const { default: Home } = await import(
  "../../../../apps/dashboard/src/app/(shell)/page"
)
const flights: Array<{ abort: () => void; done: Promise<void> }> = []
const settle = () => new Promise<void>((resolve) => setImmediate(resolve))
function flight() {
  const controller = new AbortController()
  const errors: unknown[] = []
  let text = ""
  const stream = encoder.renderToReadableStream(createElement(Home), manifest, {
    signal: controller.signal,
    onError: (error) => {
      errors.push(error)
      return "inert-read-failure"
    },
  })
  const reader = stream.getReader()
  const done = (async () => {
    const decoder = new TextDecoder()
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      text += decoder.decode(next.value, { stream: true })
    }
  })()
  const result = {
    get text() {
      return text
    },
    errors,
    done,
    abort: () => controller.abort(),
  }
  flights.push(result)
  return result
}
function sectionKeys(text: string) {
  const keys: string[] = []
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      const key = value[2]
      if (
        value[0] === "$" &&
        typeof key === "string" &&
        (["numbers", "needs-you", "recent", "setup"].includes(key) ||
          key.startsWith("store:") ||
          key.startsWith("businesses:"))
      )
        keys.push(key)
      for (const item of value) visit(item)
    } else if (value && typeof value === "object") {
      for (const [name, item] of Object.entries(value))
        if (name !== "fallback") visit(item)
    }
  }
  for (const row of text.split("\n")) {
    const model = row.slice(row.indexOf(":") + 1)
    // Flight element tuples only; ignore import/debug/timing rows and fallbacks.
    if (model.startsWith("[")) visit(JSON.parse(model))
  }
  return [...new Set(keys)]
}
beforeEach(() => {
  reads.length = 0
  signedIn = true
  hasTenant = true
  presence = deferred()
  policy = deferred()
  tenantGate = deferred()
  summaryGate = deferred()
  summaryGate.resolve()
  ctx = {
    activeStore: store,
    stores: [store],
    tenants: [],
    tenant: {
      id: "tenant-a",
      slug: "business-a",
      name: "Business A",
      type: "MERCHANT",
      enabledModes: ["MERCHANT"],
      currencyCode: "NGN",
      timezone: "UTC",
    },
    membership: {
      id: "membership-a",
      role: "CASHIER",
      tenantId: "tenant-a",
      staffAccessMode: "LEGACY",
    },
  }
})
afterEach(async () => {
  presence.resolve(facts)
  policy.resolve({ salesRepOrderVisibility: "OWN_SALES" })
  tenantGate.resolve()
  summaryGate.resolve()
  for (const item of flights.splice(0)) {
    item.abort()
    await item.done.catch(() => {})
  }
})

test("Overview Flight sends its header/actions while presence and fresh visibility remain pending", async () => {
  tenantGate.resolve()
  const view = flight()
  try {
    for (let i = 0; i < 4; i++) await settle()
    expect(reads.filter(({ kind }) => kind === "presence")).toHaveLength(1)
    expect(reads.filter(({ kind }) => kind === "policy")).toHaveLength(1)
    expect(view.text).toContain('"title":"Overview"')
    expect(view.text).toContain("inert/OverviewActions")
    expect(view.text).toContain("inert/OverviewSheets")
    expect(view.text).toContain("inert/OverviewFab")
    expect(view.text).toContain("Loading numbers")
    expect(
      reads.filter(({ kind }) => kind === "metrics" || kind === "recent"),
    ).toHaveLength(0)
    presence.resolve(facts)
    for (let i = 0; i < 2; i++) await settle()
    expect(
      reads.filter(({ kind }) => kind === "metrics" || kind === "recent"),
    ).toHaveLength(0)
    policy.resolve({ salesRepOrderVisibility: "OWN_SALES" })
    await view.done
    expect(view.errors).toHaveLength(0)
    expect(view.text).toContain("Your sales today")
    expect(view.text).toContain("Your recent orders")
    expect(reads.find(({ kind }) => kind === "metrics")?.input).toContain(
      "actor-a",
    )
    expect(reads.find(({ kind }) => kind === "recent")?.input).toMatchObject({
      take: 5,
      where: {
        storeId: store.id,
        tenantId: "tenant-a",
        createdByUserId: "actor-a",
      },
    })
  } finally {
    presence.resolve(facts)
    policy.resolve({ salesRepOrderVisibility: "OWN_SALES" })
  }
})

test("membership resolution still precedes header, presence, visibility and private reads", async () => {
  const view = flight()
  for (let i = 0; i < 3; i++) await settle()
  expect(reads).toHaveLength(0)
  expect(view.text).not.toContain('"title":"Overview"')
  tenantGate.resolve()
  presence.resolve(facts)
  policy.resolve({ salesRepOrderVisibility: "OWN_SALES" })
  await view.done
  expect(view.errors).toHaveLength(0)
})

test("a refused current Store policy sends no metrics or recent Orders", async () => {
  tenantGate.resolve()
  const view = flight()
  for (let i = 0; i < 4; i++) await settle()
  expect(view.text).toContain('"title":"Overview"')
  presence.resolve(facts)
  policy.resolve(null)
  await view.done
  expect(view.errors).toHaveLength(1)
  expect(
    reads.filter(({ kind }) => kind === "metrics" || kind === "recent"),
  ).toHaveLength(0)
})

test("owner composition preserves populated and empty section order without a staff policy read", async () => {
  ctx.membership.role = "OWNER"
  for (const hasOrders of [true, false]) {
    presence = deferred()
    tenantGate.resolve()
    const view = flight()
    presence.resolve({ ...facts, hasOrders })
    await view.done
    expect(view.errors).toHaveLength(0)
    expect(reads.filter(({ kind }) => kind === "policy")).toHaveLength(0)
    expect(sectionKeys(view.text)).toEqual(
      hasOrders
        ? [
            "numbers",
            "needs-you",
            "recent",
            "setup",
            "store:tenant-a:store-a",
            "businesses:tenant-a",
          ]
        : [
            "setup",
            "needs-you",
            "store:tenant-a:store-a",
            "numbers",
            "businesses:tenant-a",
          ],
    )
    expect(view.text).toContain("inert/OverviewNeedsYou")
    expect(view.text).toContain("inert/OwnerBusinesses")
  }
})

test("presence still gates private data after an all-Store visibility result", async () => {
  tenantGate.resolve()
  const view = flight()
  policy.resolve({ salesRepOrderVisibility: "ALL_STORE_ORDERS" })
  for (let i = 0; i < 4; i++) await settle()
  expect(view.text).toContain('"title":"Overview"')
  expect(
    reads.filter(({ kind }) => kind === "metrics" || kind === "recent"),
  ).toHaveLength(0)
  presence.resolve(facts)
  await view.done
  expect(view.errors).toHaveLength(0)
  expect(reads.find(({ kind }) => kind === "metrics")?.input).not.toContain(
    "actor-a",
  )
  expect(reads.find(({ kind }) => kind === "recent")?.input).toMatchObject({
    where: { createdByUserId: undefined },
  })
  expect(view.text).toContain('"children":"Sales today"')
})

test("a failed presence read cannot start metrics or recent Orders", async () => {
  tenantGate.resolve()
  const view = flight()
  for (let i = 0; i < 4; i++) await settle()
  expect(view.text).toContain('"title":"Overview"')
  policy.resolve({ salesRepOrderVisibility: "OWN_SALES" })
  presence.reject(Error("inert presence failure"))
  await view.done
  expect(view.errors).toHaveLength(1)
  expect(
    reads.filter(({ kind }) => kind === "metrics" || kind === "recent"),
  ).toHaveLength(0)
})

test("a slow numbers read retains the existing independent recent-Orders stream", async () => {
  summaryGate = deferred()
  tenantGate.resolve()
  presence.resolve(facts)
  policy.resolve({ salesRepOrderVisibility: "OWN_SALES" })
  const view = flight()
  for (let i = 0; i < 4; i++) await settle()
  expect(reads.filter(({ kind }) => kind === "metrics")).toHaveLength(1)
  expect(reads.filter(({ kind }) => kind === "recent")).toHaveLength(1)
  expect(view.text).toContain("No orders yet. New orders show here.")
  expect(view.text).not.toContain('"children":"Your sales today"')
  summaryGate.resolve()
  await view.done
  expect(view.errors).toHaveLength(0)
  expect(view.text).toContain('"children":"Your sales today"')
})

test("pending requests retain their own Tenant and Store after a second context resolves", async () => {
  tenantGate.resolve()
  const previousPresence = presence
  const previousPolicy = policy
  const previous = flight()
  for (let i = 0; i < 4; i++) await settle()
  const storeB = { ...store, id: "store-b", slug: "store-b", name: "Store B" }
  ctx = {
    ...ctx,
    activeStore: storeB,
    stores: [storeB],
    tenant: { ...ctx.tenant, id: "tenant-b", name: "Business B" },
    membership: { ...ctx.membership, tenantId: "tenant-b" },
  }
  presence = deferred()
  policy = deferred()
  const current = flight()
  presence.resolve({ ...facts, storeId: storeB.id })
  policy.resolve({ salesRepOrderVisibility: "OWN_SALES" })
  await current.done
  expect(current.text).toContain("Business B · Store B")
  expect(previous.text).not.toContain("Business B · Store B")
  previousPresence.resolve(facts)
  previousPolicy.resolve({ salesRepOrderVisibility: "OWN_SALES" })
  await previous.done
  expect(previous.errors).toHaveLength(0)
  expect(current.errors).toHaveLength(0)
  expect(
    reads.filter(({ kind }) => kind === "metrics").map(({ input }) => input),
  ).toEqual([
    expect.arrayContaining(["tenant-b", "store-b", "actor-a"]),
    expect.arrayContaining(["tenant-a", "store-a", "actor-a"]),
  ])
  expect(
    reads.filter(({ kind }) => kind === "recent").map(({ input }) => input),
  ).toEqual([
    expect.objectContaining({
      where: {
        tenantId: "tenant-b",
        storeId: "store-b",
        createdByUserId: "actor-a",
      },
    }),
    expect.objectContaining({
      where: {
        tenantId: "tenant-a",
        storeId: "store-a",
        createdByUserId: "actor-a",
      },
    }),
  ])
})

test("absent session or Tenant never mounts private Overview content", async () => {
  for (const missing of ["session", "tenant"]) {
    signedIn = missing !== "session"
    hasTenant = missing !== "tenant"
    tenantGate.resolve()
    const view = flight()
    await view.done
    expect(view.errors).toHaveLength(0)
    expect(reads).toHaveLength(0)
    expect(view.text).not.toContain("inert/OverviewActions")
  }
})
