import { afterEach, expect, mock, test } from "bun:test"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import {
  type DehydratedState,
  type FetchQueryOptions,
  QueryClientProvider,
  dehydrate,
  hydrate,
} from "@tanstack/react-query"
import { createTRPCClient } from "@trpc/client"
import { observable } from "@trpc/server/observable"
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query"
import { DOMImplementation } from "@xmldom/xmldom"
import { NuqsTestingAdapter } from "nuqs/adapters/testing"
import { type ReactNode, Suspense, act, useState } from "react"

// Actual Sales/Services routes, typed URL parsers, tRPC option builders,
// QueryClient dehydrate/hydrate and infinite table consumers. Transport and
// presentation are inert; no database, provider or business command.
mock.module("@/observability/sentry", () => ({ captureDashboardError() {} }))
mock.module("server-only", () => ({}))
const { makeQueryClient } = await import("@/trpc/query-client")

type Read = { path: string; input: Record<string, unknown> }
const reads: Read[] = []
let client = makeQueryClient()
let role = "OWNER"
const rpc = createTRPCClient<AppRouter>({
  links: [
    () =>
      ({ op }) =>
        observable((observer) => {
          const input = (op.input ?? {}) as Record<string, unknown>
          reads.push({ path: op.path, input })
          const page = input.cursor === "page-2" ? 2 : 1
          const tag = String(input.statuses ?? input.stage ?? "")
          observer.next({
            result: {
              data: {
                items: [
                  {
                    id: `${String(input.storeId)}:${tag}:${page}`,
                    label: `${String(input.storeId)}/${tag}#${page}`,
                  },
                ],
                nextCursor: page === 1 ? "page-2" : undefined,
              },
            },
          })
          observer.complete()
        }),
  ],
})
const trpc = createTRPCOptionsProxy<AppRouter>({
  client: rpc,
  queryClient: () => client,
})

mock.module("@/lib/session", () => ({
  getServerSession: async () => ({ user: { id: "actor" } }),
}))
mock.module("@/lib/tenant", () => ({
  getActiveTenant: async () => ({
    membership: { role, staffAccessMode: "LEGACY" },
    tenant: { id: "tenant", timezone: "UTC" },
    activeStore: { id: "store-a", name: "Store A", currencyCode: "NGN" },
    stores: [{ id: "store-a", name: "Store A", currencyCode: "NGN" }],
  }),
}))
mock.module("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`)
  },
}))
mock.module("@/utils/columns", () => ({
  getInitialTableSettings: async () => ({}),
}))
mock.module("@/utils/directory-views", () => ({
  getInitialDirectoryView: async () => ({ scope: "inert", view: null }),
}))
mock.module("@/trpc/server", () => ({
  getQueryClient: () => client,
  prefetch: (options: FetchQueryOptions) => client.prefetchQuery(options),
  HydrateClient: () => null,
  trpc,
}))
mock.module("@/trpc/client", () => ({ useTRPC: () => trpc }))
mock.module("@/components/dashboard/sales-page", () => ({
  SalesPage: () => null,
}))
mock.module("@/components/tables/orders/skeleton", () => ({
  OrdersTableSkeleton: () => null,
}))
mock.module("@/components/dashboard/service-jobs-page", () => ({
  ServiceJobsPage: () => null,
}))
mock.module("@/components/tables/service-work/skeleton", () => ({
  ServiceWorkTableSkeleton: () => null,
}))
mock.module("@/components/tables/core", () => ({
  useLoadedRowSelection: () => useState({}),
}))
mock.module("@/hooks/use-table-settings", () => ({
  useTableSettings: () => ({
    columnVisibility: {},
    columnSizing: {},
    columnOrder: [],
    setColumnVisibility() {},
    setColumnSizing() {},
    setColumnOrder() {},
    persistenceError: null,
    retryPersistence() {},
  }),
}))
mock.module("framer-motion", () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
}))

let latest:
  | { rows: string[]; hasNextPage: boolean; fetchNextPage: () => unknown }
  | undefined
function TableProbe(props: {
  table: { getRowModel: () => { rows: { original: { label: string } }[] } }
  hasNextPage: boolean
  fetchNextPage: () => unknown
}) {
  const rows = props.table.getRowModel().rows.map((row) => row.original.label)
  latest = {
    rows,
    hasNextPage: props.hasNextPage,
    fetchNextPage: props.fetchNextPage,
  }
  return <output>{rows.join(",")}</output>
}
mock.module("@/components/tables/orders/bottom-bar", () => ({
  OrdersBottomBar: () => null,
}))
mock.module("@/components/tables/orders/columns", () => ({
  orderColumns: () => [],
}))
mock.module("@/components/tables/orders/empty-states", () => ({
  OrdersEmptyState: () => null,
}))
mock.module("@/components/tables/orders/table-view", () => ({
  OrdersTableView: TableProbe,
}))
mock.module("@/components/service-work/use-job-quick-step", () => ({
  useJobQuickStep: () => ({ isPending: false, run: async () => {} }),
}))
mock.module("@/components/tables/service-work/use-batch-actions", () => ({
  useServiceWorkBatch: () => ({}),
}))
mock.module("@/components/tables/service-work/columns", () => ({
  createServiceWorkColumns: () => [],
}))
mock.module("@/components/tables/service-work/table-view", () => ({
  ServiceWorkTableView: TableProbe,
}))

const document = new DOMImplementation().createDocument(
  "http://www.w3.org/1999/xhtml",
  "html",
  null,
)
const window = {
  document,
  location: {
    origin: "https://ewatrade-dashboard.localhost",
    pathname: "/",
    search: "",
  },
  HTMLIFrameElement: class {},
  HTMLElement: class {},
  addEventListener() {},
  removeEventListener() {},
}
Object.assign(globalThis, {
  window,
  document,
  location: window.location,
  IS_REACT_ACT_ENVIRONMENT: true,
})
Object.assign(document, {
  defaultView: window,
  addEventListener() {},
  removeEventListener() {},
})
const element = document.createElement.bind(document)
document.createElement = (name: string) =>
  Object.assign(element(name), {
    style: {},
    addEventListener() {},
    removeEventListener() {},
  })
const text = document.createTextNode.bind(document)
document.createTextNode = (value: string) => {
  const node = text(value)
  Object.defineProperty(node, "nodeValue", {
    get: () => node.data,
    set: (next: string) => {
      node.data = next
    },
  })
  return node
}
const { createRoot } = await import("react-dom/client")
const { OrdersDataTable } = await import(
  "@/components/tables/orders/data-table"
)
const { ServiceWorkDataTable } = await import(
  "@/components/tables/service-work/data-table"
)
const { default: SalesRoutePage } = await import("./sales/page")
const { default: ServicesRoutePage } = await import("./services/page")

type Params = Record<string, string>
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 8))
const container = document.createElement("div")
let root: ReturnType<typeof createRoot> | undefined

async function serverSnapshot(
  route: (props: { searchParams: Promise<Params> }) => Promise<unknown>,
  params: Params,
) {
  client = makeQueryClient()
  await route({ searchParams: Promise.resolve(params) })
  await settle()
  const snapshot = dehydrate(client)
  client.clear()
  return snapshot
}
function browser(snapshot: DehydratedState) {
  client = makeQueryClient()
  hydrate(client, snapshot)
}
async function mount(node: ReactNode, params: Params) {
  root ??= createRoot(container as unknown as HTMLElement)
  await act(async () => {
    root?.render(
      <QueryClientProvider client={client}>
        <NuqsTestingAdapter searchParams={params}>
          <Suspense fallback={<output>loading</output>}>{node}</Suspense>
        </NuqsTestingAdapter>
      </QueryClientProvider>,
    )
    await settle()
  })
}
const withoutPage = ({
  cursor: _cursor,
  direction: _direction,
  ...input
}: Record<string, unknown>) => input

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = undefined
  client.clear()
  client = makeQueryClient()
  reads.length = 0
  role = "OWNER"
  latest = undefined
})

test("Sales hydrates its Store-scoped filtered/sorted first page and fetches only the following cursor", async () => {
  const params = {
    orderQuery: "  ada  ",
    orderStatus: "PENDING",
    sort: "total,desc",
  }
  const snapshot = await serverSnapshot(SalesRoutePage, params)
  expect(reads).toHaveLength(1)
  expect(reads[0]).toMatchObject({
    path: "orders.listPage",
    input: {
      limit: 25,
      query: "ada",
      queryMode: "all",
      statuses: ["PENDING"],
      sort: { field: "total", direction: "desc" },
      storeId: "store-a",
    },
  })
  expect(reads[0]?.input.cursor ?? null).toBeNull()
  browser(snapshot)
  await mount(<OrdersDataTable storeId="store-a" view="table" />, params)
  expect(container.textContent).toBe("store-a/PENDING#1")
  expect(reads).toHaveLength(1)
  expect(latest?.hasNextPage).toBe(true)
  await act(async () => {
    await latest?.fetchNextPage()
    await settle()
  })
  expect(reads).toHaveLength(2)
  expect(reads[1]?.input.cursor).toBe("page-2")
  expect(withoutPage(reads[1]?.input ?? {})).toEqual(
    withoutPage(reads[0]?.input ?? {}),
  )
  expect(container.textContent).toBe("store-a/PENDING#1,store-a/PENDING#2")
  expect(latest?.hasNextPage).toBe(false)
})

test("a changed Sales URL filter or another Store cannot consume the prefetched page", async () => {
  browser(await serverSnapshot(SalesRoutePage, { orderStatus: "PENDING" }))
  await mount(<OrdersDataTable storeId="store-a" view="table" />, {
    orderStatus: "COMPLETED",
  })
  expect(container.textContent).toBe("store-a/COMPLETED#1")
  expect(reads.map((read) => read.input.statuses)).toEqual([
    ["PENDING"],
    ["COMPLETED"],
  ])
  await mount(<OrdersDataTable storeId="store-b" view="table" />, {
    orderStatus: "COMPLETED",
  })
  expect(container.textContent).toBe("store-b/COMPLETED#1")
  expect(reads).toHaveLength(3)
  expect(reads[2]?.input.storeId).toBe("store-b")
  expect(reads[2]?.input.statuses).toEqual(["COMPLETED"])
})

test("Sales admission refusal starts no list read", async () => {
  role = "MEMBER"
  await expect(
    SalesRoutePage({ searchParams: Promise.resolve({}) }),
  ).rejects.toThrow("redirect:/")
  expect(reads).toEqual([])
})

test("Services hydrates its selected work queue page and fetches only the following cursor", async () => {
  const params = {
    serviceQuery: "  repair  ",
    serviceStage: "doing",
    sort: "priority,asc",
  }
  const snapshot = await serverSnapshot(ServicesRoutePage, params)
  expect(reads).toHaveLength(1)
  expect(reads[0]).toMatchObject({
    path: "services.queuePage",
    input: {
      limit: 25,
      query: "repair",
      stage: "doing",
      sort: { field: "priority", direction: "asc" },
      storeId: "store-a",
    },
  })
  browser(snapshot)
  await mount(
    <ServiceWorkDataTable
      canManage={false}
      storeId="store-a"
      timeZone="UTC"
      view="table"
    />,
    params,
  )
  expect(container.textContent).toBe("store-a/doing#1")
  expect(reads).toHaveLength(1)
  await act(async () => {
    await latest?.fetchNextPage()
    await settle()
  })
  expect(reads).toHaveLength(2)
  expect(reads[1]?.input.cursor).toBe("page-2")
  expect(withoutPage(reads[1]?.input ?? {})).toEqual(
    withoutPage(reads[0]?.input ?? {}),
  )
  expect(container.textContent).toBe("store-a/doing#1,store-a/doing#2")
  expect(latest?.hasNextPage).toBe(false)
})

test("Services default sort is consumed, while another Store reads its own queue", async () => {
  browser(await serverSnapshot(ServicesRoutePage, {}))
  expect(reads[0]?.input.sort).toEqual({
    field: "createdAt",
    direction: "desc",
  })
  await mount(
    <ServiceWorkDataTable
      canManage={false}
      storeId="store-a"
      timeZone="UTC"
      view="table"
    />,
    {},
  )
  expect(container.textContent).toBe("store-a/all#1")
  expect(reads).toHaveLength(1)
  await mount(
    <ServiceWorkDataTable
      canManage={false}
      storeId="store-b"
      timeZone="UTC"
      view="table"
    />,
    {},
  )
  expect(container.textContent).toBe("store-b/all#1")
  expect(reads).toHaveLength(2)
  expect(reads[1]?.input.storeId).toBe("store-b")
})
