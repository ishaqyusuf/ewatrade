import { afterEach, expect, mock, test } from "bun:test"
import { AsyncLocalStorage } from "node:async_hooks"
import type { PerformanceTrace } from "@ewatrade/db/performance-tracing"
import { trpcServer } from "@hono/trpc-server"
import { QueryObserver, dehydrate, hydrate } from "@tanstack/react-query"
import { TRPCError } from "@trpc/server"
import { Hono } from "hono"
import * as React from "react"
import { z } from "zod"
import {
  type TRPCContext,
  createTRPCRouter,
  protectedProcedure,
} from "../../../api/src/trpc/init"
import { createRequestReadContext } from "../../../api/src/trpc/request-read-context"
import {
  type TraceCompletion,
  performanceTracingMiddleware,
} from "../../../api/src/utils/performance-trace-response"

// Stand in for the RSC host's request cache/headers. Actual transport, tRPC
// protected middleware, read memoization, query clients and serialization run.
const owners = new AsyncLocalStorage<{
  actor: string
  values: Map<unknown, unknown>
}>()
const reactExports = { ...React }
mock.module("react", () => ({
  ...reactExports,
  cache:
    <T>(fn: () => T) =>
    () => {
      const owner = owners.getStore()
      if (!owner) return fn()
      if (!owner.values.has(fn)) owner.values.set(fn, fn())
      return owner.values.get(fn) as T
    },
}))
mock.module("server-only", () => ({}))
mock.module("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "dashboard.test",
      cookie: `actor=${owners.getStore()?.actor ?? "default"}`,
    }),
}))
mock.module("@/observability/sentry", () => ({
  captureDashboardError: () => {},
}))
const { getQueryClient, trpc } = await import("./server")
const { makeQueryClient } = await import("./query-client")
const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

function fixture(options: { failSlow?: boolean; deniedActor?: string } = {}) {
  let release = () => {}
  const blocked = new Promise<void>((resolve) => {
    release = resolve
  })
  let started = () => {}
  const slowStarted = new Promise<void>((resolve) => {
    started = resolve
  })
  const counts = { contexts: 0, legalReads: 0, tenantReads: 0, requests: 0 }
  const traces: { trace: PerformanceTrace; completion: TraceCompletion }[] = []
  let signal: AbortSignal | null | undefined
  const router = createTRPCRouter({
    orders: createTRPCRouter({
      get: protectedProcedure
        .input(z.object({ orderId: z.string() }))
        .query(({ ctx }) => ({
          id: "ready",
          at: new Date("2026-10-01"),
          tenantId: ctx.tenantId,
        })),
      timeline: protectedProcedure
        .input(z.object({ orderId: z.string() }))
        .query(async () => {
          started()
          await blocked
          if (options.failSlow) throw new TRPCError({ code: "FORBIDDEN" })
          return { items: [] }
        }),
    }),
  })
  const app = new Hono()
  app.use(
    "*",
    performanceTracingMiddleware(
      () => true,
      (trace, completion) => traces.push({ trace, completion }),
    ),
  )
  app.use("*", async (c, next) => {
    await next()
    c.header("Server-Timing", "legacy;dur=1")
  })
  app.use(
    "/api/trpc/*",
    trpcServer({
      router,
      endpoint: "/api/trpc",
      createContext: (_, c) => {
        counts.contexts++
        const actor = c.req.header("cookie")?.split("=")[1] ?? "default"
        const db = {
          user: {
            findUnique: async () => {
              counts.legalReads++
              return { ageBand: "ADULT" }
            },
          },
          membership: {
            findFirst: async () => {
              counts.tenantReads++
              if (actor === options.deniedActor) return null
              return {
                id: `membership-${actor}`,
                role: "OWNER",
                tenantId: `tenant-${actor}`,
                staffAccessMode: "LEGACY",
                staffStoreAssignments: [],
                catalogEditor: false,
                tenant: {
                  id: `tenant-${actor}`,
                  slug: `business-${actor}`,
                  name: "Business",
                  type: "MERCHANT",
                  enabledModes: ["MERCHANT"],
                  currencyCode: "NGN",
                  timezone: "UTC",
                  dataClassification: "LIVE",
                  qaPurgeStartedAt: null,
                  metadata: {},
                  stores: [
                    {
                      id: `store-${actor}`,
                      slug: "store",
                      name: "Store",
                      status: "ACTIVE",
                      currencyCode: "NGN",
                      metadata: {},
                    },
                  ],
                },
              }
            },
          },
        }
        return {
          db,
          readContext: createRequestReadContext("GET"),
          requestHeaders: new Headers(),
          requestId: "source",
          session: { session: { id: `session-${actor}` }, user: { id: actor } },
          tenantContext: null,
          tenantSlug: `business-${actor}`,
          activeStoreId: `store-${actor}`,
          isInternalRequest: false,
          qaSessionScope: null,
        } as unknown as TRPCContext
      },
    }),
  )
  globalThis.fetch = async (input, init) => {
    counts.requests++
    signal = init?.signal
    const response = await app.fetch(new Request(input, init))
    expect(response.headers.get("Server-Timing")).toContain("ew_responseSetup;")
    expect(response.headers.get("Server-Timing")).toContain("legacy;")
    return response
  }
  return { counts, release, slowStarted, traces, signal: () => signal }
}
function asOwner<T>(actor: string, work: () => T) {
  return owners.run({ actor, values: new Map() }, work)
}

test("actual server read transport resolves a ready query before a blocked sibling without repeating authority", async () => {
  const state = fixture()
  const { client, fast, slow } = asOwner("one", () => {
    const client = getQueryClient()
    return {
      client,
      fast: client.fetchQuery(
        trpc.orders.get.queryOptions({ orderId: "source" }),
      ),
      slow: client.fetchQuery(
        trpc.orders.timeline.queryOptions({ orderId: "source" }),
      ),
    }
  })
  try {
    await state.slowStarted
    const pending = Symbol("blocked")
    const result = await Promise.race([
      fast,
      new Promise<typeof pending>((resolve) =>
        setTimeout(() => resolve(pending), 500),
      ),
    ])
    expect(result).not.toBe(pending)
    expect(result).toMatchObject({
      id: "ready",
      at: new Date("2026-10-01"),
      tenantId: "tenant-one",
    })
    expect(state.counts).toEqual({
      requests: 1,
      contexts: 1,
      legalReads: 1,
      tenantReads: 1,
    })
    expect(state.traces).toEqual([])
  } finally {
    state.release()
    await Promise.allSettled([fast, slow])
    await new Promise<void>((resolve) => setImmediate(resolve))
    client.clear()
  }
  expect(state.traces).toHaveLength(1)
  expect(state.traces[0]?.trace.phases.legal?.count).toBe(1)
  expect(state.traces[0]?.trace.phases.scope?.count).toBe(1)
})

test("pending streaming hydration is consumed without a second client fetch", async () => {
  const state = fixture()
  const source = asOwner("one", () => {
    const client = getQueryClient()
    const ready = trpc.orders.get.queryOptions({ orderId: "source" })
    const pending = trpc.orders.timeline.queryOptions({ orderId: "source" })
    const fast = client.fetchQuery(ready)
    const slow = client.fetchQuery(pending)
    return { client, ready, pending, fast, slow }
  })
  const browser = makeQueryClient()
  let extraFetches = 0
  const unexpectedFetch = async () => {
    extraFetches++
    throw new Error("unexpected duplicate read")
  }
  let unsubscribe = () => {}
  try {
    await state.slowStarted
    hydrate(browser, dehydrate(source.client))
    const observer = new QueryObserver(browser, {
      ...source.pending,
      queryFn: unexpectedFetch,
    })
    unsubscribe = observer.subscribe(() => {})
    await source.fast
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(browser.getQueryData(source.ready.queryKey)).toMatchObject({
      id: "ready",
      at: new Date("2026-10-01"),
    })
    expect(browser.getQueryState(source.pending.queryKey)?.status).toBe(
      "pending",
    )
    expect(extraFetches).toBe(0)
  } finally {
    state.release()
    await Promise.allSettled([source.fast, source.slow])
    await new Promise<void>((resolve) => setImmediate(resolve))
    unsubscribe()
  }
  expect(browser.getQueryState(source.pending.queryKey)?.status).toBe("success")
  expect(extraFetches).toBe(0)
  expect(state.counts.requests).toBe(1)
  browser.clear()
  source.client.clear()
})

test("a rejected sibling preserves the ready result and erases its earlier rejected payload", async () => {
  const state = fixture({ failSlow: true })
  const source = asOwner("one", () => {
    const client = getQueryClient()
    const options = trpc.orders.timeline.queryOptions(
      { orderId: "source" },
      { staleTime: 0 },
    )
    client.setQueryData(options.queryKey, { items: ["old authorized data"] })
    return {
      client,
      options,
      fast: client.fetchQuery(
        trpc.orders.get.queryOptions({ orderId: "source" }),
      ),
      slow: client.fetchQuery(options).catch((error) => error),
    }
  })
  try {
    await state.slowStarted
    expect(await source.fast).toMatchObject({ tenantId: "tenant-one" })
    state.release()
    expect(await source.slow).toMatchObject({ data: { code: "FORBIDDEN" } })
    expect(source.client.getQueryData(source.options.queryKey)).toBeUndefined()
    expect(state.counts.requests).toBe(1)
  } finally {
    state.release()
    source.client.clear()
  }
})

test("a refused concurrent owner cannot borrow another render's successful result", async () => {
  const state = fixture({ deniedActor: "two" })
  const read = () =>
    getQueryClient().fetchQuery(
      trpc.orders.get.queryOptions({ orderId: "same-key" }),
    )
  const [one, refused] = await Promise.all([
    asOwner("one", read),
    asOwner("two", read).catch((error) => error),
  ])
  expect(one).toMatchObject({ tenantId: "tenant-one" })
  expect(refused).toMatchObject({ data: { code: "NOT_FOUND" } })
  expect(state.counts.requests).toBe(2)
})

test("an opted-in cancelled read retains the caller's abort signal", async () => {
  const state = fixture()
  const source = asOwner("one", () => {
    const client = getQueryClient()
    const options = trpc.orders.timeline.queryOptions(
      { orderId: "source" },
      { trpc: { abortOnUnmount: true } },
    )
    return {
      client,
      options,
      pending: client.fetchQuery(options).catch((error) => error),
    }
  })
  try {
    await state.slowStarted
    await source.client.cancelQueries({ queryKey: source.options.queryKey })
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(state.signal()?.aborted).toBe(true)
    expect(state.counts.requests).toBe(1)
  } finally {
    state.release()
    await source.pending
    source.client.clear()
  }
})

test("simultaneous RSC owners cannot share an HTTP batch or another actor's results", async () => {
  const state = fixture()
  const read = () =>
    getQueryClient().fetchQuery(
      trpc.orders.get.queryOptions({ orderId: "same-key" }),
    )
  const [one, two] = await Promise.all([
    asOwner("one", read),
    asOwner("two", read),
  ])
  expect([one, two]).toMatchObject([
    { tenantId: "tenant-one" },
    { tenantId: "tenant-two" },
  ])
  expect(state.counts).toEqual({
    requests: 2,
    contexts: 2,
    legalReads: 2,
    tenantReads: 2,
  })
})
