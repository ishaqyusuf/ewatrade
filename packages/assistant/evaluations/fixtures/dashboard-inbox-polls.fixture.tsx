import { afterEach, expect, mock, setSystemTime, test } from "bun:test"
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
const windowListeners = new Map<string, Set<() => void>>()
const window = {
  document,
  navigator: { userAgent: "isolated-hook-fixture" },
  HTMLElement: class {},
  HTMLIFrameElement: class {},
  addEventListener(type: string, listener: () => void) {
    const set = windowListeners.get(type) ?? new Set()
    set.add(listener)
    windowListeners.set(type, set)
  },
  removeEventListener(type: string, listener: () => void) {
    windowListeners.get(type)?.delete(listener)
  },
  location: {
    origin: "https://example.invalid",
    href: "https://example.invalid/website-requests",
    pathname: "/website-requests",
    search: "",
  },
}
Object.assign(document, {
  defaultView: window,
  visibilityState: "visible",
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
  // Every timed read on these screens is a one-minute check.
  if (delay !== 60_000 || typeof callback !== "function")
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
  "storefrontRequests.counts": { orders: 4, services: 7, total: 11 },
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
      "Sheet",
      "Skeleton",
      "Spinner",
      "Textarea",
    ].map((name) => [name, leaf]),
  ),
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
  buttonVariants: () => "",
}))
mock.module("next/link", () => ({ default: leaf }))
mock.module("@hugeicons/react", () => ({ HugeiconsIcon: () => null }))
mock.module(app("components/business-banking/customer-message-editor"), () => ({
  CustomerMessageEditor: () => null,
}))
mock.module(app("components/forms/confirm-alert"), () => ({
  ConfirmAlert: () => null,
}))
mock.module(app("components/forms/form-feedback"), () => ({
  FormFeedback: leaf,
}))
mock.module(app("components/inventory/filter-pills"), () => ({
  FilterPills: () => null,
}))
mock.module(app("components/sheets/sheet-frame"), () => ({
  SheetFrame: leaf,
}))
mock.module(app("components/scrollable-content"), () => ({
  ScrollableContent: leaf,
}))
mock.module(app("components/store-conversations/conversation-inbox"), () => ({
  ConversationInboxList: ({ items }: { items: Array<{ id: string }> }) => (
    <div>{items.map((item) => item.id).join(",")}</div>
  ),
  ConversationInboxSkeleton: () => <div>Loading queue</div>,
  InboxFilterPills: () => null,
  inboxFilterOf: () => "all",
  inboxFilterParams: () => ({}),
}))
mock.module(app("components/tables/store-conversations/empty-states"), () => ({
  StoreConversationAccessState: () => <div>Access unavailable</div>,
  StoreConversationEmptyState: () => <div>Empty queue</div>,
  StoreConversationErrorState: () => <div>Queue read failed</div>,
}))
const { StorefrontRequestsInbox } = await import(
  "../../../../apps/dashboard/src/components/storefront-requests/storefront-requests-inbox"
)
const { ConversationWorkspace } = await import(
  "../../../../apps/dashboard/src/components/store-conversations/conversation-workspace"
)
const { setLastUserInputAtForTest } = await import(
  "../../../../apps/dashboard/src/lib/bounded-refresh"
)
const { makeQueryClient } = await import(
  "../../../../apps/dashboard/src/trpc/query-client"
)
type Kind = "products" | "services" | "conversations"
/**
 * Documented cadences: the website request counts check once a minute for
 * ten minutes after load or focus (the lists never poll; a changed count
 * refreshes them); the conversation queue checks once a minute while the
 * page is in use and stops after 15 idle minutes (lib/bounded-refresh).
 */
const polled = [
  {
    name: "website counts",
    path: "storefrontRequests.counts",
    kind: "products",
    visible: " · 4",
  },
  {
    name: "conversation queue",
    path: "serviceCommerce.storeConversationQueue",
    kind: "conversations",
    visible: "inert-private-conversation",
  },
] as const
const lists = [
  {
    name: "product requests",
    path: "storefrontRequests.orders",
    kind: "products",
    other: "storefrontRequests.services",
    visible: "Inert private order",
  },
  {
    name: "service requests",
    path: "storefrontRequests.services",
    kind: "services",
    other: "storefrontRequests.orders",
    visible: "Inert private service",
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
async function focus() {
  await act(async () => {
    for (const listener of windowListeners.get("focus") ?? []) listener()
    focusManager.setFocused(false)
    focusManager.setFocused(true)
    await delay()
  })
  await flush()
}
async function tap() {
  await act(async () => {
    for (const listener of windowListeners.get("pointerdown") ?? []) listener()
    await delay()
  })
  await flush()
}
const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.()
  setSystemTime()
  focusManager.setFocused(true)
  onlineManager.setOnline(true)
  Object.assign(data, originalData)
})
async function mounted(kind: Kind) {
  calls.length = 0
  failures.clear()
  setLastUserInputAtForTest(Date.now())
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
          searchParams={kind === "services" ? { kind } : {}}
          hasMemory
        >
          {kind === "conversations" ? (
            <ConversationWorkspace activeStoreId="store-a" timeZone="UTC" />
          ) : (
            <StorefrontRequestsInbox canManage timeZone="UTC" />
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
const cached = (
  client: ReturnType<typeof makeQueryClient>,
  path: string,
  present: boolean,
) =>
  client
    .getQueryCache()
    .findAll({ predicate: target(path) })
    .every((query) => (query.state.data !== undefined) === present)

for (const owner of polled) {
  for (const code of ["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"] as const)
    test(`${owner.name} stops ${code} checks while focus recovery stays available`, async () => {
      const { client, host } = await mounted(owner.kind)
      expect(count(owner.path)).toBe(1)
      expect(host.textContent).toContain(owner.visible)
      expect(intervals.size).toBe(1)
      failures.set(owner.path, code)
      await act(async () => {
        await client.refetchQueries({ predicate: target(owner.path) })
      })
      await flush()
      expect(cached(client, owner.path, false)).toBe(true)
      expect(host.textContent).not.toContain(owner.visible)
      const failed = count(owner.path)
      await tick()
      expect(count(owner.path)).toBe(failed)
      failures.delete(owner.path)
      await focus()
      expect(count(owner.path)).toBe(failed + 1)
      expect(host.textContent).toContain(owner.visible)
      expect(cached(client, owner.path, true)).toBe(true)
      await tick()
      expect(count(owner.path)).toBe(failed + 2)
    })
  test(`${owner.name} keeps checking through transient failures`, async () => {
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
  test(`${owner.name} pauses in the background and offline`, async () => {
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
  test(`${owner.name} reads again on invalidation after a refusal`, async () => {
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
  test(`${owner.name} keeps checking when its queue or badge is empty`, async () => {
    data[owner.path] =
      owner.path === "storefrontRequests.counts"
        ? { orders: 0, services: 0, total: 0 }
        : { items: [], nextCursor: null }
    await mounted(owner.kind)
    expect(count(owner.path)).toBe(1)
    await tick()
    expect(count(owner.path)).toBe(2)
  })
}

test("website counts stop ten minutes after load and restart on focus", async () => {
  await mounted("products")
  const path = "storefrontRequests.counts"
  setSystemTime(new Date(Date.now() + 10 * 60_000 + 1_000))
  await tick()
  const last = count(path)
  expect(intervals.size).toBe(0)
  await tick()
  expect(count(path)).toBe(last)
  await focus()
  expect(count(path)).toBe(last + 1)
  expect(intervals.size).toBe(1)
  await tick()
  expect(count(path)).toBe(last + 2)
})

test("conversation queue stops after 15 idle minutes and the next tap restarts it", async () => {
  await mounted("conversations")
  const path = "serviceCommerce.storeConversationQueue"
  setLastUserInputAtForTest(Date.now() - 15 * 60_000 - 1_000)
  await tick()
  const last = count(path)
  expect(intervals.size).toBe(0)
  await tick()
  expect(count(path)).toBe(last)
  await tap()
  expect(count(path)).toBe(last + 1)
  expect(intervals.size).toBe(1)
  await tick()
  expect(count(path)).toBe(last + 2)
})

for (const list of lists) {
  test(`${list.name} never polls; only its own list mounts`, async () => {
    await mounted(list.kind)
    expect(count(list.path)).toBe(1)
    expect(count(list.other)).toBe(0)
    await tick()
    await tick()
    expect(count(list.path)).toBe(1)
    expect(count("storefrontRequests.counts")).toBe(3)
  })
  test(`${list.name} refresh when a count changes and on focus`, async () => {
    const { host } = await mounted(list.kind)
    expect(host.textContent).toContain(list.visible)
    data["storefrontRequests.counts"] = { orders: 5, services: 7, total: 12 }
    await tick()
    expect(count(list.path)).toBe(2)
    await focus()
    expect(count(list.path)).toBe(3)
  })
  test(`${list.name} hide a refused read and focus brings them back`, async () => {
    const { client, host } = await mounted(list.kind)
    failures.set(list.path, "FORBIDDEN")
    await act(async () => {
      await client.refetchQueries({ predicate: target(list.path) })
    })
    await flush()
    expect(cached(client, list.path, false)).toBe(true)
    expect(host.textContent).not.toContain(list.visible)
    const refused = count(list.path)
    await tick()
    expect(count(list.path)).toBe(refused)
    failures.delete(list.path)
    await focus()
    expect(count(list.path)).toBe(refused + 1)
    expect(host.textContent).toContain(list.visible)
  })
}
