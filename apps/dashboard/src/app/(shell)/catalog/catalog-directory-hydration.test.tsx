import { afterEach, expect, mock, test } from "bun:test"
import {
  type CatalogFilters,
  loadCatalogFilterParams,
} from "@/hooks/use-catalog-filter-params"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { QueryClientProvider, dehydrate, hydrate } from "@tanstack/react-query"
import { createTRPCClient } from "@trpc/client"
import { observable } from "@trpc/server/observable"
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query"
import { DOMImplementation } from "@xmldom/xmldom"
import { Suspense, act, useState } from "react"

mock.module("@/observability/sentry", () => ({ captureDashboardError() {} }))
const { makeQueryClient } = await import("@/trpc/query-client")
let client = makeQueryClient()
const reads: { path: string; input: unknown }[] = []
let allowed = true
let label = "Rice"
const rpc = createTRPCClient<AppRouter>({
  links: [
    () =>
      ({ op }) =>
        observable((observer) => {
          reads.push({ path: op.path, input: op.input })
          observer.next({
            result: {
              data: {
                items: [
                  {
                    id: "item",
                    name: label,
                    kind: "product",
                    status: "active",
                    variantCount: 0,
                    primaryVariantName: null,
                    offeringCount: 0,
                    primaryOffering: null,
                    product: null,
                    photos: [],
                    illustrations: [],
                  },
                ],
                nextCursor: undefined,
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
let filter: CatalogFilters = { kind: null, status: null, query: null }
mock.module("@/lib/session", () => ({
  getServerSession: async () => ({ user: { id: "actor" } }),
}))
mock.module("@/lib/tenant", () => ({
  getActiveTenant: async () => ({
    membership: { role: allowed ? "OWNER" : "MEMBER" },
    tenant: { id: "tenant" },
    activeStore: { id: "store", name: "Store", currencyCode: "NGN" },
    stores: [],
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
  getInitialDirectoryView: async () => ({ view: "table" }),
}))
mock.module("@/components/dashboard/catalog-items-page", () => ({
  CatalogItemsPage: () => null,
}))
mock.module("@/trpc/server", () => ({
  getQueryClient: () => client,
  HydrateClient: () => null,
  trpc,
}))
mock.module("@/trpc/client", () => ({ useTRPC: () => trpc }))
mock.module("@/hooks/use-catalog-item-params", () => ({
  useCatalogItemParams: () => ({
    filter,
    hasFilters: Boolean(filter.query || filter.kind || filter.status),
  }),
}))
mock.module("@/hooks/use-catalog-detail-params", () => ({
  useCatalogDetailParams: () => ({ open() {} }),
}))
mock.module("@/hooks/use-sort-params", () => ({
  useSortParams: () => ({ sort: undefined }),
}))
mock.module("@/hooks/use-table-settings", () => ({
  useTableSettings: () => ({
    columnVisibility: {},
    columnSizing: {},
    columnOrder: [],
  }),
}))
mock.module("@/components/tables/core", () => ({
  useLoadedRowSelection: () => useState({}),
}))
mock.module("@/components/tables/catalog/columns", () => ({
  createCatalogColumns: () => [],
}))
mock.module("@/components/tables/catalog/table-view", () => ({
  CatalogTableView: ({
    table,
  }: {
    table: { getRowModel: () => { rows: { original: { name: string } }[] } }
  }) => (
    <output>
      {table
        .getRowModel()
        .rows.map((row) => row.original.name)
        .join(",")}
    </output>
  ),
}))

const document = new DOMImplementation().createDocument(
  "http://www.w3.org/1999/xhtml",
  "html",
  null,
)
const window = {
  document,
  HTMLIFrameElement: class {},
  HTMLElement: class {},
  addEventListener() {},
  removeEventListener() {},
}
Object.assign(globalThis, { window, document, IS_REACT_ACT_ENVIRONMENT: true })
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
const { CatalogDataTable } = await import(
  "@/components/tables/catalog/data-table"
)
const container = document.createElement("div")
let root: ReturnType<typeof createRoot> | undefined
async function mount() {
  root ??= createRoot(container as unknown as HTMLElement)
  await act(async () => {
    root?.render(
      <QueryClientProvider client={client}>
        <Suspense fallback={<output>loading</output>}>
          <CatalogDataTable storeId="store" view="table" />
        </Suspense>
      </QueryClientProvider>,
    )
    await new Promise((resolve) => setTimeout(resolve, 8))
  })
}
const { default: CatalogRoute } = await import("./page")
afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = undefined
  client.clear()
  client = makeQueryClient()
  filter = { kind: null, status: null, query: null }
  label = "Rice"
  reads.length = 0
  allowed = true
})

test("Catalog prefetch loads the directory projection with the canonical URL input", async () => {
  await CatalogRoute({
    searchParams: Promise.resolve({
      catalogKind: "product",
      catalogStatus: "active",
      catalogQuery: "  rice  ",
    }),
  })
  await Promise.resolve()
  expect(reads).toMatchObject([
    {
      path: "catalog.listDirectoryPage",
      input: {
        kind: "product",
        status: "active",
        query: "rice",
        limit: 25,
        sort: undefined,
      },
    },
  ])
})
test("denied Catalog admission starts no directory read", async () => {
  allowed = false
  await expect(
    CatalogRoute({ searchParams: Promise.resolve({}) }),
  ).rejects.toThrow("redirect:/")
  expect(reads).toEqual([])
})

test("actual infinite consumer hydrates route data without duplicate fetch and refreshes only its directory", async () => {
  const params = { catalogKind: "product", catalogQuery: "rice" }
  filter = await loadCatalogFilterParams(Promise.resolve(params))
  await CatalogRoute({ searchParams: Promise.resolve(params) })
  await Promise.resolve()
  await Promise.resolve()
  const snapshot = dehydrate(client)
  expect(reads).toHaveLength(1)
  client = makeQueryClient()
  hydrate(client, snapshot)
  await mount()
  expect(container.textContent).toBe("Rice")
  expect(reads).toHaveLength(1)
  client.setQueryData(["unrelated"], "retained")
  label = "Updated"
  await act(async () => {
    await client.invalidateQueries({
      queryKey: trpc.catalog.listDirectoryPage.pathKey(),
    })
    await new Promise((resolve) => setTimeout(resolve, 8))
  })
  expect(container.textContent).toBe("Updated")
  expect(reads).toHaveLength(2)
  expect(client.getQueryData(["unrelated"])).toBe("retained")
  await act(async () => {
    await client.invalidateQueries({ queryKey: trpc.catalog.pathKey() })
  })
  expect(reads).toHaveLength(3)
})

test("Catalog creation refresh hydrates the invalidated directory without a second foreground fetch", async () => {
  await CatalogRoute({ searchParams: Promise.resolve({}) })
  await Promise.resolve()
  await mount()
  const browserClient = client
  expect(reads).toHaveLength(1)
  await act(async () => {
    await browserClient.invalidateQueries({
      queryKey: trpc.catalog.listDirectoryPage.pathKey(),
      refetchType: "none",
    })
  })
  expect(reads).toHaveLength(1)
  label = "Created"
  client = makeQueryClient()
  await CatalogRoute({ searchParams: Promise.resolve({}) })
  await Promise.resolve()
  await Promise.resolve()
  const refreshed = dehydrate(client)
  client = browserClient
  await act(async () => {
    hydrate(client, refreshed)
    await new Promise((resolve) => setTimeout(resolve, 8))
  })
  expect(container.textContent).toBe("Created")
  expect(reads).toHaveLength(2)
})
