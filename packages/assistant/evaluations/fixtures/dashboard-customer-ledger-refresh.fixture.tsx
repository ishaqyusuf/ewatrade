import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { DOMImplementation } from "@xmldom/xmldom"
import { type ReactNode, act } from "react"

const document = new DOMImplementation().createDocument(
  "http://www.w3.org/1999/xhtml",
  "html",
  null,
)
const create = document.createElement.bind(document)
document.createElement = (name: string) =>
  Object.assign(create(name), {
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
const storage = new Map<string, string>()
const window = {
  document,
  HTMLElement: class {},
  HTMLIFrameElement: class {},
  addEventListener() {},
  removeEventListener() {},
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value)
    },
    removeItem: (key: string) => {
      storage.delete(key)
    },
  },
}
let lockAvailable = true
const online = {
  userAgent: "isolated-hook-fixture",
  onLine: true,
  locks: {
    request: async (
      _name: string,
      _options: unknown,
      action: (lock: object | null) => unknown,
    ) => action(lockAvailable ? {} : null),
  },
}
Object.assign(document, {
  defaultView: window,
  addEventListener() {},
  removeEventListener() {},
})
Object.assign(globalThis, { document, window, IS_REACT_ACT_ENVIRONMENT: true })
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: online,
})
const { QueryClient, QueryClientProvider, QueryObserver, notifyManager } =
  await import("@tanstack/react-query")
import type { QueryKey } from "@tanstack/react-query"
const { createRoot } = await import("react-dom/client")
const { createTRPCClient, TRPCClientError } = await import("@trpc/client")
const { observable } = await import("@trpc/server/observable")
const { createTRPCOptionsProxy } = await import("@trpc/tanstack-react-query")
notifyManager.setScheduler((callback) => queueMicrotask(callback))
const app = (path: string) =>
  new URL(`../../../../apps/dashboard/src/${path}`, import.meta.url).pathname
let client = new QueryClient()
let status: "COMMITTED" | "NOT_FOUND" = "NOT_FOUND"
let refuseAccounts = false
const customer = {
  id: "customer",
  name: "Private Customer",
  phone: null,
  email: null,
}
const accounts = {
  customer,
  accounts: [
    {
      id: "ledger",
      customerId: "customer",
      currencyCode: "NGN",
      revision: "1",
      snapshotSequence: "7",
      createdAt: new Date("2026-10-01Z"),
    },
  ],
  nextCursor: null,
  coverage: "POSTED_CUSTOMER_LEDGER_ENTRIES",
  completeness: "INCOMPLETE_SOURCE_COVERAGE",
}
const rpc = createTRPCClient<AppRouter>({
  links: [
    () =>
      ({ op }) =>
        observable((observer) => {
          if (op.type !== "query") throw Error("No API commands are permitted")
          if (op.path === "customerLedger.commandStatus")
            observer.next({ result: { data: { status } } })
          else if (op.path === "customerLedger.accounts") {
            if (refuseAccounts) {
              observer.error(
                new TRPCClientError<AppRouter>("Inert refused scope", {
                  result: {
                    error: {
                      code: -32003,
                      message: "Inert refused scope",
                      data: {
                        code: "FORBIDDEN",
                        httpStatus: 403,
                        stack: undefined,
                        ownerSignupBusinessId: undefined,
                        appError: {
                          requestId: undefined,
                          code: "PERMISSION_DENIED",
                          message: "Inert refused scope",
                          referenceId: "inert",
                          retryable: false,
                        },
                      },
                    },
                  },
                }),
              )
              return
            }
            observer.next({ result: { data: accounts } })
          } else if (op.path === "finance.book")
            observer.next({
              result: { data: { id: "book", currencyCode: "NGN" } },
            })
          else throw Error("Only inert recovery/root reads are allowed")
          observer.complete()
        }),
  ],
})
let trpc = createTRPCOptionsProxy<AppRouter>({
  client: rpc,
  queryClient: () => client,
})
mock.module(app("trpc/client"), () => ({ useTRPC: () => trpc }))
const leaf = ({ children }: { children?: ReactNode }) => <div>{children}</div>
mock.module("@ewatrade/ui", () => ({
  Alert: leaf,
  AlertDescription: leaf,
  Button: leaf,
  ControlField: leaf,
  SelectControl: leaf,
}))
mock.module("@hugeicons/react", () => ({ HugeiconsIcon: () => null }))
mock.module("next/link", () => ({ default: leaf }))
mock.module(app("components/customers/customer-form-sheet"), () => ({
  CustomerFormSheet: () => null,
}))
mock.module(app("components/scrollable-content"), () => ({
  ScrollableContent: leaf,
}))
mock.module(
  app("components/customer-ledger/customer-ledger-statement"),
  () => ({
    CustomerLedgerStatement: () => <p>Pinned private statement rows</p>,
  }),
)
mock.module(app("components/customer-ledger/refunds/customer-refunds"), () => ({
  CustomerRefunds: () => null,
}))
mock.module(app("hooks/use-customer-ledger-params"), () => ({
  useCustomerLedgerParams: () => ({
    ledgerAccount: "ledger",
    ledgerAction: null,
    setParams() {},
  }),
}))
mock.module(app("hooks/use-customer-sheet-params"), () => ({
  useCustomerSheetParams: () => ({ openEdit() {} }),
}))
const { useCustomerLedgerCommand } = await import(
  "../../../../apps/dashboard/src/hooks/use-customer-ledger-command"
)
const { CustomerLedgerWorkspace } = await import(
  "../../../../apps/dashboard/src/components/customer-ledger/customer-ledger-workspace"
)
const scope = {
  actorUserId: "actor",
  tenantId: "tenant",
  bookId: "book",
  accountId: "ledger",
}
let command: ReturnType<typeof useCustomerLedgerCommand> | undefined
function Command() {
  command = useCustomerLedgerCommand(scope)
  return null
}
let root: ReturnType<typeof createRoot> | undefined
const host = document.createElement("div")
const stops: Array<() => void> = []
const reads: string[] = []
let held = Promise.withResolvers<void>()
async function flush() {
  await act(async () => {
    await new Promise<void>((resolve) => setImmediate(resolve))
  })
}
async function mount(withWorkspace = false) {
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <QueryClientProvider client={client}>
        <Command />
        {withWorkspace ? (
          <CustomerLedgerWorkspace {...scope} customerId="customer" />
        ) : null}
      </QueryClientProvider>,
    )
  })
  await flush()
  if (!command?.ready) throw Error("Actual command hook did not become ready")
}
function watch(label: string, queryKey: QueryKey, slow = false) {
  client.setQueryData([...queryKey], 1)
  const observer = new QueryObserver(client, {
    queryKey: [...queryKey],
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      reads.push(label)
      if (slow) await held.promise
      return 2
    },
  })
  stops.push(observer.subscribe(() => {}))
  return observer
}
function probes() {
  const live = [
    [
      "latest statement",
      trpc.customerLedger.statement.queryKey({
        accountId: "ledger",
        limit: 30,
      }),
    ],
    [
      "failed snapshot",
      trpc.customerLedger.statement.queryKey({
        accountId: "ledger",
        snapshotSequence: "8",
        limit: 30,
      }),
    ],
    [
      "account detail",
      trpc.customerLedger.accountDetail.queryKey({ accountId: "ledger" }),
    ],
    ["fund sources", trpc.customerLedger.sources.queryKey()],
    ["refund status", trpc.customerLedger.refundRequests.queryKey()],
    ["money balance", trpc.finance.balances.queryKey({ bookId: "book" })],
    ["Order", trpc.orders.get.queryKey({ orderId: "order" })],
    [
      "Order list",
      trpc.orders.listPage.infiniteQueryKey({ storeId: "store", limit: 25 }),
    ],
    [
      "Customer history",
      trpc.customers.getById.queryKey({ customerId: "customer" }),
    ],
    ["Service job", trpc.services.getJob.queryKey({ jobId: "job" })],
    [
      "Service queue",
      trpc.services.queuePage.infiniteQueryKey({ storeId: "store", limit: 25 }),
    ],
  ] as const
  const pinned = [
    [
      "Customer statement",
      trpc.customerLedger.statement.queryKey({
        accountId: "ledger",
        snapshotSequence: "7",
        limit: 30,
      }),
    ],
    [
      "Customer continuation",
      trpc.customerLedger.statement.queryKey({
        accountId: "ledger",
        snapshotSequence: "7",
        afterSequence: "2",
        limit: 30,
      }),
    ],
    [
      "Finance statement",
      trpc.finance.accountActivity.queryKey({
        bookId: "book",
        accountId: "money",
        from: new Date("2026-10-01Z"),
        through: new Date("2026-10-30Z"),
        snapshotSequence: "7",
        limit: 30,
      }),
    ],
  ] as const
  const unchanged = [
    [
      "Customer directory",
      trpc.customers.listPage.infiniteQueryKey({ limit: 25 }),
    ],
    ["Customer count", trpc.customers.count.queryKey()],
    [
      "Service settings",
      trpc.services.getSettings.queryKey({ storeId: "store" }),
    ],
    ["Service assignees", trpc.services.assignees.queryKey()],
  ] as const
  const current = live.map(([name, key]) => watch(name, key))
  client
    .getQueryCache()
    .find({
      queryKey: trpc.customerLedger.statement.queryKey({
        accountId: "ledger",
        snapshotSequence: "8",
        limit: 30,
      }),
      exact: true,
    })
    ?.setState({ status: "error", error: new Error("Inert prior read error") })
  return {
    live: current,
    pinned: pinned.map(([name, key]) => watch(name, key, true)),
    unchanged: unchanged.map(([name, key]) => watch(name, key)),
    names: live.map(([name]) => name).sort(),
  }
}
const payload = {
  amountMinor: "100",
  expectedRevision: "1",
  effectiveAt: new Date("2026-10-01Z"),
  reference: "private-inert-reference",
}
beforeEach(() => {
  storage.clear()
  reads.length = 0
  lockAvailable = true
  online.onLine = true
  status = "NOT_FOUND"
  refuseAccounts = false
  command = undefined
  held = Promise.withResolvers<void>()
  client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false } },
  })
  trpc = createTRPCOptionsProxy<AppRouter>({
    client: rpc,
    queryClient: () => client,
  })
})
afterEach(async () => {
  held.resolve()
  for (const stop of stops.splice(0)) stop()
  if (root) await act(async () => root?.unmount())
  root = undefined
  client.clear()
})

test("real command success finishes without rereading loaded snapshots or unrelated lookup data", async () => {
  await mount()
  const observed = probes()
  let writes = 0
  let outcome: boolean | undefined
  let pending: Promise<unknown> | undefined
  try {
    await act(async () => {
      pending = command
        ?.run("recordReceipt", payload, async () => {
          writes++
        })
        .then((value) => {
          outcome = value
        })
      await new Promise<void>((resolve) => setImmediate(resolve))
    })
    expect(outcome).toBe(true)
    expect(reads.sort()).toEqual(observed.names)
    for (const observer of observed.live)
      expect(observer.getCurrentResult().data).toBe(2)
    for (const observer of [...observed.pinned, ...observed.unchanged])
      expect(observer.getCurrentResult().data).toBe(1)
    expect(writes).toBe(1)
    expect(storage.size).toBe(0)
    expect(command?.saved).toBe(true)
    expect(command?.pending).toBe(false)
    expect(command?.notice).toBe(
      "Recorded. Refresh the statement to see the new snapshot.",
    )
  } finally {
    await act(async () => {
      held.resolve()
      await pending
    })
  }
})

for (const rejected of [false, true])
  test(`actual ${rejected ? "rejected" : "committed"} acknowledgement retains recovery identity and refreshes current facts`, async () => {
    await mount()
    let writes = 0
    await act(async () => {
      await command?.run("recordReceipt", payload, async () => {
        writes++
        throw Object.assign(
          new Error("Inert interrupted response"),
          rejected ? { data: { code: "BAD_REQUEST" } } : {},
        )
      })
    })
    expect(storage.size).toBe(1)
    expect([...storage.values()].join("")).not.toContain(payload.reference)
    const observed = probes()
    status = rejected ? "NOT_FOUND" : "COMMITTED"
    let done = false
    let pending: Promise<unknown> | undefined
    try {
      await act(async () => {
        pending = command?.acknowledge().then(() => {
          done = true
        })
        await new Promise<void>((resolve) => setImmediate(resolve))
      })
      expect(done).toBe(true)
      expect(reads.sort()).toEqual(observed.names)
      expect(writes).toBe(1)
      expect(storage.size).toBe(0)
      expect(command?.saved).toBe(!rejected)
      expect(command?.pending).toBe(false)
      expect(command?.notice).toBe(
        rejected
          ? "Earlier rejection acknowledged. Review corrected details."
          : "Earlier submission recorded; no second entry created.",
      )
    } finally {
      await act(async () => {
        held.resolve()
        await pending
      })
    }
  })

for (const blocked of ["offline", "lock unavailable"] as const)
  test(`${blocked} keeps the real write and refresh paths closed`, async () => {
    await mount()
    const observed = probes()
    if (blocked === "offline") online.onLine = false
    else lockAvailable = false
    let writes = 0
    let result: unknown
    await act(async () => {
      result = await command?.run("recordReceipt", payload, async () => {
        writes++
      })
    })
    expect(result).toBe(false)
    expect(writes).toBe(0)
    expect(reads).toEqual([])
    expect(storage.size).toBe(0)
    for (const observer of [...observed.live, ...observed.pinned])
      expect(observer.getCurrentResult().data).toBe(1)
  })

test("fresh root refusal hides the retained statement at the actual workspace boundary", async () => {
  await mount(true)
  expect(host.textContent).toContain("Pinned private statement rows")
  refuseAccounts = true
  await act(async () => {
    await command?.run("recordReceipt", payload, async () => {})
  })
  expect(host.textContent).not.toContain("Pinned private statement rows")
  expect(host.textContent).toContain("Couldn’t load this customer")
})
