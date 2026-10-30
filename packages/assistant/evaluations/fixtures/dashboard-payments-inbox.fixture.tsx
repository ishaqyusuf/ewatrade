import { afterEach, expect, mock, test } from "bun:test"
import { DOMImplementation } from "@xmldom/xmldom"
import { type ReactNode, act } from "react"

const doc = new DOMImplementation().createDocument(
  "http://www.w3.org/1999/xhtml",
  "html",
  null,
)
const create = doc.createElement.bind(doc)
doc.createElement = (name: string) =>
  Object.assign(create(name), {
    style: {},
    focus() {},
    addEventListener() {},
    removeEventListener() {},
  })
const body = doc.createElement("body")
doc.documentElement.appendChild(body)
Object.assign(doc, { body, addEventListener() {}, removeEventListener() {} })
const win = {
  document: doc,
  HTMLElement: class {},
  HTMLIFrameElement: class {},
  addEventListener() {},
  removeEventListener() {},
  location: { origin: "https://example.invalid" },
}
Object.assign(doc, { defaultView: win })
Object.assign(globalThis, {
  document: doc,
  window: win,
  IS_REACT_ACT_ENVIRONMENT: true,
})
const { QueryClientProvider, focusManager, onlineManager, notifyManager } =
  await import("@tanstack/react-query")
const { createRoot } = await import("react-dom/client")
notifyManager.setScheduler((callback) => queueMicrotask(callback))
focusManager.setFocused(true)

// The real observer owns activation/focus/cadence; tests trigger its 30s callback
// deterministically instead of waiting or issuing real network requests.
const realInterval = globalThis.setInterval
const realClearInterval = globalThis.clearInterval
const pollCallbacks = new Map<ReturnType<typeof setInterval>, () => void>()
globalThis.setInterval = ((
  callback: TimerHandler,
  delay?: number,
  ...args: unknown[]
) => {
  if (delay !== 30_000 || typeof callback !== "function")
    return realInterval(callback, delay, ...args)
  const id = realInterval(() => {}, 100_000_000)
  pollCallbacks.set(id, () => callback(...args))
  return id
}) as typeof setInterval
globalThis.clearInterval = ((id: ReturnType<typeof setInterval>) => {
  pollCallbacks.delete(id)
  realClearInterval(id)
}) as typeof clearInterval

import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
const { TRPCClientError, createTRPCClient } = await import("@trpc/client")
import type { inferRouterOutputs } from "@trpc/server"
const { observable } = await import("@trpc/server/observable")
const { createTRPCOptionsProxy } = await import("@trpc/tanstack-react-query")
type Page = inferRouterOutputs<AppRouter>["businessBanking"]["pendingReports"]
const operations: { path: string; input: unknown }[] = []
let pages: Record<string, Page> = {}
let refused: string | null = null
let gate: ReturnType<typeof Promise.withResolvers<Page>> | undefined
let tailGate: ReturnType<typeof Promise.withResolvers<Page>> | undefined
let aborts = 0
let badgeReads = 0
const rpc = createTRPCClient<AppRouter>({
  links: [
    () =>
      ({ op }) =>
        observable((observer) => {
          operations.push({ path: op.path, input: op.input })
          const abort = () => {
            aborts++
            observer.error(new TRPCClientError("Inert cancellation"))
          }
          op.signal?.addEventListener("abort", abort, { once: true })
          const run = async () => {
            if (op.path === "businessBanking.pendingReportCount") {
              badgeReads++
              return { count: 1 }
            }
            if (op.path !== "businessBanking.pendingReports")
              throw Error("Unexpected inert RPC")
            if (refused)
              throw new TRPCClientError("Inert refusal", {
                result: {
                  error: {
                    code: -32003,
                    message: "Inert refusal",
                    data: { code: refused },
                  },
                },
              })
            const input = op.input as { beforeId?: string }
            return (
              (input.beforeId ? tailGate?.promise : undefined) ??
              gate?.promise ??
              pages[input.beforeId ?? "first"] ?? {
                items: [],
                nextCursor: null,
              }
            )
          }
          void run().then(
            (data) => {
              observer.next({ result: { data } })
              observer.complete()
            },
            (error) => observer.error(error),
          )
          return () => op.signal?.removeEventListener("abort", abort)
        }),
  ],
})
let options: ReturnType<typeof createTRPCOptionsProxy<AppRouter>>
mock.module("@/trpc/client", () => ({
  useTRPC: () => options,
  useTRPCClient: () => rpc,
}))
mock.module("@/observability/sentry", () => ({ captureDashboardError() {} }))
const leaf = ({ children }: { children?: ReactNode }) => <div>{children}</div>
const actions = new Map<string, { click: () => void; disabled?: boolean }>()
function Button({
  children,
  onClick,
  disabled,
}: { children?: ReactNode; onClick?: () => void; disabled?: boolean }) {
  if (typeof children === "string" && onClick)
    actions.set(children, { click: onClick, disabled })
  return (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}
mock.module("@ewatrade/ui", () => ({
  Button,
  Badge: leaf,
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
}))
mock.module("@hugeicons/react", () => ({ HugeiconsIcon: () => null }))
let selected: string | null = null
mock.module("nuqs", () => ({
  parseAsString: {},
  useQueryState: () => [selected, async () => {}],
}))
mock.module("@/components/finance/finance-header", () => ({
  FINANCE_MENU_ITEMS: [],
}))
mock.module("@/components/forms/form-feedback", () => ({ FormFeedback: leaf }))
mock.module("@/components/page-header", () => ({ PageHeader: leaf }))
mock.module("@/components/scrollable-content", () => ({
  ScrollableContent: leaf,
}))
mock.module("@/components/secondary-menu", () => ({ SecondaryMenu: leaf }))
const app = (path: string) =>
  new URL(`../../../../apps/dashboard/src/${path}`, import.meta.url).pathname
let afterReview: (() => Promise<unknown>) | undefined
mock.module(
  app("components/business-banking/payment-report-review.tsx"),
  () => ({
    PaymentReportReview: ({
      onReviewed,
    }: { onReviewed: () => Promise<unknown> }) => {
      afterReview = onReviewed
      return <p>Selected review remains</p>
    },
  }),
)
const { PaymentsToCheck } = await import(
  app("components/business-banking/payments-to-check.tsx")
)
const { makeQueryClient } = await import(app("trpc/query-client.ts"))
const { useQuery } = await import("@tanstack/react-query")
function CountObserver() {
  useQuery(options.businessBanking.pendingReportCount.queryOptions())
  return null
}
const delay = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms))
async function flush() {
  await act(async () => {
    await delay()
  })
  await act(async () => {
    await delay()
  })
}
async function tickPoll() {
  await act(async () => {
    for (const tick of [...pollCallbacks.values()]) tick()
    await delay()
  })
  await flush()
}
function page(
  id: string,
  nextCursor: string | null = null,
  revision = 1,
): Page {
  return {
    items: [
      {
        id,
        revision,
        payerName: `Payer ${id}`,
        paymentReference: null,
        amountMinor: 1000,
        currencyCode: "NGN",
        orderId: "order-a",
        orderNumber: "ORD-A",
        submittedAt: new Date("2026-10-29T00:00:00Z"),
        status: "unverified",
      },
    ],
    nextCursor,
  }
}
const reads = () =>
  operations.filter((op) => op.path === "businessBanking.pendingReports")
const firstReads = () =>
  reads().filter((op) => !(op.input as { beforeId?: string }).beforeId)
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.()
})
async function mounted(input: { review?: boolean; badge?: boolean } = {}) {
  operations.length = 0
  actions.clear()
  refused = null
  gate = undefined
  tailGate = undefined
  aborts = 0
  badgeReads = 0
  selected = input.review ? "report-a" : null
  pages = { first: page("report-a", "cursor-a"), "cursor-a": page("report-b") }
  focusManager.setFocused(true)
  onlineManager.setOnline(true)
  const client = makeQueryClient()
  options = createTRPCOptionsProxy<AppRouter>({
    client: rpc,
    queryClient: client,
  })
  const host = doc.createElement("div")
  body.appendChild(host)
  const root = createRoot(host as unknown as HTMLElement)
  const render = async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <PaymentsToCheck timeZone="UTC" showFinanceMenu={false} />
          {input.badge ? <CountObserver /> : null}
        </QueryClientProvider>,
      )
      await delay()
    })
    await flush()
  }
  const close = async () => {
    await act(async () => root.unmount())
    client.clear()
    body.removeChild(host)
  }
  cleanups.push(close)
  return { client, render, html: () => host.toString(), close }
}
async function click(label: string) {
  const action = actions.get(label)
  expect(action).toBeDefined()
  expect(action?.disabled).not.toBe(true)
  await act(async () => {
    action?.click()
    await delay()
  })
  await flush()
}

test("actual inbox initial page has one RPC read and load more only reads its cursor", async () => {
  const ui = await mounted()
  await ui.render()
  expect(firstReads()).toHaveLength(1)
  expect(ui.html()).toContain("Payer report-a")
  await click("Load more")
  expect(reads()).toHaveLength(2)
  expect(reads()[1]?.input).toEqual({ limit: 20, beforeId: "cursor-a" })
  expect(ui.html()).toContain("Payer report-b")
})

test("unchanged first-page polls do not reread loaded pages; changed polls consume their fresh result once", async () => {
  const ui = await mounted()
  await ui.render()
  await click("Load more")
  const before = reads().length
  await tickPoll()
  expect(reads().length - before).toBe(1)
  expect(ui.html()).toContain("Payer report-b")
  pages.first = page("report-new", "cursor-new")
  pages["cursor-new"] = page("report-a", null, 2)
  const changed = reads().length
  await tickPoll()
  expect(reads().length - changed).toBe(2)
  expect(
    reads()
      .slice(changed)
      .map((op) => op.input),
  ).toEqual([{ limit: 20 }, { limit: 20, beforeId: "cursor-new" }])
  expect(ui.html()).toContain("Payer report-new")
  expect(ui.html()).not.toContain("Payer report-b")
})

test("focus refreshes current first and loaded pages without duplicate first-page transport", async () => {
  const ui = await mounted()
  await ui.render()
  await click("Load more")
  const before = reads().length
  await act(async () => {
    focusManager.setFocused(false)
    focusManager.setFocused(true)
    await delay()
  })
  await flush()
  expect(reads().length - before).toBe(2)
})

test("post-review callback refreshes list and numeric badge while keeping the selected review", async () => {
  const ui = await mounted({ review: true, badge: true })
  await ui.render()
  await click("Load more")
  pages.first = page("report-c", "cursor-a")
  const before = reads().length
  const countsBefore = badgeReads
  await act(async () => {
    await afterReview?.()
    await delay()
  })
  await flush()
  expect(reads().length - before).toBe(2)
  expect(badgeReads).toBe(countsBefore + 1)
  expect(ui.html()).toContain("Payer report-c")
  expect(ui.html()).toContain("Selected review remains")
})

test("refusal hides and erases claims; focus recovery obtains current financial rows", async () => {
  const ui = await mounted()
  await ui.render()
  const olderPage = Promise.withResolvers<Page>()
  tailGate = olderPage
  await click("Load more")
  refused = "FORBIDDEN"
  await tickPoll()
  expect(ui.html()).not.toContain("Payer report-a")
  expect(ui.html()).toContain("Only staff who can take payments")
  for (const query of ui.client
    .getQueryCache()
    .findAll({ queryKey: options.businessBanking.pendingReports.pathKey() }))
    expect(query.state.data).toBeUndefined()
  const deniedReads = reads().length
  await tickPoll()
  expect(reads()).toHaveLength(deniedReads)
  expect(aborts).toBeGreaterThan(0)
  await act(async () => {
    olderPage.resolve(page("obsolete-denied-tail"))
    await delay()
  })
  await flush()
  expect(ui.html()).not.toContain("Payer obsolete-denied-tail")
  tailGate = undefined
  refused = null
  pages.first = page("store-b-report")
  await act(async () => {
    focusManager.setFocused(false)
    focusManager.setFocused(true)
    await delay()
  })
  await flush()
  expect(ui.html()).toContain("Payer store-b-report")
  expect(ui.html()).not.toContain("Payer report-a")
})

test("a transient failure retries fresh through the existing Try again action", async () => {
  const ui = await mounted()
  await ui.render()
  refused = "INTERNAL_SERVER_ERROR"
  await act(async () => {
    await ui.client.invalidateQueries({
      queryKey: options.businessBanking.pendingReports.pathKey(),
    })
    await delay()
  })
  await flush()
  expect(ui.html()).not.toContain("Payer report-a")
  refused = null
  pages.first = page("retried-report")
  const before = firstReads().length
  await click("Try again")
  expect(firstReads().length - before).toBe(1)
  expect(ui.html()).toContain("Payer retried-report")
})

test("unmount cancels the shared first-page read and a later mount reads fresh", async () => {
  const ui = await mounted()
  const pending = Promise.withResolvers<Page>()
  gate = pending
  await ui.render()
  expect(firstReads()).toHaveLength(1)
  await ui.close()
  cleanups.pop()
  expect(aborts).toBeGreaterThan(0)
  expect(ui.client.getQueryCache().getAll()).toHaveLength(0)
  pending.resolve(page("obsolete-report"))
  const next = await mounted()
  pages.first = page("current-store-report")
  await next.render()
  expect(firstReads()).toHaveLength(1)
  expect(next.html()).toContain("Payer current-store-report")
  expect(next.html()).not.toContain("Payer obsolete-report")
})

test("an existing canonical first-page cache does not replace the inbox fresh mount", async () => {
  const ui = await mounted()
  ui.client.setQueryData(
    options.businessBanking.pendingReports.queryKey({ limit: 20 }),
    page("old-cached-report"),
  )
  await ui.render()
  expect(firstReads()).toHaveLength(1)
  expect(ui.html()).toContain("Payer report-a")
  expect(ui.html()).not.toContain("Payer old-cached-report")
})

test("post-review refresh cancels an older poll before obtaining current first and loaded pages", async () => {
  const ui = await mounted({ review: true })
  await ui.render()
  await click("Load more")
  const pending = Promise.withResolvers<Page>()
  gate = pending
  await tickPoll()
  const before = reads().length
  gate = undefined
  pages.first = page("after-review", "cursor-a")
  await act(async () => {
    await afterReview?.()
    await delay()
  })
  await flush()
  expect(aborts).toBeGreaterThan(0)
  expect(reads().length - before).toBe(2)
  expect(ui.html()).toContain("Payer after-review")
  await act(async () => {
    pending.resolve(page("obsolete-pre-review"))
    await delay()
  })
  await flush()
  expect(ui.html()).not.toContain("Payer obsolete-pre-review")
})

test("a poll completed offline cannot leave a reusable first page for a paused refresh", async () => {
  const ui = await mounted()
  await ui.render()
  await click("Load more")
  const pending = Promise.withResolvers<Page>()
  gate = pending
  await tickPoll()
  await act(async () => {
    onlineManager.setOnline(false)
    pending.resolve(page("polled-before-reconnect", "cursor-new"))
    await delay()
  })
  await flush()
  const beforeReconnect = reads().length
  gate = undefined
  pages.first = page("current-after-reconnect", "cursor-new")
  pages["cursor-new"] = page("current-tail")
  await act(async () => {
    onlineManager.setOnline(true)
    await delay()
  })
  await flush()
  expect(reads().length - beforeReconnect).toBe(2)
  expect(ui.html()).toContain("Payer current-after-reconnect")
  expect(ui.html()).toContain("Payer current-tail")
  expect(ui.html()).not.toContain("Payer polled-before-reconnect")
})

test("a newer arrival during Load more refreshes pages even in the same clock millisecond", async () => {
  const originalNow = Date.now
  Date.now = () => 1_793_318_400_000
  try {
    const ui = await mounted()
    await ui.render()
    const pending = Promise.withResolvers<Page>()
    tailGate = pending
    await click("Load more")
    pages.first = page("new-during-load", "cursor-new")
    pages["cursor-new"] = page("new-tail")
    await tickPoll()
    tailGate = undefined
    await act(async () => {
      pending.resolve(page("old-tail"))
      await delay()
    })
    await flush()
    expect(firstReads()).toHaveLength(2)
    expect(ui.html()).toContain("Payer new-during-load")
    expect(ui.html()).toContain("Payer new-tail")
    expect(ui.html()).not.toContain("Payer old-tail")
  } finally {
    Date.now = originalNow
  }
})

process.on("exit", () => {
  globalThis.setInterval = realInterval
  globalThis.clearInterval = realClearInterval
  focusManager.setFocused(undefined)
})
