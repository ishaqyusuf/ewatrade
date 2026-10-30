import { afterEach, expect, mock, test } from "bun:test"
import { trpcServer } from "@hono/trpc-server"
import { useQueryClient } from "@tanstack/react-query"
import { getUntypedClient } from "@trpc/client"
import { TRPCError } from "@trpc/server"
import { Hono } from "hono"
import { renderToReadableStream } from "react-dom/server"
import { z } from "zod"
import {
  type TRPCContext,
  createTRPCRouter,
  protectedProcedure,
} from "../../../../apps/api/src/trpc/init"
import { createRequestReadContext } from "../../../../apps/api/src/trpc/request-read-context"

// Actual browser provider, QueryClient, HTTP links, Hono/tRPC, protected middleware
// and Superjson. Only event reporting, auth/database facts and network are inert.
const appPath = (path: string) =>
  new URL(`../../../../apps/dashboard/src/${path}`, import.meta.url).pathname
mock.module("@ewatrade/events/client", () => ({
  useEvents: () => ({ canCollect: () => false, track() {} }),
}))
mock.module(appPath("observability/sentry"), () => ({
  captureDashboardError() {},
}))
const { TRPCReactProvider, useTRPC, useTRPCClient } = await import(
  "../../../../apps/dashboard/src/trpc/client"
)
const originalFetch = globalThis.fetch
const timeline = {
  orderId: "source",
  orderNumber: "SOURCE",
  currencyCode: "NGN",
  items: [],
}
const clients: ReturnType<typeof useQueryClient>[] = []
afterEach(() => {
  globalThis.fetch = originalFetch
  for (const client of clients.splice(0)) client.clear()
})

async function provider() {
  let captured:
    | {
        client: ReturnType<typeof useTRPCClient>
        options: ReturnType<typeof useTRPC>
        queryClient: ReturnType<typeof useQueryClient>
      }
    | undefined
  function Capture() {
    captured = {
      client: useTRPCClient(),
      options: useTRPC(),
      queryClient: useQueryClient(),
    }
    return null
  }
  const stream = await renderToReadableStream(
    <TRPCReactProvider>
      <Capture />
    </TRPCReactProvider>,
  )
  await new Response(stream).text()
  if (!captured) throw Error("Browser provider did not render")
  clients.push(captured.queryClient)
  return captured
}

async function beforeSibling<T>(read: Promise<T>) {
  const blocked = Symbol("blocked")
  const result = await Promise.race([
    read,
    new Promise<typeof blocked>((resolve) =>
      setTimeout(() => resolve(blocked), 300),
    ),
  ])
  expect(result).not.toBe(blocked)
  return result
}

function fixture({ failSlow = false } = {}) {
  let release = () => {}
  const blocked = new Promise<void>((resolve) => {
    release = resolve
  })
  let started = () => {}
  const slowStarted = new Promise<void>((resolve) => {
    started = resolve
  })
  let actor = "one"
  let denied = false
  const counts = { requests: 0, contexts: 0, legalReads: 0, tenantReads: 0 }
  const requests: Request[] = []
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
          if (failSlow) throw new TRPCError({ code: "FORBIDDEN" })
          return timeline
        }),
    }),
    storefront: createTRPCRouter({
      preview: protectedProcedure
        .input(z.object({ composition: z.string(), session: z.string() }))
        .query(({ input }) => ({ accepted: Boolean(input.session) })),
    }),
    transport: createTRPCRouter({
      command: protectedProcedure
        .input(z.object({ sequence: z.number() }))
        .mutation(({ input }) => input),
    }),
  })
  const app = new Hono()
  app.use(
    "/api/trpc/*",
    trpcServer({
      router,
      endpoint: "/api/trpc",
      allowMethodOverride: true,
      createContext: (_, c) => {
        counts.contexts++
        const currentActor = actor
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
              if (denied) return null
              return {
                id: `membership-${currentActor}`,
                role: "OWNER",
                tenantId: `tenant-${currentActor}`,
                staffAccessMode: "LEGACY",
                staffStoreAssignments: [],
                catalogEditor: false,
                tenant: {
                  id: `tenant-${currentActor}`,
                  slug: `business-${currentActor}`,
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
                      id: `store-${currentActor}`,
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
          readContext: createRequestReadContext(c.req.method),
          requestHeaders: new Headers(),
          requestId: "source",
          session: {
            session: { id: `session-${currentActor}` },
            user: { id: currentActor },
          },
          tenantContext: null,
          tenantSlug: `business-${currentActor}`,
          activeStoreId: `store-${currentActor}`,
          isInternalRequest: false,
          qaSessionScope: null,
        } as unknown as TRPCContext
      },
    }),
  )
  globalThis.fetch = Object.assign(
    async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      const value =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url
      const request = new Request(
        new URL(value, "https://dashboard.test"),
        init,
      )
      requests.push(request.clone())
      counts.requests++
      return app.fetch(request)
    },
    { preconnect: originalFetch.preconnect },
  )
  return {
    counts,
    requests,
    release,
    slowStarted,
    changeActor(value: string) {
      actor = value
    },
    refuse() {
      denied = true
    },
  }
}

test("a ready browser query resolves before its blocked batch sibling with one fresh authority context", async () => {
  const state = fixture()
  const { client } = await provider()
  const fast = client.orders.get.query({ orderId: "source" })
  const slow = client.orders.timeline.query({ orderId: "source" })
  try {
    await state.slowStarted
    const result = await beforeSibling(fast)
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
    expect(state.requests[0]?.headers.get("x-trpc-source")).toBe("react")
    expect(state.requests[0]?.headers.get("x-assistant-client")).toBe(
      "dashboard",
    )
    expect(state.requests[0]?.headers.get("x-ewatrade-analytics")).toBe(
      "denied",
    )
  } finally {
    state.release()
    await Promise.allSettled([fast, slow])
  }
})

test("a rejected read erases its old payload without discarding its ready sibling", async () => {
  const state = fixture({ failSlow: true })
  const { client, options, queryClient } = await provider()
  const pendingOptions = options.orders.timeline.queryOptions(
    { orderId: "source" },
    { staleTime: 0, retry: false },
  )
  queryClient.setQueryData(pendingOptions.queryKey, {
    ...timeline,
    orderNumber: "Earlier authorized order",
  })
  const fast = client.orders.get.query({ orderId: "source" })
  const slow = queryClient.fetchQuery(pendingOptions).catch((error) => error)
  try {
    await state.slowStarted
    expect(await beforeSibling(fast)).toMatchObject({ tenantId: "tenant-one" })
    state.release()
    expect(await slow).toMatchObject({ data: { code: "FORBIDDEN" } })
    expect(queryClient.getQueryData(pendingOptions.queryKey)).toBeUndefined()
    expect(state.counts.requests).toBe(1)
  } finally {
    state.release()
    await Promise.allSettled([fast, slow])
  }
})

test("later browser reads recheck the current actor and refusal instead of retaining earlier authority", async () => {
  const state = fixture()
  const { client } = await provider()
  expect(await client.orders.get.query({ orderId: "same" })).toMatchObject({
    tenantId: "tenant-one",
  })
  state.changeActor("two")
  expect(await client.orders.get.query({ orderId: "same" })).toMatchObject({
    tenantId: "tenant-two",
  })
  state.refuse()
  await expect(
    client.orders.get.query({ orderId: "same" }),
  ).rejects.toMatchObject({
    data: { code: "NOT_FOUND" },
  })
  expect(state.counts).toEqual({
    requests: 3,
    contexts: 3,
    legalReads: 3,
    tenantReads: 3,
  })
})

test("private preview input stays in a POST body and mutations retain independent fresh admission", async () => {
  const state = fixture()
  const { client } = await provider()
  const rpc = getUntypedClient(client)
  const [preview, first, second] = await Promise.all([
    rpc.query("storefront.preview", {
      composition: "private-composition-sentinel",
      session: "private-session-sentinel",
    }),
    rpc.mutation("transport.command", { sequence: 1 }),
    rpc.mutation("transport.command", { sequence: 2 }),
  ])
  expect([preview, first, second]).toEqual([
    { accepted: true },
    { sequence: 1 },
    { sequence: 2 },
  ])
  expect(state.requests).toHaveLength(2)
  for (const request of state.requests) {
    expect(request.method).toBe("POST")
    expect(request.headers.has("trpc-accept")).toBe(false)
    expect(request.url).not.toContain("private-")
    expect(request.url).not.toContain("sequence")
  }
  const previewRequest = state.requests.find((request) =>
    new URL(request.url).pathname.includes("storefront.preview"),
  )
  expect(await previewRequest?.text()).toContain("private-session-sentinel")
  // POST commands do not acquire GET-only authority memoization, even batched.
  expect(state.counts.legalReads).toBe(3)
  expect(state.counts.tenantReads).toBe(3)
})

test("an opted-in canceled read retains its abort signal", async () => {
  const state = fixture()
  const { options, queryClient } = await provider()
  const pendingOptions = options.orders.timeline.queryOptions(
    { orderId: "source" },
    { retry: false, trpc: { abortOnUnmount: true } },
  )
  const pending = queryClient.fetchQuery(pendingOptions).catch((error) => error)
  try {
    await state.slowStarted
    await queryClient.cancelQueries({ queryKey: pendingOptions.queryKey })
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(state.requests[0]?.signal.aborted).toBe(true)
    expect(state.counts.requests).toBe(1)
  } finally {
    state.release()
    await pending
  }
})

test("canceling one read does not abort its still-observed batch sibling", async () => {
  const state = fixture()
  const { options, queryClient } = await provider()
  const firstOptions = options.orders.timeline.queryOptions(
    { orderId: "first" },
    { retry: false, trpc: { abortOnUnmount: true } },
  )
  const secondOptions = options.orders.timeline.queryOptions(
    { orderId: "second" },
    { retry: false, trpc: { abortOnUnmount: true } },
  )
  const first = queryClient.fetchQuery(firstOptions).catch((error) => error)
  const second = queryClient.fetchQuery(secondOptions)
  try {
    await state.slowStarted
    await queryClient.cancelQueries({ queryKey: firstOptions.queryKey })
    expect(state.requests[0]?.signal.aborted).toBe(false)
    expect(queryClient.getQueryState(secondOptions.queryKey)?.status).toBe(
      "pending",
    )
    state.release()
    expect(await second).toEqual(timeline)
    expect(state.counts.requests).toBe(1)
  } finally {
    state.release()
    await Promise.allSettled([first, second])
  }
})
