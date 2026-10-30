import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import {
  HydrationBoundary,
  QueryClientProvider,
  dehydrate,
} from "@tanstack/react-query"
import { TRPCClientError, createTRPCClient } from "@trpc/client"
import { observable } from "@trpc/server/observable"
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query"
import { NuqsTestingAdapter } from "nuqs/adapters/testing"
import { type ReactNode, Suspense } from "react"
import { renderToReadableStream } from "react-dom/server"
import * as tabs from "../../../../packages/ui/src/components/tabs"
import { cn } from "../../../../packages/ui/src/lib/utils"

// Actual route, URL loader/hook, Reports consumers, Base UI tabs and query
// hydration. Auth, RPC data and unrelated presentation are inert ports.
const app = (path: string) =>
  new URL(`../../../../apps/dashboard/src/${path}`, import.meta.url).pathname
const leaf = ({ children }: { children?: ReactNode }) => <div>{children}</div>
mock.module("@ewatrade/ui", () => ({ ...tabs, cn, Button: leaf }))
mock.module(app("observability/sentry"), () => ({ captureDashboardError() {} }))
mock.module(app("components/page-header"), () => ({
  PageHeader: leaf,
  PageToolbar: ({ actions }: { actions: ReactNode }) => <div>{actions}</div>,
}))
mock.module(app("components/scrollable-content"), () => ({
  ScrollableContent: leaf,
}))
mock.module(app("components/dashboard/offline-record-review"), () => ({
  OfflineRecordReview: () => <div>Offline review port</div>,
}))
mock.module(app("components/dashboard/operations-sales-charts"), () => ({
  SalesByDayCard: () => <div>Sales chart port</div>,
  TopSellersCard: () => <div>Top sellers port</div>,
}))
mock.module(app("components/reports/report-date-control"), () => ({
  ReportDateControl: () => null,
}))
mock.module(app("components/reports/report-download-button"), () => ({
  ReportDownloadButton: () => null,
}))
mock.module(app("components/reports/report-error"), () => ({
  ReportError: () => <div>Report failure port</div>,
}))
mock.module("@hugeicons/react", () => ({ HugeiconsIcon: () => null }))
mock.module("server-only", () => ({}))
let signedIn = true
let tenant = true
let hasStore = true
const store = { id: "store-b", name: "B", currencyCode: "NGN" }
mock.module(app("lib/session"), () => ({
  getServerSession: async () => (signedIn ? { user: { id: "actor" } } : null),
}))
mock.module(app("lib/tenant"), () => ({
  getActiveTenant: async () =>
    tenant
      ? {
          tenant: { name: "Business" },
          activeStore: hasStore ? store : null,
          stores: hasStore ? [store] : [],
        }
      : null,
}))
mock.module("next/navigation", () => ({
  redirect: (path: string) => {
    throw Error(`redirect:${path}`)
  },
}))
const sales = {
  currencyCode: "NGN",
  days: [],
  otherItems: { count: 0, totalMinor: 0 },
  partial: false,
  topItems: [],
  totals: {
    orderCount: 2,
    orderValueMinor: 10000,
    productMinor: 8000,
    serviceMinor: 2000,
    serviceQuantity: "1",
  },
}
const data: Record<string, unknown> = {
  "orders.salesReport": sales,
  "inventory.reconciliationReport": { provisionalCommands: 0 },
  "inventory.balanceReport": { rows: [] },
  "serviceReporting.summary": {
    commercial: { immutableServiceQuantity: "1", serviceRevenueMinor: 2000 },
    communications: { intents: 0 },
    work: {
      blocked: 1,
      completed: 0,
      exceptions: 0,
      overdueJobs: 0,
      ready: 0,
      rework: 0,
      wip: 1,
    },
  },
}
const calls: Array<{ path: string; input: unknown }> = []
let release: (() => void) | undefined
let blocked: Promise<void> | undefined
const rpc = createTRPCClient<AppRouter>({
  links: [
    () =>
      ({ op }) =>
        observable((observer) => {
          calls.push({ path: op.path, input: op.input })
          if (op.type !== "query" || !(op.path in data)) {
            observer.error(new TRPCClientError("Unexpected inert operation"))
            return
          }
          void Promise.resolve(blocked).then(() => {
            observer.next({ result: { data: data[op.path] } })
            observer.complete()
          })
        }),
  ],
})
const { makeQueryClient } = await import(
  "../../../../apps/dashboard/src/trpc/query-client"
)
let server = makeQueryClient()
let browser = makeQueryClient()
let serverOptions = createTRPCOptionsProxy<AppRouter>({
  client: rpc,
  queryClient: server,
})
let browserOptions = createTRPCOptionsProxy<AppRouter>({
  client: rpc,
  queryClient: browser,
})
mock.module(app("trpc/server"), () => ({
  get trpc() {
    return serverOptions
  },
  prefetch: (options: Parameters<typeof server.prefetchQuery>[0]) =>
    server.prefetchQuery(options),
  HydrateClient: ({ children }: { children: ReactNode }) => (
    <HydrationBoundary state={dehydrate(server)}>{children}</HydrationBoundary>
  ),
}))
mock.module(app("trpc/client"), () => ({ useTRPC: () => browserOptions }))
const { default: Analytics } = await import(
  "../../../../apps/dashboard/src/app/(shell)/analytics/page"
)
const { OperationsReports } = await import(
  "../../../../apps/dashboard/src/components/dashboard/operations-reports"
)
const { loadOperationsReportParams } = await import(
  "../../../../apps/dashboard/src/hooks/use-operations-report-params"
)
const dates = { from: "2026-10-01", to: "2026-10-08" }
const settle = () => new Promise<void>((resolve) => setImmediate(resolve))
beforeEach(() => {
  calls.length = 0
  signedIn = tenant = hasStore = true
  blocked = undefined
  release = undefined
  server = makeQueryClient()
  browser = makeQueryClient()
  serverOptions = createTRPCOptionsProxy<AppRouter>({
    client: rpc,
    queryClient: server,
  })
  browserOptions = createTRPCOptionsProxy<AppRouter>({
    client: rpc,
    queryClient: browser,
  })
})
afterEach(() => {
  release?.()
  server.clear()
  browser.clear()
})

async function render(children: ReactNode, params: Record<string, string>) {
  const stream = await renderToReadableStream(
    <QueryClientProvider client={browser}>
      <NuqsTestingAdapter searchParams={params}>
        <Suspense fallback={<div>Loading report port</div>}>
          {children}
        </Suspense>
      </NuqsTestingAdapter>
    </QueryClientProvider>,
  )
  return new Response(stream).text()
}

for (const tab of ["service", "inventory", "invalid", ""] as const) {
  test(`Reports ${tab || "default"} prefetches only mounted consumers with matching hydration inputs`, async () => {
    const params = { ...dates, operationsReportTab: tab }
    const page = await Analytics({ searchParams: Promise.resolve(params) })
    await settle()
    const expected = tab === "service" ? 3 : 5
    const before = [...calls]
    const html = await render(page, params)
    expect(calls).toEqual(before)
    expect(html).toContain('aria-label="Sales"')
    expect(html).toContain(
      tab === "service" ? 'aria-label="Service jobs"' : 'aria-label="Stock"',
    )
    expect(html).not.toContain(
      tab === "service" ? 'aria-label="Stock"' : 'aria-label="Jobs right now"',
    )
    expect(calls).toHaveLength(expected)
    expect(
      calls.filter(({ path }) => path.startsWith("inventory.")),
    ).toHaveLength(tab === "service" ? 0 : 2)
    // Both tabs need the shared warning dot and both sales periods.
    expect(html).toContain("has blocks")
    expect(
      calls
        .filter(({ path }) => path === "orders.salesReport")
        .map(({ input }) => input),
    ).toEqual([
      { from: new Date(dates.from), to: new Date(dates.to), storeId: store.id },
      {
        from: new Date("2026-09-24"),
        to: new Date(dates.from),
        storeId: store.id,
      },
    ])
    // Later activation still loads the two stock queries, without new sales or
    // service reads; a return to Service reuses its existing query generation.
    if (tab === "service") {
      const stock = await render(
        <OperationsReports store={store} tenantName="Business" />,
        { ...dates },
      )
      expect(stock).toContain('aria-label="Stock"')
      expect(calls).toHaveLength(5)
      await render(
        <OperationsReports store={store} tenantName="Business" />,
        params,
      )
      expect(calls).toHaveLength(5)
    }
  })
}

test("Reports presentation returns while selected reads remain pending", async () => {
  blocked = new Promise<void>((resolve) => {
    release = resolve
  })
  let returned = false
  const rendering = Analytics({
    searchParams: Promise.resolve({ ...dates, operationsReportTab: "service" }),
  }).then(() => {
    returned = true
  })
  await settle()
  expect(returned).toBe(true)
  expect(calls).toHaveLength(3)
  release?.()
  await rendering
})

test("Reports retains auth, tenant and Store admission before any report read", async () => {
  const props = { searchParams: Promise.resolve(dates) }
  signedIn = false
  await expect(Analytics(props)).rejects.toThrow("redirect:/login")
  signedIn = true
  tenant = false
  await expect(Analytics(props)).rejects.toThrow(
    "redirect:/login?error=no_tenant",
  )
  tenant = true
  hasStore = false
  await expect(Analytics(props)).rejects.toThrow("redirect:/setup")
  expect(calls).toHaveLength(0)
})

test("server URL loader exposes the same allowlisted tab as the client hook", async () => {
  for (const tab of ["service", "inventory", "other", ""]) {
    expect(
      await loadOperationsReportParams(
        Promise.resolve({ ...dates, operationsReportTab: tab }),
      ),
    ).toMatchObject({
      range: { from: new Date(dates.from), to: new Date(dates.to) },
      tab: tab === "service" ? "service" : "inventory",
    })
  }
})
