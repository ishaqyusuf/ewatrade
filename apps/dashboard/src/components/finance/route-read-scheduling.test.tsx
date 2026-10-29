import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { type FetchQueryOptions, QueryClient } from "@tanstack/react-query"

const reads: { path: string; input: unknown }[] = []
let signedIn = true
let role = "OWNER"
let hasStore = true
let tableGate: Promise<unknown> | undefined
let viewGate: Promise<unknown> | undefined
let client = new QueryClient()
const store = { id: "store-a", name: "Store", currencyCode: "NGN" }

function endpoint(path: string, result: unknown = {}) {
  const queryOptions = (input?: unknown, options?: object) => ({
    ...options,
    queryKey: [path, input],
    queryFn: async () => {
      reads.push({ path, input })
      return result
    },
  })
  return { queryOptions, infiniteQueryOptions: queryOptions }
}

mock.module("server-only", () => ({}))
mock.module("@/lib/session", () => ({
  getServerSession: async () => (signedIn ? { user: { id: "actor-a" } } : null),
}))
mock.module("@/lib/tenant", () => ({
  getActiveTenant: async () => ({
    membership: { role },
    tenant: { id: "tenant-a", timezone: "UTC" },
    activeStore: hasStore ? store : null,
    stores: hasStore ? [store] : [],
  }),
}))
mock.module("@/utils/columns", () => ({
  getInitialTableSettings: async () => {
    await tableGate
    return {}
  },
}))
mock.module("@/utils/directory-views", () => ({
  getInitialDirectoryView: async () => {
    await viewGate
    return { scope: "display-scope", view: null }
  },
}))
mock.module("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`)
  },
}))
mock.module("@/components/dashboard/page-loading", () => ({
  PageLoading: () => null,
}))
mock.module("@/components/dashboard/service-jobs-page", () => ({
  ServiceJobsPage: () => null,
}))
mock.module("@/components/tables/service-work/skeleton", () => ({
  ServiceWorkTableSkeleton: () => null,
}))
mock.module("./finance-workspace", () => ({ FinanceWorkspace: () => null }))
mock.module("@/trpc/server", () => ({
  getQueryClient: () => client,
  prefetch: (options: FetchQueryOptions) => client.prefetchQuery(options),
  HydrateClient: () => null,
  trpc: {
    finance: {
      book: endpoint("finance.book", { id: "book-a" }),
      bankStatements: {
        list: endpoint("finance.bankStatements.list", { nextCursor: null }),
      },
      supplierDirectory: endpoint("finance.supplierDirectory", {
        nextCursor: null,
      }),
      bills: endpoint("finance.bills", { nextCursor: null }),
    },
    catalog: { listItems: endpoint("catalog.listItems", []) },
    services: {
      queuePage: endpoint("services.queuePage", { nextCursor: null }),
    },
    serviceAccess: {
      requestForms: endpoint("serviceAccess.requestForms", []),
      requests: endpoint("serviceAccess.requests", []),
    },
  },
}))

const { FinanceRoute } = await import("./finance-route")
const { default: ServicesRoutePage } = await import(
  "../../app/(shell)/services/page"
)
const settle = () => new Promise<void>((resolve) => setImmediate(resolve))
const paths = () => reads.map((read) => read.path).sort()

beforeEach(() => {
  reads.length = 0
  signedIn = true
  role = "OWNER"
  hasStore = true
  tableGate = undefined
  viewGate = undefined
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
})
afterEach(() => client.clear())

test("Finance starts its authorized book read while independent display cookies are pending", async () => {
  const table = Promise.withResolvers<void>()
  const view = Promise.withResolvers<void>()
  tableGate = table.promise
  viewGate = view.promise
  const loading = FinanceRoute({
    view: "bank",
    searchParams: Promise.resolve({ bankQuery: " invoice " }),
  })
  try {
    await settle()
    expect(paths()).toContain("finance.book")
  } finally {
    table.resolve()
    view.resolve()
    await loading
  }
  await settle()
  expect(paths()).toEqual(["finance.bankStatements.list", "finance.book"])
  expect(
    reads.find((read) => read.path === "finance.bankStatements.list")?.input,
  ).toEqual({
    bookId: "book-a",
    accountId: undefined,
    query: "invoice",
    limit: 30,
  })
})

test("Services default work route does not fetch unmounted request lists or link forms", async () => {
  await ServicesRoutePage({ searchParams: Promise.resolve({}) })
  await settle()
  expect(paths()).toEqual(["services.queuePage"])
})

test("Services requests route hydrates the selected requests table without the hidden work queue", async () => {
  await ServicesRoutePage({
    searchParams: Promise.resolve({ serviceTab: "requests" }),
  })
  await settle()
  expect(paths()).toEqual(["serviceAccess.requests"])
  expect(reads[0]?.input).toEqual({ limit: 100, storeId: "store-a" })
})

test("Services keeps useful prefetches for an open request-link sheet", async () => {
  await ServicesRoutePage({
    searchParams: Promise.resolve({ serviceSheet: "request" }),
  })
  await settle()
  expect(paths()).toEqual([
    "catalog.listItems",
    "serviceAccess.requestForms",
    "services.queuePage",
  ])
})

test("Services deep-linked request detail retains its own list dependency", async () => {
  await ServicesRoutePage({
    searchParams: Promise.resolve({
      serviceSheet: "customer_request",
      requestId: "request-a",
    }),
  })
  await settle()
  expect(paths()).toEqual(["serviceAccess.requests", "services.queuePage"])
})

test("a cashier request-tab URL falls back to work without manager-only prefetches", async () => {
  role = "CASHIER"
  await ServicesRoutePage({
    searchParams: Promise.resolve({
      serviceTab: "requests",
      serviceSheet: "request",
    }),
  })
  await settle()
  expect(paths()).toEqual(["services.queuePage"])
})

test("signed-out and unauthorized Finance routes cannot start protected reads", async () => {
  signedIn = false
  await expect(FinanceRoute({ view: "bank" })).rejects.toThrow("redirect:/")
  signedIn = true
  role = "CASHIER"
  await expect(FinanceRoute({ view: "bank" })).rejects.toThrow("redirect:/")
  expect(reads).toEqual([])
})

test("Services admission still precedes optional scheduling", async () => {
  signedIn = false
  await expect(
    ServicesRoutePage({ searchParams: Promise.resolve({}) }),
  ).rejects.toThrow("redirect:/login")
  signedIn = true
  hasStore = false
  await expect(
    ServicesRoutePage({ searchParams: Promise.resolve({}) }),
  ).rejects.toThrow("redirect:/setup")
  expect(reads).toEqual([])
})

test("Services shares typed URL defaults with the client and preserves work filters", async () => {
  await ServicesRoutePage({
    searchParams: Promise.resolve({
      serviceTab: "invalid",
      serviceSheet: "invalid",
      serviceQuery: "  repair  ",
      serviceStage: "doing",
      sort: "priority,asc",
    }),
  })
  await settle()
  expect(paths()).toEqual(["services.queuePage"])
  expect(reads[0]?.input).toEqual({
    assigneeUserId: undefined,
    due: undefined,
    limit: 25,
    priority: undefined,
    query: "repair",
    stage: "doing",
    sort: { field: "priority", direction: "asc" },
    storeId: "store-a",
  })
})

test("Services intake still has its catalog while request links combine with the requests tab", async () => {
  await ServicesRoutePage({
    searchParams: Promise.resolve({ serviceSheet: "intake" }),
  })
  await settle()
  expect(paths()).toEqual(["catalog.listItems", "services.queuePage"])
  client.clear()
  reads.length = 0
  await ServicesRoutePage({
    searchParams: Promise.resolve({
      serviceTab: "requests",
      serviceSheet: "request",
    }),
  })
  await settle()
  expect(paths()).toEqual([
    "catalog.listItems",
    "serviceAccess.requestForms",
    "serviceAccess.requests",
  ])
})

test("Finance overview does not start unselected bank, supplier or expense lists", async () => {
  await FinanceRoute({ view: "overview" })
  await settle()
  expect(paths()).toEqual(["finance.book"])
})
