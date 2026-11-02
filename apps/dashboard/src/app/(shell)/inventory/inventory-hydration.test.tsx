import { afterEach, expect, mock, test } from "bun:test"
import type { TableSettings } from "@/utils/table-settings"
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

// Actual Inventory routes, option builders, QueryClient dehydrate/hydrate and
// table consumers for both Store and all-Store scope. Presentation helpers and
// transport are inert; no database, stock command or business fixture.
mock.module("@/observability/sentry", () => ({ captureDashboardError() {} }))
mock.module("server-only", () => ({}))
const { makeQueryClient } = await import("@/trpc/query-client")

type Read = { path: string; input: Record<string, unknown> }
const reads: Read[] = []
let client = makeQueryClient()
let role = "OWNER"
let inventoryScope: "store" | "all" = "store"
const rpc = createTRPCClient<AppRouter>({
  links: [
    () =>
      ({ op }) =>
        observable((observer) => {
          const input = (op.input ?? {}) as Record<string, unknown>
          reads.push({ path: op.path, input })
          const scope = String(input.storeId ?? "all")
          const data =
            op.path === "inventory.balanceReport"
              ? { rows: [{ balanceSourceId: `${scope}:balance` }] }
              : op.path === "inventory.operationHistoryPage"
                ? {
                    rows: [
                      {
                        id: `${scope}:operation`,
                        type: "RECEIPT",
                        reason: "",
                        storeName: "",
                        categories: [],
                      },
                    ],
                    nextCursor: null,
                  }
                : [
                    {
                      id: `${scope}:transfer`,
                      productName: "",
                      variantName: "",
                      inventoryUnitName: "",
                      sourceStore: { id: "source", name: "" },
                      targetStore: { id: "target", name: "" },
                      status: "RECEIVED",
                    },
                  ]
          observer.next({ result: { data } })
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
    inventoryScope,
    activeStore: { id: "store-a", name: "Store A", currencyCode: "NGN" },
    stores: [{ id: "store-a", name: "Store A", currencyCode: "NGN" }],
  }),
}))
mock.module("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`)
  },
  usePathname: () => "/inventory/transfers",
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
for (const [path, name] of [
  ["@/components/dashboard/inventory-page", "InventoryPage"],
  ["@/components/tables/inventory/skeleton", "InventoryTableSkeleton"],
  [
    "@/components/dashboard/inventory-operations-page",
    "InventoryOperationsPage",
  ],
  ["@/components/tables/inventory-operations/skeleton", "OperationsSkeleton"],
  ["@/components/dashboard/inventory-transfers-page", "InventoryTransfersPage"],
  ["@/components/tables/stock-transfers/skeleton", "TransfersSkeleton"],
  ["@/components/inventory/inventory-summary", "InventorySummary"],
  ["@/components/sheets/inventory-stores-sheet", "InventoryStoresSheet"],
  ["@/components/sheets/low-stock-level-sheet", "LowStockLevelSheet"],
  ["@/components/sheets/inventory-audit-sheet", "InventoryAuditSheet"],
  ["@/components/tables/inventory-operations/empty-states", "OperationsEmpty"],
  ["@/components/tables/stock-transfers/empty-states", "TransfersEmpty"],
] as const)
  mock.module(path, () => ({ [name]: () => null }))
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
mock.module("@/lib/inventory-view", () => ({
  filterInventory: <T,>(rows: T[]) => rows,
  summarizeInventory: () => ({}),
}))
mock.module("@/lib/inventory-store-totals", () => ({
  groupInventoryStores: <T,>(rows: T[]) => rows,
}))
// The real page-input builder keeps the route prefetch and table on one key.
const { stockHistoryPageInput } = await import("@/lib/inventory-labels")
mock.module("@/lib/inventory-labels", () => ({
  stockChangeGroup: () => "other",
  stockHistoryPageInput,
  stockChangeLabel: (type: string) => type,
  stockDate: () => "",
  transferStatusLabel: (status: string) => status,
}))
mock.module("@/components/tables/inventory/columns", () => ({
  createInventoryColumns: () => [],
  inventorySortFields: ["productName"],
}))
mock.module("@/components/tables/inventory/table-view", () => ({
  InventoryTableView: ({
    table,
  }: {
    table: {
      getRowModel: () => { rows: { original: { balanceSourceId: string } }[] }
    }
  }) => (
    <output>
      {table
        .getRowModel()
        .rows.map((row) => row.original.balanceSourceId)
        .join(",")}
    </output>
  ),
}))
mock.module("@/components/tables/inventory-ledger/data-table", () => ({
  InventoryLedgerTable: ({ rows }: { rows: { id: string }[] }) => (
    <output>{rows.map((row) => row.id).join(",")}</output>
  ),
}))
mock.module("@/components/tables/inventory-operations/columns", () => ({
  operationColumns: () => [],
  operationReason: () => "",
  operationSortFields: [],
  productsChangedText: () => "",
}))
mock.module("@/components/tables/stock-transfers/columns", () => ({
  TransferStatusBadge: () => null,
  transferColumns: () => [],
  transferProductDetail: () => null,
  transferQuantityText: () => "",
  transferSortFields: [],
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
const { InventoryDataTable } = await import(
  "@/components/tables/inventory/data-table"
)
const { OperationsDataTable } = await import(
  "@/components/tables/inventory-operations/data-table"
)
const { TransfersDataTable } = await import(
  "@/components/tables/stock-transfers/data-table"
)
const { default: InventoryRoutePage } = await import("./page")
const { default: OperationsRoutePage } = await import("./operations/page")
const { default: TransfersRoutePage } = await import("./transfers/page")

const settings = {} as TableSettings
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 8))
const container = document.createElement("div")
let root: ReturnType<typeof createRoot> | undefined

async function serverSnapshot(route: () => Promise<unknown>) {
  client = makeQueryClient()
  await route()
  await settle()
  const snapshot = dehydrate(client)
  client.clear()
  return snapshot
}
function browser(snapshot: DehydratedState) {
  client = makeQueryClient()
  hydrate(client, snapshot)
}
async function mount(node: ReactNode) {
  root ??= createRoot(container as unknown as HTMLElement)
  await act(async () => {
    root?.render(
      <QueryClientProvider client={client}>
        <NuqsTestingAdapter searchParams={{}}>
          <Suspense fallback={<output>loading</output>}>{node}</Suspense>
        </NuqsTestingAdapter>
      </QueryClientProvider>,
    )
    await settle()
  })
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = undefined
  client.clear()
  client = makeQueryClient()
  reads.length = 0
  role = "OWNER"
  inventoryScope = "store"
})

const owners = [
  {
    name: "stock balances",
    path: "inventory.balanceReport",
    route: InventoryRoutePage,
    input: { includeCompatibleTotals: true },
    marker: "balance",
    table: (storeId?: string) => (
      <InventoryDataTable storeId={storeId} view="table" />
    ),
  },
  {
    name: "stock history",
    path: "inventory.operationHistoryPage",
    route: () => OperationsRoutePage({ searchParams: Promise.resolve({}) }),
    input: { limit: 50, direction: "forward" },
    marker: "operation",
    table: (storeId?: string) => (
      <OperationsDataTable
        storeId={storeId}
        initialSettings={settings}
        view="table"
      />
    ),
  },
  {
    name: "transfers",
    path: "inventory.transfers",
    route: TransfersRoutePage,
    input: { limit: 200 },
    marker: "transfer",
    table: (storeId?: string) => (
      <TransfersDataTable
        storeId={storeId}
        initialSettings={settings}
        view="table"
      />
    ),
  },
] as const

// Data lives in the inert table output; all-Store help copy remains real.
function renderedRowsText() {
  const outputs = container.getElementsByTagName("output")
  expect(outputs.length).toBe(1)
  return outputs[0]?.textContent
}

for (const owner of owners) {
  for (const scope of ["store", "all"] as const) {
    test(`${owner.name} ${scope}-scope prefetch is consumed by the actual table without a client read`, async () => {
      inventoryScope = scope
      const storeId = scope === "all" ? undefined : "store-a"
      browser(await serverSnapshot(owner.route))
      expect(reads).toEqual([
        { path: owner.path, input: { ...owner.input, storeId } },
      ])
      await mount(owner.table(storeId))
      expect(renderedRowsText()).toBe(`${storeId ?? "all"}:${owner.marker}`)
      expect(reads).toHaveLength(1)
    })
  }

  test(`${owner.name} Store-scoped cache cannot satisfy another Store or the all-Store reader`, async () => {
    browser(await serverSnapshot(owner.route))
    await mount(owner.table("store-b"))
    expect(renderedRowsText()).toBe(`store-b:${owner.marker}`)
    expect(reads).toHaveLength(2)
    expect(reads[1]?.input.storeId).toBe("store-b")
    await mount(owner.table(undefined))
    expect(renderedRowsText()).toBe(`all:${owner.marker}`)
    expect(reads).toHaveLength(3)
    expect(reads[2]?.input.storeId).toBeUndefined()
  })
}

test("Inventory admission refusal starts no prefetch on any of the three routes", async () => {
  role = "MEMBER"
  for (const owner of owners)
    await expect(owner.route()).rejects.toThrow("redirect:/")
  expect(reads).toEqual([])
})
