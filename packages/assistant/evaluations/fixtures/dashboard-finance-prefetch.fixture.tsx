import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { DOMImplementation } from "@xmldom/xmldom"
import { type ReactNode, Suspense, act } from "react"

const doc = new DOMImplementation().createDocument(
  "http://www.w3.org/1999/xhtml",
  "html",
  null,
)
const create = doc.createElement.bind(doc)
doc.createElement = (name: string) =>
  Object.assign(create(name), {
    style: {},
    addEventListener() {},
    removeEventListener() {},
  })
const createText = doc.createTextNode.bind(doc)
doc.createTextNode = (value: string) => {
  const node = createText(value)
  Object.defineProperty(node, "nodeValue", {
    get: () => node.data,
    set: (next: string) => {
      node.data = next
    },
  })
  return node
}
const win = {
  document: doc,
  HTMLElement: class {},
  HTMLIFrameElement: class {},
  addEventListener() {},
  removeEventListener() {},
  location: {
    origin: "https://inert.invalid",
    href: "https://inert.invalid/finance",
    pathname: "/finance",
    search: "",
  },
}
Object.assign(doc, {
  defaultView: win,
  addEventListener() {},
  removeEventListener() {},
})
Object.assign(globalThis, {
  document: doc,
  window: win,
  location: win.location,
  IS_REACT_ACT_ENVIRONMENT: true,
})
const { QueryClientProvider, notifyManager, focusManager } = await import(
  "@tanstack/react-query"
)
const { createRoot } = await import("react-dom/client")
const { NuqsTestingAdapter } = await import("nuqs/adapters/testing")
const { createTRPCClient, TRPCClientError } = await import("@trpc/client")
const { observable } = await import("@trpc/server/observable")
const { createTRPCOptionsProxy } = await import("@trpc/tanstack-react-query")
notifyManager.setScheduler((callback) => queueMicrotask(callback))
focusManager.setFocused(true)
const app = (path: string) =>
  new URL(`../../../../apps/dashboard/src/${path}`, import.meta.url).pathname
const leaf = ({ children }: { children?: ReactNode }) => <div>{children}</div>
mock.module("@ewatrade/ui", () => ({
  Button: leaf,
  Skeleton: () => <div data-skeleton="true" />,
}))
mock.module("server-only", () => ({}))
mock.module(app("observability/sentry"), () => ({ captureDashboardError() {} }))
mock.module(app("components/dashboard/page-loading"), () => ({
  PageLoading: () => <div>Route loading</div>,
}))
mock.module(app("components/dashboard/workspace-error"), () => ({
  WorkspaceError: () => <div>Workspace error</div>,
}))
mock.module(app("components/scrollable-content"), () => ({
  ScrollableContent: leaf,
}))
mock.module(app("components/tables/core"), () => ({
  TableToolbarSlotProvider: leaf,
}))
mock.module(app("components/orders/overview/order-overview-parts"), () => ({
  Pill: leaf,
}))
mock.module(app("components/tables/finance-accounts/data-table"), () => ({
  moneyAccountPurposeLabel: (purpose: string) => purpose,
}))
// Inert unrelated routes/presentation. Actual FinanceRoute, FinanceWorkspace,
// FinanceOverview, URL hook, tRPC options and QueryClient/hydration run unchanged.
for (const [path, name] of [
  ["components/tables/expenses/skeleton", "ExpenseTableSkeleton"],
  [
    "components/tables/finance-bank-statements/skeleton",
    "FinanceBankStatementTableSkeleton",
  ],
  [
    "components/tables/finance-suppliers/skeleton",
    "FinanceSupplierTableSkeleton",
  ],
  [
    "components/tables/finance-suppliers/data-table",
    "FinanceSupplierDataTable",
  ],
  ["components/tables/expenses/data-table", "ExpenseDataTable"],
  ["components/finance/bank-statements", "FinanceBankStatements"],
  ["components/finance/cash-count-history", "FinanceCashCountHistory"],
  ["components/finance/finance-accounts", "FinanceAccounts"],
  ["components/finance/finance-directory-view", "FinanceDirectoryView"],
  ["components/finance/finance-header", "FinanceHeader"],
  ["components/finance/finance-reports", "FinanceReports"],
  ["components/finance/setup-form", "FinanceSetupForm"],
] as const)
  mock.module(app(path), () => ({ [name]: leaf, financeRowViewOptions: [] }))
mock.module("next/dist/client/components/error-boundary", () => ({
  ErrorBoundary: leaf,
}))
mock.module("next/link", () => ({
  default: ({ children, href }: { children?: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))
mock.module("next/navigation", () => ({
  redirect: (path: string) => {
    throw Error(`redirect:${path}`)
  },
  useRouter: () => ({ push() {} }),
}))
let signedIn = true
let permitted = true
let tenantCurrency = "NGN"
let resolvedBookId = "book-a"
const currentData: Record<string, unknown> = {}
const currentFailures = new Map<string, "NOT_FOUND" | "FORBIDDEN">()
const cancellations: string[] = []
const tenantId = "tenant-a"
let requestHeaders = new Headers({ "x-ewatrade-request-kind": "document" })
mock.module("next/headers", () => ({ headers: async () => requestHeaders }))
mock.module(app("lib/session"), () => ({
  getServerSession: async () => (signedIn ? { user: { id: "actor" } } : null),
}))
mock.module(app("lib/tenant"), () => ({
  getActiveTenant: async () =>
    permitted
      ? {
          tenant: { id: tenantId, currencyCode: tenantCurrency },
          membership: { role: "OWNER" },
        }
      : null,
}))
mock.module(app("utils/columns"), () => ({
  getInitialTableSettings: async () => undefined,
}))
mock.module(app("utils/directory-views"), () => ({
  getInitialDirectoryView: async () => ({ scope: "inert", view: null }),
}))
const initialData: Record<string, unknown> = {
  "finance.book": {
    id: "book-a",
    currencyCode: "NGN",
    timezone: "UTC",
    startsAt: new Date("2026-01-01Z"),
    lastSequence: "1",
    accounts: [],
  },
  "finance.balances": {
    accounts: [
      {
        id: "cash",
        name: "Inert cash",
        purpose: "CASH",
        archivedAt: null,
        mobileMoney: false,
        paymentsPausedAt: null,
        balanceMinor: "10000",
      },
    ],
  },
  "finance.owedSummary": {
    currencyCode: "NGN",
    customers: {
      count: 1,
      owedMinor: "12000",
      top: [{ id: "customer", name: "Inert customer", owedMinor: "12000" }],
    },
    suppliers: { count: 0, owedMinor: "0", top: [] },
  },
  "finance.bills": {
    items: [
      {
        id: "bill",
        description: "Inert spending",
        payeeName: "Inert supplier",
        incurredAt: new Date("2026-01-01Z"),
        totalMinor: "2000",
        status: "UNPAID",
      },
    ],
    nextCursor: null,
  },
  "finance.bankStatements.list": { items: [], nextCursor: null },
  "finance.supplierDirectory": { items: [], nextCursor: null },
}
let data = { ...initialData }
let failure: string | null = null
const gates = new Map<
  string,
  ReturnType<typeof Promise.withResolvers<unknown>>
>()
const calls: { path: string; input: unknown }[] = []
const rpc = createTRPCClient<AppRouter>({
  links: [
    () =>
      ({ op }) =>
        observable((observer) => {
          calls.push({ path: op.path, input: op.input })
          if (op.type !== "query" || !(op.path in data)) {
            observer.error(
              new TRPCClientError("Unexpected inert operation; no commands"),
            )
            return
          }
          const current =
            op.input &&
            typeof op.input === "object" &&
            "currentCurrency" in op.input
          const onAbort = () => {
            cancellations.push(op.path)
            observer.error(new TRPCClientError("Inert read cancelled"))
          }
          op.signal?.addEventListener("abort", onAbort, { once: true })
          void Promise.resolve(gates.get(op.path)?.promise).then(() => {
            if (op.signal?.aborted) return
            const refusal =
              failure === op.path
                ? "FORBIDDEN"
                : current
                  ? currentFailures.get(op.path)
                  : undefined
            if (refusal) {
              observer.error(
                new TRPCClientError("Inert refusal", {
                  result: {
                    error: {
                      code: refusal === "NOT_FOUND" ? -32004 : -32003,
                      message: "Inert refusal",
                      data: {
                        code: refusal,
                        httpStatus: refusal === "NOT_FOUND" ? 404 : 403,
                        stack: undefined,
                        ownerSignupBusinessId: undefined,
                        appError: {
                          requestId: undefined,
                          code: "PERMISSION_DENIED",
                          message: "Inert refusal",
                          referenceId: "inert",
                          retryable: false,
                        },
                      },
                    },
                  },
                }),
              )
            } else {
              const value = currentData[op.path] ?? data[op.path]
              observer.next({
                result: {
                  data: current
                    ? { ...(value as object), resolvedBookId }
                    : data[op.path],
                },
              })
              observer.complete()
            }
          })
          return () => op.signal?.removeEventListener("abort", onAbort)
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
  getQueryClient: () => server,
  getServerClient: () => rpc,
  get trpc() {
    return serverOptions
  },
}))
mock.module(app("trpc/client"), () => ({ useTRPC: () => browserOptions }))
const { FinanceRoute } = await import(
  "../../../../apps/dashboard/src/components/finance/finance-route"
)
const roots: ReturnType<typeof createRoot>[] = []
const hosts: Node[] = []
const turn = () => new Promise<void>((resolve) => setImmediate(resolve))
async function flush() {
  for (let i = 0; i < 5; i++)
    await act(async () => {
      await turn()
    })
}
async function mount(element: ReactNode) {
  const host = doc.createElement("div")
  doc.documentElement.appendChild(host)
  const root = createRoot(host as unknown as HTMLElement)
  roots.push(root)
  hosts.push(host as unknown as Node)
  await act(async () =>
    root.render(
      <QueryClientProvider client={browser}>
        <NuqsTestingAdapter searchParams={{}}>
          <Suspense fallback={<div>Loading book</div>}>{element}</Suspense>
        </NuqsTestingAdapter>
      </QueryClientProvider>,
    ),
  )
  await flush()
  return { root, host, text: () => host.textContent ?? "" }
}
beforeEach(() => {
  signedIn = permitted = true
  requestHeaders = new Headers({ "x-ewatrade-request-kind": "document" })
  failure = null
  tenantCurrency = "NGN"
  resolvedBookId = "book-a"
  currentFailures.clear()
  cancellations.length = 0
  for (const key of Object.keys(currentData)) delete currentData[key]
  data = { ...initialData }
  calls.length = 0
  gates.clear()
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
afterEach(async () => {
  for (const gate of gates.values()) gate.resolve(undefined)
  await act(async () => {
    for (const root of roots) root.unmount()
  })
  roots.length = 0
  for (const host of hosts) host.parentNode?.removeChild(host)
  hosts.length = 0
  server.clear()
  browser.clear()
})

test("document panels start while Book metadata is pending, without waiting for its identifier", async () => {
  const gate = Promise.withResolvers<unknown>()
  gates.set("finance.book", gate)
  const pending = FinanceRoute({ view: "overview" })
  await turn()
  await turn()
  const started = calls.map((call) => call.path).sort()
  gate.resolve(undefined)
  await pending
  expect(started).toEqual(["finance.book", ...panels].sort())
})

test("Finance Overview starts only its three real panel reads before hydration, and consumers do not read twice", async () => {
  const page = await FinanceRoute({ view: "overview" })
  await turn()
  expect(calls.map((call) => call.path).sort()).toEqual(
    [
      "finance.book",
      "finance.balances",
      "finance.owedSummary",
      "finance.bills",
    ].sort(),
  )
  const before = [...calls]
  const view = await mount(page)
  expect(view.text()).toContain("Inert cash")
  expect(view.text()).toContain("Inert customer")
  expect(view.text()).toContain("Inert spending")
  expect(calls).toEqual(before)
  expect(calls.find((call) => call.path === "finance.bills")?.input).toEqual({
    currentCurrency: "NGN",
    limit: 5,
  })
})

const panels = ["finance.balances", "finance.owedSummary", "finance.bills"]

test("pending panels start together without holding the route and settle independently after hydration", async () => {
  for (const path of panels) gates.set(path, Promise.withResolvers<unknown>())
  let returned = false
  const result = FinanceRoute({ view: "overview" }).then((page) => {
    returned = true
    return page
  })
  await turn()
  await turn()
  expect(returned).toBe(true)
  expect(calls.map((call) => call.path).sort()).toEqual(
    ["finance.book", ...panels].sort(),
  )
  expect(
    server
      .getQueryCache()
      .getAll()
      .filter((query) => query.state.status === "pending"),
  ).toHaveLength(3)
  const view = await mount(await result)
  expect(view.text()).toContain("Money accounts")
  expect(view.text()).not.toContain("Inert cash")
  gates.get("finance.balances")?.resolve(undefined)
  await flush()
  expect(view.text()).toContain("Inert cash")
  expect(view.text()).not.toContain("Inert customer")
  expect(view.text()).not.toContain("Inert spending")
  gates.get("finance.bills")?.resolve(undefined)
  await flush()
  expect(view.text()).toContain("Inert spending")
  expect(view.text()).not.toContain("Inert customer")
  gates.get("finance.owedSummary")?.resolve(undefined)
  await flush()
  expect(view.text()).toContain("Inert customer")
  expect(calls).toHaveLength(4)
})

test("Book admission still controls hydration and cancels unused reads when missing or refused", async () => {
  gates.set("finance.book", Promise.withResolvers<unknown>())
  const pending = FinanceRoute({ view: "overview" })
  await turn()
  expect(calls.map((call) => call.path).sort()).toEqual(
    ["finance.book", ...panels].sort(),
  )
  data["finance.book"] = null
  gates.get("finance.book")?.resolve(undefined)
  const view = await mount(await pending)
  expect(calls).toHaveLength(4)
  expect(view.text()).not.toContain("Money accounts")
  expect(view.text()).not.toContain("Inert cash")
  expect(
    server
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey),
  ).toEqual([serverOptions.finance.book.queryKey()])
  server.clear()
  failure = "finance.book"
  await expect(FinanceRoute({ view: "overview" })).rejects.toBeInstanceOf(
    TRPCClientError,
  )
  expect(calls.filter((call) => call.path === "finance.book")).toHaveLength(2)
  expect(server.getQueryCache().getAll()).toHaveLength(1)
})

test("route authentication and role admission refuse before any Finance read", async () => {
  signedIn = false
  await expect(FinanceRoute({ view: "overview" })).rejects.toThrow("redirect:/")
  signedIn = true
  permitted = false
  await expect(FinanceRoute({ view: "overview" })).rejects.toThrow("redirect:/")
  expect(calls).toEqual([])
})

for (const view of [
  "accounts",
  "reports",
  "spending",
  "suppliers",
  "bank",
] as const) {
  test(`Finance ${view} retains its own prefetch without unused Overview work`, async () => {
    await FinanceRoute({ view, searchParams: Promise.resolve({}) })
    await turn()
    expect(
      calls.some(
        (call) =>
          call.path === "finance.balances" ||
          call.path === "finance.owedSummary",
      ),
    ).toBe(false)
    const expected =
      view === "spending"
        ? "finance.bills"
        : view === "suppliers"
          ? "finance.supplierDirectory"
          : view === "bank"
            ? "finance.bankStatements.list"
            : null
    expect(calls.map((call) => call.path)).toEqual(
      expected ? ["finance.book", expected] : ["finance.book"],
    )
    if (expected)
      expect(calls[1]?.input).toMatchObject({ bookId: "book-a", limit: 30 })
  })
}

test("pending Book-B balances cannot consume a retained Book-A query", async () => {
  resolvedBookId = "book-b"
  data["finance.book"] = {
    ...(initialData["finance.book"] as object),
    id: "book-b",
  }
  browser.setQueryData(
    browserOptions.finance.balances.queryKey({ bookId: "book-a" }),
    {
      snapshotSequence: "1",
      currencyCode: "NGN",
      startsAt: new Date("2026-01-01Z"),
      monthStart: new Date("2026-01-01Z"),
      accounts: [
        {
          id: "private-a",
          bookId: "book-a",
          code: "1000",
          kind: "ASSET",
          createdAt: new Date("2026-01-01Z"),
          paymentMethods: [],
          paymentsPausedAt: null,
          mobileMoney: false,
          bankName: null,
          bankAccountNumber: null,
          bankAccountHolder: null,
          debitMinor: "999",
          creditMinor: "0",
          monthDebitMinor: "999",
          monthCreditMinor: "0",
          name: "Private A cash",
          purpose: "CASH",
          archivedAt: null,
          balanceMinor: "999",
        },
      ],
    },
  )
  gates.set("finance.balances", Promise.withResolvers<unknown>())
  const page = await FinanceRoute({ view: "overview" })
  const view = await mount(page)
  expect(view.text()).not.toContain("Private A cash")
  expect(view.text()).not.toContain("Inert cash")
  gates.get("finance.balances")?.resolve(undefined)
  await flush()
  expect(view.text()).toContain("Inert cash")
  expect(view.text()).not.toContain("Private A cash")
  for (const call of calls.filter((call) => panels.includes(call.path)))
    expect(call.input).toMatchObject({ currentCurrency: "NGN" })
  expect(calls).toHaveLength(4)
})

const { useFinanceInvalidation } = await import(
  "../../../../apps/dashboard/src/hooks/use-finance-invalidation"
)
let invalidate: (() => Promise<void>) | undefined
function InvalidationOwner() {
  invalidate = useFinanceInvalidation()
  return null
}

test("the canonical invalidation still refreshes all four active projections and erases a refused panel", async () => {
  const view = await mount(
    <>
      <InvalidationOwner />
      {await FinanceRoute({ view: "overview" })}
    </>,
  )
  expect(view.text()).toContain("Inert customer")
  expect(calls).toHaveLength(4)
  failure = "finance.owedSummary"
  await act(async () => {
    await invalidate?.()
  })
  await flush()
  expect(calls).toHaveLength(8)
  expect(view.text()).not.toContain("Inert customer")
  expect(view.text()).toContain("We couldn't load this. Try again.")
  expect(view.text()).toContain("Inert cash")
  expect(view.text()).toContain("Inert spending")
  expect(
    browser.getQueryData(
      browserOptions.finance.owedSummary.queryKey({ bookId: "book-a" }),
    ),
  ).toBeUndefined()
})

test("an initial refused panel remains local while the other prefetched panels display", async () => {
  failure = "finance.owedSummary"
  const page = await FinanceRoute({ view: "overview" })
  await turn()
  const view = await mount(page)
  // A pending server rejection is redacted by TanStack. Its one normal retry
  // reaches the current 403; do not replace production retry/error semantics.
  const deadline = Date.now() + 2000
  while (
    !view.text().includes("We couldn't load this. Try again.") &&
    Date.now() < deadline
  )
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  expect(view.text()).toContain("Inert cash")
  expect(view.text()).toContain("Inert spending")
  expect(view.text()).not.toContain("Inert customer")
  expect(view.text()).toContain("We couldn't load this. Try again.")
  expect(calls.filter((call) => call.path === "finance.balances")).toHaveLength(
    1,
  )
  expect(calls.filter((call) => call.path === "finance.bills")).toHaveLength(1)
  expect(
    calls.filter((call) => call.path === "finance.owedSummary"),
  ).toHaveLength(2)
})

test("a warm soft return preserves retained panels without three redundant server reads", async () => {
  await mount(await FinanceRoute({ view: "overview" }))
  expect(calls).toHaveLength(4)
  server.clear()
  server = makeQueryClient()
  serverOptions = createTRPCOptionsProxy<AppRouter>({
    client: rpc,
    queryClient: server,
  })
  requestHeaders = new Headers({ "x-ewatrade-request-kind": "navigation" })
  const page = await FinanceRoute({ view: "overview" })
  expect(calls.map((call) => call.path)).toEqual([
    "finance.book",
    ...panels,
    "finance.book",
  ])
  const before = [...calls]
  const view = await mount(page)
  expect(view.text()).toContain("Inert cash")
  expect(view.text()).toContain("Inert customer")
  expect(view.text()).toContain("Inert spending")
  expect(calls).toEqual(before)
})

test("a cold soft visit keeps its original browser-owned panel reads", async () => {
  requestHeaders = new Headers({ "x-ewatrade-request-kind": "navigation" })
  const page = await FinanceRoute({ view: "overview" })
  expect(calls.map((call) => call.path)).toEqual(["finance.book"])
  const view = await mount(page)
  expect(calls.map((call) => call.path).sort()).toEqual(
    ["finance.book", ...panels].sort(),
  )
  expect(view.text()).toContain("Inert cash")
  expect(view.text()).toContain("Inert spending")
})

test("missing document marker falls back to browser ownership", async () => {
  requestHeaders = new Headers()
  const page = await FinanceRoute({ view: "overview" })
  expect(calls.map((call) => call.path)).toEqual(["finance.book"])
  const view = await mount(page)
  expect(view.text()).toContain("Inert cash")
  expect(calls).toHaveLength(4)
})

for (const refused of [false, true]) {
  test(`unused pending current-book reads cancel when Book is ${refused ? "refused" : "missing"}`, async () => {
    for (const path of panels) gates.set(path, Promise.withResolvers<unknown>())
    if (refused) failure = "finance.book"
    else data["finance.book"] = null
    const route = FinanceRoute({ view: "overview" })
    if (refused) await expect(route).rejects.toBeInstanceOf(TRPCClientError)
    else await route
    await turn()
    expect(cancellations.sort()).toEqual([...panels].sort())
    expect(server.getQueryCache().getAll()).toHaveLength(1)
    expect(
      server.getQueryData(
        serverOptions.finance.balances.queryKey({ bookId: "book-a" }),
      ),
    ).toBeUndefined()
  })
}

test("same-currency Book identity mismatch cannot hydrate early results into another Book's cache", async () => {
  data["finance.book"] = {
    ...(initialData["finance.book"] as object),
    id: "book-b",
  }
  currentData["finance.balances"] = {
    accounts: [
      {
        id: "old",
        name: "Private A cash",
        purpose: "CASH",
        balanceMinor: "999",
      },
    ],
  }
  currentData["finance.owedSummary"] = {
    ...(initialData["finance.owedSummary"] as object),
    privateSentinel: "Private A debt",
  }
  currentData["finance.bills"] = {
    items: [{ description: "Private A spending" }],
  }
  const view = await mount(await FinanceRoute({ view: "overview" }))
  expect(view.text()).toContain("Inert cash")
  expect(view.text()).toContain("Inert customer")
  expect(view.text()).toContain("Inert spending")
  expect(view.text()).not.toContain("Private A")
  expect(
    JSON.stringify(
      server
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data),
    ),
  ).not.toContain("Private A")
  expect(server.getQueryCache().getAll()).toHaveLength(4)
  expect(
    calls
      .filter(
        (call) =>
          panels.includes(call.path) &&
          call.input &&
          typeof call.input === "object" &&
          "bookId" in call.input,
      )
      .map((call) => call.input),
  ).toEqual([
    { bookId: "book-b" },
    { bookId: "book-b" },
    { bookId: "book-b", limit: 5 },
  ])
  expect(calls).toHaveLength(7)
})

test("a current-currency race retries only the admitted Book identity without changing cache ownership", async () => {
  data["finance.book"] = {
    ...(initialData["finance.book"] as object),
    id: "book-b",
    currencyCode: "USD",
  }
  for (const path of panels) currentFailures.set(path, "NOT_FOUND")
  const view = await mount(await FinanceRoute({ view: "overview" }))
  expect(view.text()).toContain("Inert cash")
  expect(view.text()).toContain("Inert customer")
  expect(view.text()).toContain("Inert spending")
  expect(calls).toHaveLength(7)
  expect(
    server.getQueryData(
      serverOptions.finance.balances.queryKey({ bookId: "book-a" }),
    ),
  ).toBeUndefined()
  expect(
    server.getQueryData(
      serverOptions.finance.balances.queryKey({ bookId: "book-b" }),
    ),
  ).toBeDefined()
})
