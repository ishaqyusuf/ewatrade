import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { createTRPCUntypedClient } from "@trpc/client"
import { initTRPC } from "@trpc/server"
import { observable } from "@trpc/server/observable"
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query"
import { Fragment, act, createElement, useLayoutEffect } from "react"
import type { MobileSession } from "../session-store"

// Mount the actual runtime and real native adapter. Only native, auth, query and
// transport dependencies are isolated. Run through the child-process wrapper:
// Bun module stand-ins are process-wide. No collector, network or DB is used.
const source = new URL("../../", import.meta.url)
function standIn(path: string, exports: Record<string, unknown>) {
  mock.module(new URL(path, source).pathname, () => exports)
}
const { createNativeAnalytics: createRealNativeAnalytics } = await import(
  "../../../../../packages/events/src/native"
)
const realQueryExports = { ...(await import("@tanstack/react-query")) }
const RealQueryClient = realQueryExports.QueryClient
let queryClient = new RealQueryClient()
type NativeOptions = Parameters<typeof createRealNativeAnalytics>[0]
type NativeClient = ReturnType<typeof createRealNativeAnalytics>
type NativeBatch = Parameters<NonNullable<NativeOptions["send"]>>[0]
type Identity = {
  isSuccess: boolean
  isFetching: boolean
  data?: {
    enabled: boolean
    context: { token: string; identityKey: string; expiresAt: number } | null
  }
}
type Auth = {
  isAuthenticated: boolean
  profile: { id?: string; businessId?: string } | null
  token: string | null
  session: MobileSession | null
}
let auth: Auth
let liveSession: MobileSession | null
let cacheGeneration = 0
let sessionGeneration = 0
let identity: Identity
let keyedIdentity: Map<string, Identity> | null
let development = false
const platform = { OS: "android" }
const constants = {
  expoConfig: {
    version: "1.0.0",
    extra: { mobileAnalyticsEnvironment: "production" as unknown },
  },
  nativeBuildVersion: "42",
}
const sent: NativeBatch[] = []
const clients: Array<{
  options: NativeOptions
  client: NativeClient
  destroyed: boolean
  tracked: number
}> = []
const queryKeys: unknown[][] = []
const operations: Array<{
  path: string
  type: string
  input: unknown
  context: unknown
}> = []
const fixtureTRPC = initTRPC.create()
const fixtureRouter = fixtureTRPC.router({
  tenant: fixtureTRPC.router({
    analyticsContext: fixtureTRPC.procedure.query((): Identity["data"] => {
      throw Error("No server procedure is executed by the inert transport")
    }),
  }),
})
const inertClient = createTRPCUntypedClient<typeof fixtureRouter>({
  links: [
    () =>
      ({ op }) =>
        observable((observer) => {
          operations.push({
            path: op.path,
            type: op.type,
            input: structuredClone(op.input),
            context: structuredClone(op.context),
          })
          observer.next({
            result: {
              data: eligible(`${auth.profile?.id}:${auth.profile?.businessId}`)
                .data,
            },
          })
          observer.complete()
        }),
  ],
})
const trpcOptions = createTRPCOptionsProxy<typeof fixtureRouter>({
  client: inertClient,
  queryClient: () => queryClient,
})
type RuntimeQueryOptions = ReturnType<
  typeof trpcOptions.tenant.analyticsContext.queryOptions
> & { enabled?: boolean }
const capturedOptions: RuntimeQueryOptions[] = []
const listeners = new Set<(state: string) => void>()
const values = new Map<string, string>()
let transportCalls = 0
let collectorUnavailable = false
let adapterFailure: Error | undefined
let sequence = 0
const originalFetch = globalThis.fetch
const environmentKeys = [
  "EXPO_PUBLIC_LOGLY_ENABLED",
  "EXPO_PUBLIC_LOGLY_PROJECT",
  "EXPO_PUBLIC_LOGLY_ENDPOINT",
] as const
const originalEnvironment = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]]),
)
Object.defineProperty(globalThis, "__DEV__", {
  configurable: true,
  get: () => development,
})
standIn("hooks/use-auth", { useAuthContext: () => auth })
// Independent synchronous ports: change durable auth/cache lifetime without a
// React render. The server eligibility response remains the only positive proof.
standIn("lib/session-store", {
  getSession: () => liveSession,
  getSessionGeneration: () => sessionGeneration,
})
standIn("trpc/client", {
  useTRPC: () => trpcOptions,
  getDataCacheGeneration: () => cacheGeneration,
})
mock.module("@tanstack/react-query", () => ({
  ...realQueryExports,
  useQuery: (options: RuntimeQueryOptions) => {
    capturedOptions.push(options)
    queryKeys.push(structuredClone(options.queryKey))
    return keyedIdentity
      ? (keyedIdentity.get(JSON.stringify(options.queryKey)) ?? pending())
      : identity
  },
}))
mock.module("expo-constants", () => ({ default: constants }))
mock.module("expo-crypto", () => ({ randomUUID: () => `id-${++sequence}` }))
mock.module("expo-router", () => ({ useSegments: () => ["(admin)", "orders"] }))
mock.module("expo-secure-store", () => ({
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  deleteItemAsync: async (key: string) => {
    values.delete(key)
  },
}))
mock.module("react-native", () => ({
  Platform: platform,
  AppState: {
    addEventListener: (_event: string, callback: (state: string) => void) => {
      listeners.add(callback)
      return { remove: () => listeners.delete(callback) }
    },
  },
}))
mock.module("@ewatrade/events/native", () => ({
  createNativeAnalytics: (options: NativeOptions) => {
    const client = createRealNativeAnalytics({
      ...options,
      send: async (batch) => {
        sent.push(structuredClone(batch))
        if (collectorUnavailable) throw Error("Collector unavailable")
      },
    })
    const record = { options, client, destroyed: false, tracked: 0 }
    const track = client.track
    client.track = (...args) => {
      record.tracked++
      if (adapterFailure) throw adapterFailure
      track(...args)
    }
    const destroy = client.destroy
    client.destroy = () => {
      record.destroyed = true
      destroy()
    }
    clients.push(record)
    return client
  },
}))
const { AnalyticsRuntime, trackProductEvent, trackMobileActivity } =
  await import("../../runtime/analytics-runtime")
const pending = (): Identity => ({ isSuccess: false, isFetching: true })
function eligible(owner = "actor-a:business-a"): Identity {
  return {
    isSuccess: true,
    isFetching: false,
    data: {
      enabled: true,
      context: {
        token: `proof-${owner}`,
        identityKey: owner,
        expiresAt: Date.now() + 900_000,
      },
    },
  }
}
let close: (() => Promise<void>) | undefined
beforeEach(() => {
  development = false
  platform.OS = "android"
  constants.expoConfig.extra.mobileAnalyticsEnvironment = "production"
  process.env.EXPO_PUBLIC_LOGLY_ENABLED = "true"
  process.env.EXPO_PUBLIC_LOGLY_PROJECT = "ewatrade-mobile"
  process.env.EXPO_PUBLIC_LOGLY_ENDPOINT =
    "https://ewatrade.com/api/analytics/mobile"
  auth = {
    isAuthenticated: true,
    profile: { id: "actor-a", businessId: "business-a" },
    token: "session-a",
    session: {
      token: "session-a",
      profile: {
        id: "actor-a",
        businessId: "business-a",
        name: "Fixture actor",
        email: "fixture@example.invalid",
      },
    },
  }
  liveSession = structuredClone(auth.session)
  cacheGeneration = 0
  sessionGeneration = 0
  identity = eligible()
  keyedIdentity = null
  sent.length =
    clients.length =
    queryKeys.length =
    capturedOptions.length =
    operations.length =
      0
  queryClient = new RealQueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
    },
  })
  listeners.clear()
  values.clear()
  transportCalls = 0
  collectorUnavailable = false
  adapterFailure = undefined
  globalThis.fetch = Object.assign(
    async () => {
      transportCalls++
      throw Error("No network is permitted")
    },
    { preconnect: originalFetch.preconnect },
  )
})
afterEach(async () => {
  await close?.()
  close = undefined
  queryClient.clear()
  expect(transportCalls).toBe(0)
  globalThis.fetch = originalFetch
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

async function mount() {
  const { DOMImplementation } = await import("@xmldom/xmldom")
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
  Object.assign(globalThis, {
    window,
    document,
    IS_REACT_ACT_ENVIRONMENT: true,
  })
  Object.assign(document, {
    defaultView: window,
    addEventListener() {},
    removeEventListener() {},
  })
  const create = document.createElement.bind(document)
  document.createElement = (name: string) =>
    Object.assign(create(name), {
      style: {},
      addEventListener() {},
      removeEventListener() {},
    })
  const host = document.createElement("div")
  document.documentElement?.appendChild(host)
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(host as unknown as HTMLElement)
  function LayoutProbe({ beforeCleanup }: { beforeCleanup?: () => void }) {
    useLayoutEffect(() => beforeCleanup?.())
    return null
  }
  close = async () => {
    await act(async () => root.unmount())
  }
  const render = async (beforeCleanup?: () => void) => {
    auth.session =
      auth.isAuthenticated && auth.token && auth.profile?.id
        ? {
            token: auth.token,
            profile: {
              id: auth.profile.id,
              businessId: auth.profile.businessId,
              name: "Fixture actor",
              email: "fixture@example.invalid",
            },
          }
        : null
    liveSession = structuredClone(auth.session)
    await act(async () => {
      root.render(
        createElement(
          Fragment,
          null,
          createElement(AnalyticsRuntime),
          createElement(LayoutProbe, { beforeCleanup }),
        ),
      )
    })
  }
  await render()
  return { render }
}

for (const [label, deny] of [
  [
    "release preview despite enable=true",
    () => {
      constants.expoConfig.extra.mobileAnalyticsEnvironment = "disabled"
    },
  ],
  [
    "Preview metadata",
    () => {
      constants.expoConfig.extra.mobileAnalyticsEnvironment = "preview"
    },
  ],
  [
    "missing explicit environment",
    () => {
      constants.expoConfig.extra.mobileAnalyticsEnvironment = undefined
    },
  ],
  [
    "unknown explicit environment",
    () => {
      constants.expoConfig.extra.mobileAnalyticsEnvironment = "unknown"
    },
  ],
  [
    "development",
    () => {
      development = true
    },
  ],
  [
    "iOS",
    () => {
      platform.OS = "ios"
    },
  ],
  [
    "missing authentication",
    () => {
      auth.isAuthenticated = false
    },
  ],
  [
    "missing profile",
    () => {
      auth.profile = null
    },
  ],
  [
    "missing actor",
    () => {
      auth.profile = { businessId: "business-a" }
    },
  ],
  [
    "unresolved eligibility",
    () => {
      identity = pending()
    },
  ],
  [
    "denied eligibility",
    () => {
      identity = {
        isSuccess: true,
        isFetching: false,
        data: { enabled: false, context: null },
      }
    },
  ],
  [
    "eligibility refreshing with cached success",
    () => {
      identity = { ...eligible(), isFetching: true }
    },
  ],
  [
    "enable=false",
    () => {
      process.env.EXPO_PUBLIC_LOGLY_ENABLED = "false"
    },
  ],
  [
    "wrong project",
    () => {
      process.env.EXPO_PUBLIC_LOGLY_PROJECT = "ewatrade-dashboard"
    },
  ],
  [
    "Preview endpoint",
    () => {
      process.env.EXPO_PUBLIC_LOGLY_ENDPOINT =
        "https://preview.ewatrade.com/api/analytics/mobile"
    },
  ],
] as const) {
  test(`mounted runtime refuses ${label}`, async () => {
    deny()
    await mount()
    trackProductEvent("mobile_sale_started", { surface: "mobile" })
    trackMobileActivity({
      name: "mobile_sale_started",
      properties: { category: "quick_sale" },
    })
    expect(clients).toHaveLength(0)
    expect(sent).toHaveLength(0)
    expect(listeners.size).toBe(0)
    expect(values.size).toBe(0)
  })
}

test("explicitly eligible Production mounts the actual adapter and cleans up helper/listener", async () => {
  await mount()
  expect(clients).toHaveLength(1)
  expect(listeners.size).toBe(1)
  expect(
    sent.flatMap((batch) => batch.events.map((event) => event.name)),
  ).toEqual(["app_session", "screen_view"])
  expect(
    sent.every((batch) =>
      batch.events.every(
        (event) => event.analyticsContext === "proof-actor-a:business-a",
      ),
    ),
  ).toBe(true)
  trackProductEvent("mobile_sale_started", { surface: "mobile" })
  await clients[0].client.flush()
  expect(
    sent.flatMap((batch) => batch.events.map((event) => event.name)),
  ).toContain("mobile_sale_started")
  const calls = clients[0].tracked
  const batches = sent.length
  await close?.()
  close = undefined
  trackProductEvent("mobile_sale_started")
  trackMobileActivity({
    name: "mobile_sale_started",
    properties: { category: "quick_sale" },
  })
  expect(clients[0].tracked).toBe(calls)
  expect(sent).toHaveLength(batches)
  expect(clients[0].destroyed).toBe(true)
  expect(listeners.size).toBe(0)
})

for (const [label, deny] of [
  [
    "logout",
    () => {
      auth.isAuthenticated = false
    },
  ],
  [
    "disabled switch",
    () => {
      process.env.EXPO_PUBLIC_LOGLY_ENABLED = "false"
    },
  ],
  [
    "permission denial",
    () => {
      identity = {
        isSuccess: true,
        isFetching: false,
        data: { enabled: false, context: null },
      }
    },
  ],
  [
    "identity refetch",
    () => {
      identity = { ...eligible(), isFetching: true }
    },
  ],
] as const) {
  test(`render-time ${label} closes permission before passive cleanup`, async () => {
    const mounted = await mount()
    const old = clients[0]
    const count = sent.length
    deny()
    let checked = false
    await mounted.render(() => {
      checked = true
      expect(old.destroyed).toBe(false)
      expect(old.options.permission?.()).toBe(false)
      trackProductEvent("mobile_sale_submitted")
      for (const listener of listeners) listener("active")
      void old.client.flush()
      expect(sent).toHaveLength(count)
    })
    expect(checked).toBe(true)
    expect(old.destroyed).toBe(true)
    expect(sent).toHaveLength(count)
    expect(listeners.size).toBe(0)
    const calls = old.tracked
    trackProductEvent("mobile_sale_result")
    expect(old.tracked).toBe(calls)
  })
}

for (const change of ["actor", "business"] as const) {
  test(`${change} change partitions identity query and cannot reuse the cached proof`, async () => {
    keyedIdentity = new Map()
    const mounted = await mount()
    const originalKey = JSON.stringify(queryKeys.at(-1))
    keyedIdentity.set(originalKey, eligible())
    await mounted.render()
    expect(clients).toHaveLength(1)
    const old = clients[0]
    const count = sent.length
    auth.profile = {
      id: change === "actor" ? "actor-b" : "actor-a",
      businessId: change === "business" ? "business-b" : "business-a",
    }
    await mounted.render(() => {
      expect(old.options.permission?.()).toBe(false)
      trackProductEvent("mobile_sale_submitted")
      expect(sent).toHaveLength(count)
    })
    const changedKey = JSON.stringify(queryKeys.at(-1))
    expect(changedKey).not.toBe(originalKey)
    expect(old.destroyed).toBe(true)
    expect(clients).toHaveLength(1)
    expect(sent).toHaveLength(count)
    const newOwner = `${auth.profile.id}:${auth.profile.businessId}`
    keyedIdentity.set(changedKey, eligible(newOwner))
    await mounted.render()
    expect(clients).toHaveLength(2)
    const newEvents = sent.slice(count).flatMap((batch) => batch.events)
    expect(newEvents.length).toBeGreaterThan(0)
    expect(
      newEvents.every(
        (event) => event.analyticsContext === `proof-${newOwner}`,
      ),
    ).toBe(true)
  })
}

for (const change of [
  "same-actor token",
  "signout",
  "own-to-QA session",
  "cache generation",
] as const) {
  test(`live ${change} retires adapter transmission before React rerenders`, async () => {
    await mount()
    const old = clients[0]
    collectorUnavailable = true
    trackMobileActivity({
      name: "mobile_sale_started",
      properties: { category: "quick_sale" },
    })
    await old.client.flush()
    collectorUnavailable = false
    const count = sent.length
    const oldToken = auth.token
    if (change === "signout") liveSession = null
    else if (change === "cache generation") cacheGeneration++
    else {
      if (!liveSession) throw Error("Missing fixture session")
      liveSession = {
        ...liveSession,
        token:
          change === "same-actor token" ? "session-b" : "derived-QA-session",
        profile: {
          ...liveSession.profile,
          businessId:
            change === "own-to-QA session" ? "qa-business" : "business-a",
        },
      }
    }
    // Auth's rendered snapshot and its positive server eligibility are retained.
    // No local field grants QA eligibility; the old server proof must retire.
    expect(auth.token).toBe(oldToken)
    expect(identity.data?.enabled).toBe(true)
    expect(old.destroyed).toBe(false)
    for (const listener of listeners) listener("active")
    await old.client.flush()
    trackMobileActivity({
      name: "mobile_sale_result",
      properties: { category: "quick_sale", status: "saved" },
    })
    await old.client.flush()
    for (const listener of listeners) listener("active")
    await old.client.flush()
    expect({
      permitted: old.options.permission?.(),
      transmitted: sent
        .slice(count)
        .flatMap((batch) => batch.events.map((event) => event.name)),
    }).toEqual({ permitted: false, transmitted: [] })
  })
}

test("session generation ABA closes queued retry and new tracking before React rerenders", async () => {
  await mount()
  const old = clients[0]
  collectorUnavailable = true
  trackMobileActivity({
    name: "mobile_sale_started",
    properties: { category: "quick_sale" },
  })
  await old.client.flush()
  collectorUnavailable = false
  const count = sent.length
  const originalSession = structuredClone(liveSession)
  // updateAccessProfile may write false then true with the same final session,
  // without a cache clear or intervening AnalyticsRuntime render.
  sessionGeneration += 2
  expect(liveSession).toEqual(originalSession)
  expect(cacheGeneration).toBe(0)
  expect(old.destroyed).toBe(false)
  for (const listener of listeners) listener("active")
  await old.client.flush()
  trackMobileActivity({
    name: "mobile_sale_result",
    properties: { category: "quick_sale", status: "saved" },
  })
  await old.client.flush()
  expect({
    permitted: old.options.permission?.(),
    transmitted: sent.slice(count).flatMap((batch) => batch.events),
  }).toEqual({ permitted: false, transmitted: [] })
})

test("restored identical session generation needs fresh server proof without exposing its token", async () => {
  keyedIdentity = new Map()
  const mounted = await mount()
  const originalKey = JSON.stringify(queryKeys.at(-1))
  keyedIdentity.set(originalKey, eligible())
  await mounted.render()
  const old = clients[0]
  const count = sent.length
  sessionGeneration += 2
  await mounted.render()
  const changedKey = JSON.stringify(queryKeys.at(-1))
  expect(changedKey).not.toBe(originalKey)
  expect(changedKey).not.toContain("session-a")
  expect(changedKey).not.toContain("proof-")
  expect(cacheGeneration).toBe(0)
  expect(old.destroyed).toBe(true)
  expect(clients).toHaveLength(1)
  trackMobileActivity({
    name: "mobile_sale_result",
    properties: { category: "catalog", status: "saved" },
  })
  await old.client.flush()
  expect(sent).toHaveLength(count)
  // The same account can resume only after this new cache partition receives
  // an explicit positive server response.
  keyedIdentity.set(changedKey, eligible())
  await mounted.render()
  expect(clients).toHaveLength(2)
  trackMobileActivity({
    name: "mobile_sale_started",
    properties: { category: "catalog" },
  })
  await clients[1].client.flush()
  const recovered = sent.slice(count).flatMap((batch) => batch.events)
  expect(recovered.map((event) => event.name)).toContain("mobile_sale_started")
  expect(
    recovered.every(
      (event) => event.analyticsContext === "proof-actor-a:business-a",
    ),
  ).toBe(true)
  expect(JSON.stringify(recovered)).not.toContain("session-a")
})

test("typed mobile activity reaches the real native wire with generated safe metadata", async () => {
  await mount()
  trackMobileActivity({
    name: "mobile_sale_result",
    properties: { category: "quick_sale", status: "saved" },
  })
  trackMobileActivity({
    name: "mobile_sale_result",
    properties: { category: "catalog", status: "queued" },
  })
  await clients[0].client.flush()
  const results = sent
    .flatMap((batch) => batch.events)
    .filter((event) => event.name === "mobile_sale_result")
  expect(results).toHaveLength(2)
  expect(results.map((event) => event.properties)).toEqual([
    {
      surface: "mobile",
      category: "quick_sale",
      status: "saved",
      success: true,
    },
    {
      surface: "mobile",
      category: "catalog",
      status: "queued",
      success: false,
    },
  ])
  expect(
    results.every(
      (event) => event.analyticsContext === "proof-actor-a:business-a",
    ),
  ).toBe(true)
})

test("untyped private extras and malformed getters never reach the active adapter", async () => {
  await mount()
  const tracked = clients[0].tracked
  const batches = sent.length
  const invalidInputs: unknown[] = [
    {
      name: "mobile_sale_result",
      properties: {
        category: "quick_sale",
        status: "saved",
        description: "Private purchase detail",
      },
    },
    {
      name: "mobile_payment_account_selected",
      properties: {
        category: "bank_transfer",
        moneyAccountId: "private-account",
      },
    },
    {
      name: "mobile_stock_result",
      properties: {
        action: "receipt",
        status: "recorded",
        amountMinor: 75_000,
      },
    },
    {
      name: "mobile_sale_result",
      properties: { category: "catalog", status: "saved", success: true },
    },
    {
      name: "mobile_sale_started",
      properties: { category: "catalog" },
      orderId: "private-order",
    },
    Object.defineProperty({ name: "mobile_sale_started" }, "properties", {
      get: () => {
        throw Error("Unavailable metadata")
      },
    }),
  ]
  for (const input of invalidInputs)
    expect(() =>
      Reflect.apply(trackMobileActivity, undefined, [input]),
    ).not.toThrow()
  expect(clients[0].tracked).toBe(tracked)
  expect(sent).toHaveLength(batches)
})

test("an adapter exception cannot change the tracking caller's successful result", async () => {
  await mount()
  const batches = sent.length
  adapterFailure = new Error("Inert adapter failure")
  let completed = false
  function caller() {
    const result = {
      state: "saved",
      canonicalReference: "caller-owned-reference",
    }
    trackMobileActivity({
      name: "mobile_sale_result",
      properties: { category: "catalog", status: "saved" },
    })
    completed = true
    return result
  }
  expect(caller()).toEqual({
    state: "saved",
    canonicalReference: "caller-owned-reference",
  })
  expect(completed).toBe(true)
  expect(sent).toHaveLength(batches)
})

test("actual native collector failure leaves a typed tracking caller independent", async () => {
  await mount()
  collectorUnavailable = true
  let completed = false
  function caller() {
    trackMobileActivity({
      name: "mobile_stock_result",
      properties: { action: "receipt", status: "recorded" },
    })
    completed = true
    return "recorded-reference"
  }
  expect(caller()).toBe("recorded-reference")
  await clients[0].client.flush()
  expect(completed).toBe(true)
  const event = sent
    .flatMap((batch) => batch.events)
    .find((event) => event.name === "mobile_stock_result")
  expect(event?.properties).toEqual({
    surface: "mobile",
    action: "receipt",
    status: "recorded",
    success: true,
  })
})

test("denial discards failed queued work and does not replay it when eligibility returns", async () => {
  collectorUnavailable = true
  const mounted = await mount()
  trackProductEvent("before_denial")
  await clients[0].client.flush()
  expect(
    sent.flatMap((batch) => batch.events.map((event) => event.name)),
  ).toContain("before_denial")
  identity = {
    isSuccess: true,
    isFetching: false,
    data: { enabled: false, context: null },
  }
  await mounted.render(() => {
    trackProductEvent("during_denial")
  })
  const deniedBoundary = sent.length
  trackProductEvent("after_denial")
  collectorUnavailable = false
  identity = eligible()
  await mounted.render()
  trackProductEvent("after_recovery")
  await clients.at(-1)?.client.flush()
  const recoveredEvents = sent
    .slice(deniedBoundary)
    .flatMap((batch) => batch.events.map((event) => event.name))
  expect(recoveredEvents).toContain("after_recovery")
  expect(recoveredEvents).not.toContain("before_denial")
  expect(recoveredEvents).not.toContain("during_denial")
  expect(recoveredEvents).not.toContain("after_denial")
})

for (const change of ["actor", "business"] as const) {
  test(`actual tRPC transport preserves path/input while ${change} partitions QueryClient cache`, async () => {
    identity = pending()
    const mounted = await mount()
    const original = capturedOptions.at(-1)
    if (!original) throw Error("Runtime did not produce query options")
    expect(original.queryKey).toHaveLength(2)
    const originalProof = await queryClient.fetchQuery({
      ...original,
      staleTime: Number.POSITIVE_INFINITY,
    })
    expect(originalProof?.context?.token).toBe("proof-actor-a:business-a")
    expect(operations).toHaveLength(1)
    expect(operations[0]).toMatchObject({
      path: "tenant.analyticsContext",
      type: "query",
      input: undefined,
    })
    expect(JSON.stringify(operations[0])).not.toContain("mobileAnalyticsOwner")
    expect(JSON.stringify(operations[0])).not.toContain("actor-a")
    expect(JSON.stringify(operations[0])).not.toContain("business-a")
    await queryClient.fetchQuery({
      ...original,
      staleTime: Number.POSITIVE_INFINITY,
    })
    expect(operations).toHaveLength(1)
    auth.profile = {
      id: change === "actor" ? "actor-b" : "actor-a",
      businessId: change === "business" ? "business-b" : "business-a",
    }
    await mounted.render()
    const changed = capturedOptions.at(-1)
    if (!changed) throw Error("Runtime did not produce changed query options")
    expect(changed.queryKey).toHaveLength(2)
    expect(changed.queryKey).not.toEqual(original.queryKey)
    expect(queryClient.getQueryData(changed.queryKey)).toBeUndefined()
    const changedProof = await queryClient.fetchQuery({
      ...changed,
      staleTime: Number.POSITIVE_INFINITY,
    })
    expect(changedProof?.context?.token).toBe(
      `proof-${auth.profile.id}:${auth.profile.businessId}`,
    )
    expect(operations).toHaveLength(2)
    expect(operations[1]).toMatchObject({
      path: "tenant.analyticsContext",
      type: "query",
      input: undefined,
    })
    expect(JSON.stringify(operations[1])).not.toContain("mobileAnalyticsOwner")
    expect(JSON.stringify(operations[1])).not.toContain("actor-b")
    expect(JSON.stringify(operations[1])).not.toContain("business-b")
    expect(queryClient.getQueryData(original.queryKey)).toEqual(originalProof)
    expect(queryClient.getQueryData(changed.queryKey)).toEqual(changedProof)
    expect(clients).toHaveLength(0)
  })
}
