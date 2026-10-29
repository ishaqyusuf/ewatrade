import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { TRPCClientError } from "@trpc/client"
import { DOMImplementation } from "@xmldom/xmldom"
import { act } from "react"

// The existing mounted-fixture DOM adapter; actual hooks, cache and observers run.
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
const createElement = document.createElement.bind(document)
document.createElement = (name: string) =>
  Object.assign(createElement(name), {
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
const { QueryClientProvider, focusManager, notifyManager } = await import(
  "@tanstack/react-query"
)
const { createRoot } = await import("react-dom/client")
notifyManager.setScheduler((callback) => queueMicrotask(callback))
const interval = globalThis.setInterval
// Accelerate only the existing 30s/60s cadence, retaining real interval/focus work.
globalThis.setInterval = ((
  callback: TimerHandler,
  delay?: number,
  ...args: unknown[]
) =>
  interval(
    callback,
    delay === 30_000 || delay === 60_000 ? 18 : delay,
    ...args,
  )) as typeof setInterval
mock.module("@/observability/sentry", () => ({ captureDashboardError() {} }))
const { makeQueryClient } = await import("../trpc/query-client")
const reads: {
  path: string
  input: unknown
  key: readonly unknown[]
  signal: AbortSignal
}[] = []
const behavior = new Map<
  string,
  (signal: AbortSignal) => unknown | Promise<unknown>
>()
const payload = { count: 2, unreadCount: 2, items: [{ id: "inert" }] }
function endpoint(path: string) {
  return {
    infiniteQueryOptions: (input?: unknown, options?: object) => ({
      ...options,
      queryKey: [path, input ?? null],
      initialPageParam: undefined,
      getNextPageParam: () => undefined,
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        reads.push({ path, input, key: [path, input ?? null], signal })
        return payload
      },
    }),
    mutationOptions: () => ({
      mutationFn: async () => {
        throw new Error("No business command in read test")
      },
    }),
    queryOptions: (input?: unknown, options?: object) => ({
      ...options,
      queryKey: [path, input ?? null],
      queryFn: async ({
        signal,
        queryKey,
      }: { signal: AbortSignal; queryKey: readonly unknown[] }) => {
        reads.push({ path, input, key: queryKey, signal })
        return behavior.has(path) ? behavior.get(path)?.(signal) : payload
      },
    }),
  }
}
mock.module("@/trpc/client", () => ({
  useTRPC: () => ({
    businessNotifications: {
      unreadCount: endpoint("count"),
      listMine: endpoint("inbox"),
      markRead: endpoint("mark"),
      archive: endpoint("archive"),
      markAllRead: endpoint("mark-all"),
    },
    businessBanking: {
      pendingReports: endpoint("payments"),
      pendingReportCount: endpoint("payment-count"),
      notificationChanges: endpoint("plans"),
      notificationChangeCount: endpoint("plan-count"),
    },
    storefrontRequests: {
      notifications: endpoint("requests"),
      notificationCount: endpoint("request-count"),
    },
  }),
}))
const {
  useUnreadBusinessNotificationCount,
  usePendingPaymentReportCount,
  usePaymentPlanNoticeCount,
  useStorefrontRequestNotificationCount,
  usePendingPaymentReports,
  usePaymentPlanNotices,
  useStorefrontRequestNotifications,
} = await import("./use-business-notification-reads")
const hooks = {
  count: useUnreadBusinessNotificationCount,
  "payment-count": usePendingPaymentReportCount,
  "plan-count": usePaymentPlanNoticeCount,
  "request-count": useStorefrontRequestNotificationCount,
  payments: usePendingPaymentReports,
  plans: usePaymentPlanNotices,
  requests: () => useStorefrontRequestNotifications({ poll: true }),
  panel: () => useStorefrontRequestNotifications({ poll: false }),
}
type Kind = keyof typeof hooks | "bell"
let Bell: () => React.ReactNode
type Snapshot = {
  data: unknown
  isSuccess: boolean
  isError: boolean
  refetch: () => Promise<unknown>
}
const snapshots = new Map<string, Snapshot>()
function Owner({ kind, name }: { kind: Kind; name: string }) {
  if (kind === "bell") return <Bell />
  const query = hooks[kind]()
  snapshots.set(name, query)
  return (
    <output>
      {query.isSuccess ? "ready" : query.isError ? "refused" : "pending"}
    </output>
  )
}
const cleanups: (() => Promise<void>)[] = []
const wait = (ms = 10) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))
const error = (code = "FORBIDDEN") =>
  TRPCClientError.from({
    error: {
      code: -32003,
      data: { code, httpStatus: code === "UNAUTHORIZED" ? 401 : 403 },
      message: "inert refusal",
    },
  } as Parameters<typeof TRPCClientError.from>[0])
beforeEach(() => {
  reads.length = 0
  snapshots.clear()
  behavior.clear()
  focusManager.setFocused(true)
})
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.()
  focusManager.setFocused(undefined)
})
async function mount(initial: { kind: Kind; name: string }[]) {
  const client = makeQueryClient()
  const host = document.createElement("div")
  document.documentElement?.appendChild(host)
  const root = createRoot(host as unknown as HTMLElement)
  let closed = false
  const render = async (owners = initial) => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          {owners.map((owner) => (
            <Owner key={`${owner.kind}:${owner.name}`} {...owner} />
          ))}
        </QueryClientProvider>,
      )
      await wait()
    })
    await act(async () => {
      await wait()
    })
  }
  const close = async () => {
    if (closed) return
    closed = true
    await act(async () => root.unmount())
    client.clear()
    document.documentElement?.removeChild(host)
  }
  cleanups.push(close)
  await render()
  const until = async (check: () => boolean) => {
    for (let index = 0; index < 50 && !check(); index++)
      await act(async () => {
        await wait(5)
      })
    expect(check()).toBe(true)
  }
  const hold = async () => {
    await act(async () => {
      await wait(85)
    })
  }
  return { client, render, close, until, hold, host }
}
const count = (path: string) =>
  reads.filter((read) => read.path === path).length

for (const kind of [
  "count",
  "payments",
  "plans",
  "requests",
  "payment-count",
  "plan-count",
  "request-count",
] as const) {
  test(`${kind} stops repeated interval reads and clears prior data after a fresh refusal`, async () => {
    const ui = await mount([{ kind, name: "owner" }])
    await ui.until(() => snapshots.get("owner")?.isSuccess === true)
    behavior.set(kind, () => {
      throw error()
    })
    await ui.until(() => snapshots.get("owner")?.isError === true)
    const stopped = count(kind)
    expect(snapshots.get("owner")?.data).toBeUndefined()
    await ui.hold()
    expect(count(kind)).toBe(stopped)
  })

  test(`${kind} retains fresh focus recovery and resumes successful polling`, async () => {
    behavior.set(kind, () => {
      throw error("UNAUTHORIZED")
    })
    const ui = await mount([{ kind, name: "owner" }])
    await ui.until(() => snapshots.get("owner")?.isError === true)
    await ui.hold()
    expect(count(kind)).toBe(1)
    behavior.delete(kind)
    await act(async () => {
      focusManager.setFocused(false)
      await wait()
      focusManager.setFocused(true)
      await wait()
    })
    await ui.until(() => snapshots.get("owner")?.isSuccess === true)
    const recovered = count(kind)
    await ui.hold()
    expect(count(kind)).toBeGreaterThan(recovered)
  })

  test(`${kind} keeps polling transient failures rather than treating them as lost access`, async () => {
    behavior.set(kind, () => {
      throw new TypeError("inert transport failure")
    })
    const ui = await mount([{ kind, name: "owner" }])
    await ui.until(() => snapshots.get("owner")?.isError === true)
    const before = count(kind)
    await ui.hold()
    expect(count(kind)).toBeGreaterThan(before)
  })

  test(`${kind} keeps independent mount keys, canonical SDK input and cancellation ownership`, async () => {
    behavior.set(
      kind,
      (signal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          }),
        ),
    )
    const ui = await mount([
      { kind, name: "badge" },
      { kind, name: "panel" },
    ])
    await ui.until(() => count(kind) === 2)
    const queries = ui.client.getQueryCache().getAll()
    expect(queries).toHaveLength(2)
    expect(queries[0]?.queryKey).not.toEqual(queries[1]?.queryKey)
    const input =
      kind === "payments" || kind === "plans" ? { limit: 5 } : undefined
    expect(
      reads.every(
        (read) =>
          JSON.stringify(read.key) === JSON.stringify([kind, input ?? null]),
      ),
    ).toBe(true)
    expect(
      reads.every(
        (read) => JSON.stringify(read.input) === JSON.stringify(input),
      ),
    ).toBe(true)
    await ui.close()
    expect(reads.every((read) => read.signal.aborted)).toBe(true)
  })
}

test("the website panel reads once without interval/focus work and reopening gets a new fresh owner", async () => {
  const ui = await mount([{ kind: "panel", name: "first-open" }])
  await ui.until(() => snapshots.get("first-open")?.isSuccess === true)
  await ui.hold()
  await act(async () => {
    focusManager.setFocused(false)
    await wait()
    focusManager.setFocused(true)
    await wait()
  })
  expect(count("requests")).toBe(1)
  await ui.render([{ kind: "panel", name: "second-open" }])
  await ui.until(() => snapshots.get("second-open")?.isSuccess === true)
  expect(count("requests")).toBe(2)
})

for (const kind of [
  "count",
  "payments",
  "plans",
  "requests",
  "payment-count",
  "plan-count",
  "request-count",
] as const) {
  test(`${kind} pauses interval work while unfocused and resumes on focus`, async () => {
    const ui = await mount([{ kind, name: "owner" }])
    await ui.until(() => snapshots.get("owner")?.isSuccess === true)
    await act(async () => {
      focusManager.setFocused(false)
      await wait()
    })
    const paused = count(kind)
    await ui.hold()
    expect(count(kind)).toBe(paused)
    await act(async () => {
      focusManager.setFocused(true)
      await wait()
    })
    await ui.until(() => count(kind) > paused)
  })
}

test("actual closed bell fetches compact counts; previews start only on open and stop on close", async () => {
  let toggle: ((open: boolean) => void) | undefined
  const empty = () => null
  mock.module("@ewatrade/ui", () => ({
    Popover: ({
      children,
      onOpenChange,
    }: {
      children: React.ReactNode
      onOpenChange: (open: boolean) => void
    }) => {
      toggle = onOpenChange
      return children
    },
    PopoverContent: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    PopoverTrigger: ({
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button {...props}>{children}</button>
    ),
    cn: (...values: string[]) => values.join(" "),
  }))
  mock.module("@hugeicons/react", () => ({ HugeiconsIcon: empty }))
  mock.module("@/components/activity/activity-viewer", () => ({
    ActivityViewerProvider: ({ children }: { children: React.ReactNode }) =>
      children,
  }))
  mock.module("@/hooks/use-activity-params", () => ({
    useActivityParams: () => ({ open() {} }),
  }))
  mock.module(
    "../components/notification-center/business-notification-settings",
    () => ({ useAlertPreferencesParams: () => ({ open() {} }) }),
  )
  mock.module(
    "../components/notification-center/business-notification-inbox",
    () => ({ BusinessNotificationInbox: empty }),
  )
  mock.module("../components/notification-center/payment-plan-notices", () => ({
    PaymentPlanNotices: () => {
      usePaymentPlanNotices()
      return null
    },
  }))
  mock.module(
    "../components/notification-center/payment-report-notifications",
    () => ({
      PaymentReportNotifications: () => {
        usePendingPaymentReports()
        return null
      },
    }),
  )
  mock.module(
    "../components/notification-center/storefront-request-notifications",
    () => ({
      StorefrontRequestNotifications: () => {
        useStorefrontRequestNotifications({ poll: false })
        return null
      },
    }),
  )
  const { BusinessNotificationCenter } = await import(
    "../components/notification-center/business-notification-center"
  )
  Bell = () => (
    <BusinessNotificationCenter timeZone="UTC" viewerMembershipId="member" />
  )
  const ui = await mount([{ kind: "bell", name: "shell" }])
  await ui.until(() =>
    ui.host.toString().includes("My notifications, 8 unread"),
  )
  expect(new Set(reads.map((read) => read.path))).toEqual(
    new Set(["count", "payment-count", "plan-count", "request-count"]),
  )
  await act(async () => {
    toggle?.(true)
    await wait()
  })
  await ui.until(() =>
    ["payments", "plans", "requests", "inbox"].every((path) => count(path) > 0),
  )
  await act(async () => {
    toggle?.(false)
    await wait()
  })
  const previewReads = ["payments", "plans", "requests", "inbox"].map(count)
  await ui.hold()
  expect(["payments", "plans", "requests", "inbox"].map(count)).toEqual(
    previewReads,
  )
  await ui.close()
  expect(ui.client.getQueryCache().getAll()).toHaveLength(0)
})
