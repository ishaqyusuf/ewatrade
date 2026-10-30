import { afterEach, expect, mock, test } from "bun:test"
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
const createText = document.createTextNode.bind(document)
document.createTextNode = (value: string) => {
  const node = createText(value)
  Object.defineProperty(node, "nodeValue", {
    get: () => node.data,
    set: (next: string) => {
      node.data = next
    },
  })
  return node
}
const window = {
  document,
  HTMLElement: class {},
  HTMLIFrameElement: class {},
  addEventListener() {},
  removeEventListener() {},
  location: {
    origin: "https://example.invalid",
    href: "https://example.invalid/website-requests",
    pathname: "/website-requests",
    search: "",
  },
}
Object.assign(document, {
  defaultView: window,
  addEventListener() {},
  removeEventListener() {},
})
Object.assign(globalThis, {
  window,
  document,
  location: window.location,
  IS_REACT_ACT_ENVIRONMENT: true,
})
const { QueryClientProvider, focusManager, onlineManager } = await import(
  "@tanstack/react-query"
)
const { createRoot } = await import("react-dom/client")
const { NuqsTestingAdapter } = await import("nuqs/adapters/testing")
const { createTRPCClient, TRPCClientError } = await import("@trpc/client")
const { createTRPCOptionsProxy } = await import("@trpc/tanstack-react-query")
const { observable } = await import("@trpc/server/observable")
const realInterval = globalThis.setInterval
const realClear = globalThis.clearInterval
const intervals = new Map<
  ReturnType<typeof setInterval>,
  { delay: number; run: () => void }
>()
globalThis.setInterval = ((
  callback: TimerHandler,
  delay?: number,
  ...args: unknown[]
) => {
  if ((delay !== 5_000 && delay !== 30_000) || typeof callback !== "function")
    return realInterval(callback, delay, ...args)
  const id = realInterval(() => {}, 100_000_000)
  intervals.set(id, { delay, run: () => callback(...args) })
  return id
}) as typeof setInterval
globalThis.clearInterval = ((id: ReturnType<typeof setInterval>) => {
  intervals.delete(id)
  realClear(id)
}) as typeof clearInterval

type Failure =
  | "FORBIDDEN"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "INTERNAL_SERVER_ERROR"
const failures = new Map<string, Failure>()
const calls: Array<{ path: string; input: unknown }> = []
const data: Record<string, unknown> = {
  "storefrontRequests.counts": { orders: 4, services: 7 },
  "storefrontRequests.orders": {
    items: [
      {
        id: "order-a",
        customerName: "Inert private order",
        reference: "INERT-ORDER",
        lineCount: 1,
        fulfilment: "PICKUP",
        createdAt: "2026-10-01T00:00:00Z",
        currencyCode: "NGN",
        confirmedOrder: null,
        observedSubtotalMinor: 1000,
        stage: "received",
      },
    ],
    nextCursor: null,
  },
  "storefrontRequests.services": {
    items: [
      {
        id: "service-a",
        reference: "INERT-SERVICE",
        createdAt: "2026-10-01T00:00:00Z",
        stage: "received",
        serviceRequest: {
          customerName: "Inert private service",
          lines: [{ offering: { catalogItem: { name: "Inert service" } } }],
        },
      },
    ],
    nextCursor: null,
  },
  "serviceCommerce.storeConversationQueue": {
    items: [{ id: "inert-private-conversation" }],
    nextCursor: null,
  },
}
const originalData = { ...data }
const rpc = createTRPCClient<AppRouter>({
  links: [
    () =>
      ({ op }) =>
        observable((observer) => {
          calls.push({ path: op.path, input: op.input })
          if (op.type !== "query" || !(op.path in data)) {
            observer.error(
              new TRPCClientError(
                "Unexpected inert operation; no commands allowed",
              ),
            )
            return
          }
          const code = failures.get(op.path)
          if (code) {
            observer.error(
              new TRPCClientError("Inert read failure", {
                result: {
                  error: {
                    code:
                      code === "UNAUTHORIZED"
                        ? -32001
                        : code === "NOT_FOUND"
                          ? -32004
                          : code === "FORBIDDEN"
                            ? -32003
                            : -32603,
                    message: "Inert read failure",
                    data: {
                      code,
                      httpStatus:
                        code === "UNAUTHORIZED"
                          ? 401
                          : code === "NOT_FOUND"
                            ? 404
                            : code === "FORBIDDEN"
                              ? 403
                              : 500,
                      stack: undefined,
                      ownerSignupBusinessId: undefined,
                      appError: {
                        code:
                          code === "UNAUTHORIZED"
                            ? "AUTHENTICATION_REQUIRED"
                            : code === "NOT_FOUND"
                              ? "NOT_FOUND"
                              : code === "FORBIDDEN"
                                ? "PERMISSION_DENIED"
                                : "UNEXPECTED",
                        message: "Inert read failure",
                        referenceId: "inert-reference",
                        requestId: undefined,
                        retryable: code === "INTERNAL_SERVER_ERROR",
                      },
                    },
                  },
                },
              }),
            )
          } else {
            observer.next({ result: { data: data[op.path] } })
            observer.complete()
          }
        }),
  ],
})
let options: ReturnType<typeof createTRPCOptionsProxy<AppRouter>>
const app = (path: string) =>
  new URL(`../../../../apps/dashboard/src/${path}`, import.meta.url).pathname
mock.module(app("trpc/client"), () => ({ useTRPC: () => options }))
mock.module(app("observability/sentry"), () => ({ captureDashboardError() {} }))
const leaf = ({ children }: { children?: ReactNode }) => <div>{children}</div>
let changeKind: ((kind: string) => void) | undefined
const Tabs = ({
  children,
  value,
  onValueChange,
}: {
  children?: ReactNode
  value: string
  onValueChange: (value: string) => void
}) => {
  if (value === "products" || value === "services") changeKind = onValueChange
  return <div>{children}</div>
}
mock.module("@ewatrade/ui", () => ({
  ...Object.fromEntries(
    [
      "Alert",
      "AlertDescription",
      "AlertTitle",
      "Badge",
      "Button",
      "Checkbox",
      "Dialog",
      "DialogContent",
      "DialogDescription",
      "DialogFooter",
      "DialogHeader",
      "DialogTitle",
      "Field",
      "FieldDescription",
      "FieldError",
      "FieldLabel",
      "Input",
      "Separator",
      "Spinner",
      "Table",
      "TableBody",
      "TableCell",
      "TableHead",
      "TableHeader",
      "TableRow",
      "TabsList",
      "TabsTrigger",
      "Textarea",
    ].map((name) => [name, leaf]),
  ),
  Tabs,
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
  buttonVariants: () => "",
}))
mock.module("next/link", () => ({ default: leaf }))
mock.module("@hugeicons/react", () => ({ HugeiconsIcon: () => null }))
mock.module(app("components/business-banking/customer-message-editor"), () => ({
  CustomerMessageEditor: () => null,
}))
mock.module(app("components/forms/form-feedback"), () => ({
  FormFeedback: leaf,
}))
mock.module(app("components/page-header"), () => ({
  PageHeader: leaf,
  PageToolbar: leaf,
}))
mock.module(app("components/scrollable-content"), () => ({
  ScrollableContent: leaf,
}))
mock.module(app("components/view-switcher"), () => ({
  ViewSwitcher: () => null,
  directoryViewOptions: [],
}))
mock.module(app("hooks/use-directory-view"), () => ({
  useDirectoryView: () => ({
    view: "table",
    setView() {},
    persistenceError: null,
    retryPersistence() {},
  }),
}))
mock.module(app("components/tables/store-conversations/data-table"), () => ({
  StoreConversationDataTable: ({ items }: { items: Array<{ id: string }> }) => (
    <div>{items.map((item) => item.id).join(",")}</div>
  ),
}))
mock.module(app("components/tables/store-conversations/empty-states"), () => ({
  StoreConversationAccessState: () => <div>Access unavailable</div>,
  StoreConversationEmptyState: () => <div>Empty queue</div>,
  StoreConversationErrorState: () => <div>Queue read failed</div>,
}))
mock.module(app("components/tables/store-conversations/skeleton"), () => ({
  StoreConversationTableSkeleton: () => <div>Loading queue</div>,
}))
mock.module(app("components/tables/store-conversations/table-header"), () => ({
  StoreConversationTableHeader: () => null,
}))
const { StorefrontRequestsInbox } = await import(
  "../../../../apps/dashboard/src/components/storefront-requests/storefront-requests-inbox"
)
const { ConversationWorkspace } = await import(
  "../../../../apps/dashboard/src/components/store-conversations/conversation-workspace"
)
const { makeQueryClient } = await import(
  "../../../../apps/dashboard/src/trpc/query-client"
)
const owners = [
  {
    name: "website counts",
    path: "storefrontRequests.counts",
    kind: "products",
    cadence: 30_000,
    visible: " · 4",
  },
  {
    name: "product requests",
    path: "storefrontRequests.orders",
    kind: "products",
    cadence: 30_000,
    visible: "Inert private order",
  },
  {
    name: "service requests",
    path: "storefrontRequests.services",
    kind: "services",
    cadence: 30_000,
    visible: "Inert private service",
  },
  {
    name: "conversation queue",
    path: "serviceCommerce.storeConversationQueue",
    kind: "conversations",
    cadence: 5_000,
    visible: "inert-private-conversation",
  },
] as const
const count = (path: string) =>
  calls.filter((call) => call.path === path).length
const delay = () => new Promise((resolve) => setTimeout(resolve, 5))
async function flush() {
  for (let i = 0; i < 2; i++)
    await act(async () => {
      await delay()
    })
}
async function tick() {
  await act(async () => {
    for (const interval of [...intervals.values()]) interval.run()
    await delay()
  })
  await flush()
}
const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.()
  focusManager.setFocused(true)
  onlineManager.setOnline(true)
  Object.assign(data, originalData)
})
async function mounted(kind: (typeof owners)[number]["kind"]) {
  calls.length = 0
  failures.clear()
  changeKind = undefined
  focusManager.setFocused(true)
  onlineManager.setOnline(true)
  const client = makeQueryClient()
  options = createTRPCOptionsProxy<AppRouter>({
    client: rpc,
    queryClient: client,
  })
  const host = document.createElement("div")
  document.documentElement.appendChild(host)
  const root = createRoot(host as unknown as HTMLElement)
  cleanups.push(async () => {
    await act(async () => root.unmount())
    client.clear()
    document.documentElement.removeChild(host)
  })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <NuqsTestingAdapter
          searchParams={kind === "conversations" ? {} : { kind }}
          hasMemory
        >
          {kind === "conversations" ? (
            <ConversationWorkspace
              activeStoreId="store-a"
              stores={[{ id: "store-a", name: "A" }]}
              timeZone="UTC"
              initialViewSettings={{ scope: "inert", view: null }}
            />
          ) : (
            <StorefrontRequestsInbox timeZone="UTC" />
          )}
        </NuqsTestingAdapter>
      </QueryClientProvider>,
    )
    await delay()
  })
  await flush()
  return { client, host }
}
const target = (path: string) => (query: { queryKey: readonly unknown[] }) =>
  Array.isArray(query.queryKey[0]) && query.queryKey[0].join(".") === path

for (const owner of owners) {
  for (const code of ["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"] as const)
    test(`${owner.name} stops ${code} intervals while current focus recovery stays available`, async () => {
      const { client, host } = await mounted(owner.kind)
      expect(count(owner.path)).toBe(1)
      expect(host.textContent).toContain(owner.visible)
      expect(
        [...intervals.values()].every(
          (interval) => interval.delay === owner.cadence,
        ),
      ).toBe(true)
      failures.set(owner.path, code)
      await act(async () => {
        await client.refetchQueries({ predicate: target(owner.path) })
      })
      await flush()
      expect(
        client
          .getQueryCache()
          .findAll({ predicate: target(owner.path) })
          .every((query) => query.state.data === undefined),
      ).toBe(true)
      expect(host.textContent).not.toContain(owner.visible)
      const failed = count(owner.path)
      await tick()
      expect(count(owner.path)).toBe(failed)
      failures.delete(owner.path)
      await act(async () => {
        focusManager.setFocused(false)
        focusManager.setFocused(true)
        await delay()
      })
      await flush()
      expect(count(owner.path)).toBe(failed + 1)
      expect(host.textContent).toContain(owner.visible)
      expect(
        client
          .getQueryCache()
          .findAll({ predicate: target(owner.path) })
          .every((query) => query.state.data !== undefined),
      ).toBe(true)
      await tick()
      expect(count(owner.path)).toBe(failed + 2)
    })
  test(`${owner.name} keeps interval recovery for transient failures`, async () => {
    await mounted(owner.kind)
    failures.set(owner.path, "INTERNAL_SERVER_ERROR")
    await tick()
    const failed = count(owner.path)
    await tick()
    expect(count(owner.path)).toBe(failed + 1)
    failures.delete(owner.path)
    await tick()
    expect(count(owner.path)).toBe(failed + 2)
  })
  test(`${owner.name} retains background/offline pause and mounted read ownership`, async () => {
    await mounted(owner.kind)
    const initial = count(owner.path)
    await act(async () => focusManager.setFocused(false))
    await tick()
    expect(count(owner.path)).toBe(initial)
    await act(async () => {
      onlineManager.setOnline(false)
      focusManager.setFocused(true)
    })
    await tick()
    expect(count(owner.path)).toBe(initial)
    await act(async () => {
      onlineManager.setOnline(true)
      await delay()
    })
    await flush()
    expect(count(owner.path)).toBe(initial + 1)
    await tick()
    expect(count(owner.path)).toBe(initial + 2)
  })
  test(`${owner.name} allows current invalidation after a known refusal`, async () => {
    const { client } = await mounted(owner.kind)
    failures.set(owner.path, "FORBIDDEN")
    await act(async () => {
      await client.refetchQueries({ predicate: target(owner.path) })
    })
    await flush()
    const failed = count(owner.path)
    failures.delete(owner.path)
    await act(async () => {
      await client.invalidateQueries({ predicate: target(owner.path) })
    })
    await flush()
    expect(count(owner.path)).toBe(failed + 1)
    await tick()
    expect(count(owner.path)).toBe(failed + 2)
  })
  test(`${owner.name} retains healthy polling when its queue or badge is empty`, async () => {
    data[owner.path] =
      owner.path === "storefrontRequests.counts"
        ? { orders: 0, services: 0 }
        : { items: [], nextCursor: null }
    await mounted(owner.kind)
    expect(count(owner.path)).toBe(1)
    await tick()
    expect(count(owner.path)).toBe(2)
  })
}

test("website tabs mount only one list and returning retains a fresh mount read", async () => {
  await mounted("products")
  expect(count("storefrontRequests.counts")).toBe(1)
  expect(count("storefrontRequests.orders")).toBe(1)
  expect(count("storefrontRequests.services")).toBe(0)
  await act(async () => {
    changeKind?.("services")
    await delay()
  })
  await flush()
  expect(count("storefrontRequests.services")).toBe(1)
  const oldOrders = count("storefrontRequests.orders")
  await tick()
  expect(count("storefrontRequests.orders")).toBe(oldOrders)
  await act(async () => {
    changeKind?.("products")
    await delay()
  })
  await flush()
  expect(count("storefrontRequests.orders")).toBe(oldOrders + 1)
  const oldServices = count("storefrontRequests.services")
  await tick()
  expect(count("storefrontRequests.services")).toBe(oldServices)
})

for (const kind of ["products", "services"] as const) {
  test(`${kind} tab obtains a fresh current read after a refused prior visit`, async () => {
    const path =
      kind === "products"
        ? "storefrontRequests.orders"
        : "storefrontRequests.services"
    const { client, host } = await mounted(kind)
    failures.set(path, "FORBIDDEN")
    await act(async () => {
      await client.refetchQueries({ predicate: target(path) })
    })
    await flush()
    const refused = count(path)
    await act(async () => {
      changeKind?.(kind === "products" ? "services" : "products")
      await delay()
    })
    await flush()
    expect(
      client
        .getQueryCache()
        .findAll({ predicate: target(path) })
        .every((query) => query.getObserversCount() === 0),
    ).toBe(true)
    await tick()
    expect(count(path)).toBe(refused)
    failures.delete(path)
    await act(async () => {
      changeKind?.(kind)
      await delay()
    })
    await flush()
    expect(count(path)).toBe(refused + 1)
    expect(host.textContent).toContain(
      kind === "products" ? "Inert private order" : "Inert private service",
    )
  })
}
