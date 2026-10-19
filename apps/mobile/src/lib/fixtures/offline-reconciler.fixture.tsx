import { expect, mock, test } from "bun:test"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  type MobileActivityInput,
  mobileActivityInputSchema,
} from "@ewatrade/events/mobile-activity"
import {
  QueryClient,
  type QueryFilters,
  QueryObserver,
} from "@tanstack/query-core"
import {
  Fragment,
  type ReactNode,
  act,
  createElement,
  useEffect,
  useRef,
} from "react"
import ts from "typescript"
import {
  type OfflineConflictRow,
  recoveryDecisionAccess,
  recoverySummary,
} from "../../components/mobile/offline-recovery-review-model"
import {
  registerInput,
  replayInput,
  replayableBatch,
} from "../offline-replay-client"
import type { MobileSession } from "../session-store"

// Exact source seam: parse the current non-exported layout function, remove
// TypeScript syntax, and evaluate that unchanged body with controlled ports.
// This avoids executing root-layout fonts, CSS, Sentry or native initialization.
// React effects and the actual Zustand/session/persistence modules still run.
const sourcePath = new URL("../../app/_layout.tsx", import.meta.url).pathname
const source = await Bun.file(sourcePath).text()
const parsed = ts.createSourceFile(
  sourcePath,
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
)
const declaration = parsed.statements.find(
  (node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) &&
    node.name?.text === "OfflinePolicyReconciler",
)
if (!declaration)
  throw Error("Actual OfflinePolicyReconciler declaration missing")
const executable = ts.transpileModule(declaration.getText(parsed), {
  compilerOptions: {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.None,
  },
}).outputText

const secure = new Map<string, string>()
const persisted = new Map<string, string>()
let nonce = 0
mock.module("expo-crypto", () => ({
  randomUUID: () => `reconciler-${++nonce}`,
}))
mock.module("expo-secure-store", () => ({
  getItem: (key: string) => secure.get(key) ?? null,
  setItem: (key: string, value: string) => {
    secure.set(key, value)
  },
  deleteItemAsync: async (key: string) => {
    secure.delete(key)
  },
}))
mock.module("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => persisted.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      persisted.set(key, value)
    },
    removeItem: async (key: string) => {
      persisted.delete(key)
    },
  },
}))
Object.assign(globalThis, { __DEV__: false })
const { getSession, setSession } = await import("../session-store")
const {
  useOfflineCommandStore,
  pendingOfflineCommands,
  activeBusinessOfflineCommands,
} = await import("../../store/offlineCommandStore")
const { useOperationalModeStore, getOperationalModeGeneration } = await import(
  "../../store/operationalModeStore"
)
await useOfflineCommandStore.persist.rehydrate()
await useOperationalModeStore.persist.rehydrate()

const actorA: MobileSession["profile"] = {
  id: "actor-a",
  businessId: "business-a",
  storeId: "store-a",
  name: "Actor A",
  email: "actor-a@example.test",
  role: "OWNER",
}
const actorB = { ...actorA, id: "actor-b" }
const storeB = { ...actorA, storeId: "store-b" }
const businessB = { ...actorA, businessId: "business-b", storeId: "store-b" }
function session(profile = actorA) {
  cache.clearMobileDataCache()
  setSession({ profile, token: "inert-session-token" })
}
function queue(id = "shared-client-identity", description = "Rice") {
  useOfflineCommandStore.getState().queueCommand({
    clientCommandId: id,
    dependencyClientIds: [],
    eventVersion: 1,
    createdAtClient: new Date("2026-10-17T10:00:00.000Z"),
    payload: {
      kind: "commercial_order",
      lines: [{ custom: "quick_sale", amountMinor: 500, description }],
    },
  })
}
type ReplayInput = ReturnType<typeof replayInput>
type Result = RouterOutputs["offline"]["replay"][number]
type Call = {
  kind: "register" | "replay"
  profile: MobileSession["profile"] | undefined
  input: unknown
}
const calls: Call[] = []
const invalidated: unknown[] = []
let settings = { enabled: true, approvalRequired: false }
let settingsUpdatedAt = 123
let registerResult: (input: unknown) => Promise<unknown> = async () => ({})
let replayResult: (input: ReplayInput) => Promise<Result[]> = async () => []
let reviewResult: (input: unknown) => Promise<Result> = async () => {
  throw Error("Review outside fixture")
}
type DecisionReceipt = RouterOutputs["offline"]["decideRecovery"]
const decisions: unknown[] = []
const activities: MobileActivityInput[] = []
let trackerFailure = false
let decisionResult: (input: unknown) => Promise<DecisionReceipt> =
  async () => ({ clientCommandId: "held-sale", status: "approved" })
function serverResults(
  input: ReplayInput,
  actor = getSession()?.profile.id ?? "signed-out",
): Result[] {
  return input.commands.map((command) => ({
    authoritativeState: null,
    clientCommandId: command.clientCommandId,
    conflictCode: null,
    conflictMessage: null,
    createdAtClient: command.createdAtClient,
    dependencyClientIds: command.dependencyClientIds,
    id: `server-${command.clientCommandId}`,
    payload: {
      ...JSON.parse(JSON.stringify(command.payload)),
      actorUserId: actor,
    },
    processedAt: new Date(),
    result: { id: `order-${actor}` },
    status: "APPLIED",
    type: "COMMERCIAL_ORDER",
  }))
}
function procedure(kind: string) {
  return {
    queryOptions: () => ({ kind }),
    mutationOptions: () => ({ kind }),
    queryFilter: () => ({ queryKey: [kind] }),
    pathFilter: () => ({ queryKey: [kind] }),
  }
}
const trpc = {
  offline: {
    settings: procedure("settings"),
    registerDevice: procedure("register"),
    replay: procedure("replay"),
    conflicts: procedure("conflicts"),
    review: procedure("review"),
    decideRecovery: procedure("decideRecovery"),
  },
  stores: { orderVisibility: procedure("visibility") },
  catalog: {
    listItems: procedure("items"),
    listItemsPage: procedure("itemsPage"),
  },
  orders: {
    list: procedure("orders"),
    listPage: procedure("ordersPage"),
    reportSummary: procedure("summary"),
    customerCount: procedure("customers"),
    paymentAccounts: procedure("paymentAccounts"),
  },
  inventory: { balanceReport: procedure("stock") },
  finance: {
    balances: procedure("finance"),
    moneyAccounts: procedure("accounts"),
  },
  tenant: { featureAvailability: procedure("availability") },
  services: {
    queue: procedure("services"),
    queuePage: procedure("servicesPage"),
  },
}
const mutations = {
  decideRecovery: {
    mutateAsync: (input: unknown) => {
      decisions.push(structuredClone(input))
      return decisionResult(input)
    },
    isPending: false,
    error: null,
  },
  review: {
    mutateAsync: (input: unknown) => reviewResult(input),
    isPending: false,
    error: null,
  },
  register: {
    mutateAsync: async (input: unknown) => {
      calls.push({
        kind: "register",
        profile: getSession()?.profile,
        input: structuredClone(input),
      })
      return registerResult(input)
    },
  },
  replay: {
    mutateAsync: async (input: ReplayInput) => {
      calls.push({
        kind: "replay",
        profile: getSession()?.profile,
        input: structuredClone(input),
      })
      return replayResult(input)
    },
  },
}
let invalidationResult: (
  filter: unknown,
  options?: { throwOnError?: boolean },
) => Promise<void> = async () => {}
const queryClient = {
  invalidateQueries: async (
    filter: unknown,
    options?: { throwOnError?: boolean },
  ) => {
    invalidated.push(filter)
    return invalidationResult(filter, options)
  },
}
mock.module("expo-constants", () => ({
  default: { expoConfig: { version: "fixture" } },
}))
mock.module("react-native", () => ({ Platform: { OS: "android" } }))
mock.module(new URL("../../hooks/use-auth", import.meta.url).pathname, () => ({
  useAuthContext: () => ({
    profile: getSession()?.profile,
    isAuthenticated: Boolean(getSession()),
  }),
}))
mock.module("@tanstack/react-query", () => ({
  useMutation: ({ kind }: { kind: keyof typeof mutations }) => mutations[kind],
  useQueryClient: () => queryClient,
  QueryClientProvider: () => null,
  isServer: false,
}))
mock.module("@trpc/tanstack-react-query", () => ({
  createTRPCContext: () => ({ TRPCProvider: () => null, useTRPC: () => trpc }),
}))
mock.module(
  new URL("../../trpc/query-client", import.meta.url).pathname,
  () => ({
    makeQueryClient: () => {
      throw Error("Actual network QueryClient creation is forbidden")
    },
  }),
)
// Use the real client generation functions: session changes below explicitly
// clear the cache just as useCreateAuthContext's session boundary does.
const cache = await import("../../trpc/client")
mock.module(
  new URL("../../runtime/analytics-runtime", import.meta.url).pathname,
  () => ({
    trackMobileActivity: (event: MobileActivityInput) => {
      if (trackerFailure) throw Error("Inert tracker failure")
      activities.push(structuredClone(event))
    },
  }),
)
const { useOfflineReplay } = await import("../../hooks/use-offline-replay")
type ReplayModel = ReturnType<typeof useOfflineReplay>
const models = new Map<string, ReplayModel>()
function Probe({ id }: { id: string }) {
  models.set(id, useOfflineReplay())
  return null
}
const bindings = {
  useEffect,
  useRef,
  useSegments: () => [],
  isCustomerShellPath: () => false,
  useAuthContext: () => ({
    profile: getSession()?.profile,
    isAuthenticated: Boolean(getSession()),
  }),
  useTRPC: () => trpc,
  useQueryClient: () => queryClient,
  useOfflineCommandStore,
  useOperationalModeStore,
  pendingOfflineCommands,
  activeBusinessOfflineCommands,
  useOfflineReplay,
  useQuery: () => ({
    data: settings,
    dataUpdatedAt: settingsUpdatedAt,
    isError: false,
    isPending: false,
  }),
  useMutation: ({ kind }: { kind: keyof typeof mutations }) => mutations[kind],
  registerInput,
  replayInput,
  replayableBatch,
  Constants: { expoConfig: { version: "fixture" } },
  Platform: { OS: "android" },
}
// The implementation is read above; this fixture never keeps a second copy.
const Reconciler = new Function(
  ...Object.keys(bindings),
  `${executable}\nreturn OfflinePolicyReconciler;`,
)(...Object.values(bindings))

function reset() {
  secure.clear()
  persisted.clear()
  calls.length = invalidated.length = 0
  decisions.length = 0
  activities.length = 0
  trackerFailure = false
  session()
  useOfflineCommandStore.setState({
    commands: [],
    deviceIdsByScope: {},
    hasHydrated: true,
  })
  useOperationalModeStore.setState({
    activeBusinessId: null,
    offlineAccessByBusinessId: {},
    isOfflineMode: false,
  })
  settings = { enabled: true, approvalRequired: false }
  settingsUpdatedAt = 123
  registerResult = async () => ({})
  replayResult = async (input) => serverResults(input)
  reviewResult = async () => {
    throw Error("Review outside fixture")
  }
  decisionResult = async () => ({
    clientCommandId: "held-sale",
    status: "approved",
  })
  invalidationResult = async () => {}
  models.clear()
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
async function mount(probes?: string[], extra?: () => ReactNode) {
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
  const ui = {
    render: async () => {
      await act(async () =>
        root.render(
          probes
            ? createElement(
                Fragment,
                null,
                ...probes.map((id) => createElement(Probe, { id, key: id })),
                extra?.(),
              )
            : createElement(Reconciler),
        ),
      )
    },
    run: async (operation: () => unknown) => {
      await act(async () => {
        await operation()
      })
    },
    close: async () => {
      await act(async () => root.unmount())
    },
    model(id = "root") {
      const model = models.get(id)
      if (!model) throw Error(`Missing mounted replay hook ${id}`)
      return model
    },
  }
  await ui.render()
  return ui
}

test("actual reconciler registers, replays and applies one captured current-partition batch", async () => {
  reset()
  queue()
  const ui = await mount()
  try {
    expect(calls.map((call) => call.kind)).toEqual(["register", "replay"])
    expect(calls[0]?.input).toMatchObject({ storeId: "store-a" })
    expect(calls[1]?.input).toMatchObject({ storeId: "store-a" })
    expect(useOfflineCommandStore.getState().commands[0]?.localStatus).toBe(
      "applied",
    )
    expect(invalidated).toHaveLength(15)
    expect(activities).toHaveLength(1)
    expect(activities[0]).toMatchObject({
      name: "mobile_sync_result",
      properties: { status: "completed", item_count: 1 },
    })
    expect(mobileActivityInputSchema.safeParse(activities[0]).success).toBe(
      true,
    )
  } finally {
    await ui.close()
  }
})

for (const [label, profile] of [
  ["actor", actorB],
  ["Store", storeB],
  ["business", businessB],
] as const) {
  test(`switching ${label} while registration is pending prevents the old replay dispatch`, async () => {
    reset()
    queue()
    const registration = deferred<unknown>()
    registerResult = () => registration.promise
    const ui = await mount()
    try {
      expect(calls.map((call) => call.kind)).toEqual(["register"])
      session(profile)
      await ui.render()
      await ui.run(() => registration.resolve({}))
      expect(calls.filter((call) => call.kind === "replay")).toHaveLength(0)
      expect(useOfflineCommandStore.getState().commands[0]?.localStatus).toBe(
        "pending",
      )
    } finally {
      await ui.close()
    }
  })
}

test("A to B to A retires the earlier continuation before a separately captured A run", async () => {
  reset()
  queue()
  const registration = deferred<unknown>()
  registerResult = () => registration.promise
  const ui = await mount()
  try {
    session(actorB)
    await ui.render()
    session()
    await ui.render()
    await ui.run(() => registration.resolve({}))
    expect(calls.map((call) => call.kind)).toEqual([
      "register",
      "register",
      "replay",
    ])
  } finally {
    await ui.close()
  }
})

test("a colliding command signature in a new partition still receives its own sync attempt", async () => {
  reset()
  queue()
  const registration = deferred<unknown>()
  registerResult = () => registration.promise
  replayResult = async () => {
    throw Error("Old scope replay rejected")
  }
  const ui = await mount()
  try {
    await ui.run(() => {
      session(actorB)
      queue("shared-client-identity", "Actor B rice")
    })
    await ui.render()
    await ui.run(() => registration.resolve({}))
    // Even an explicit rerender after the old request settles must not let
    // actor A's identical clientID/status signature suppress actor B's work.
    await ui.render()
    expect(
      calls.filter(
        (call) => call.kind === "register" && call.profile?.id === "actor-b",
      ),
    ).toHaveLength(1)
  } finally {
    await ui.close()
  }
})

test("policy-off filtering cannot borrow another actor's same-ID review status", async () => {
  reset()
  queue()
  const original = useOfflineCommandStore.getState().prepareReplay()
  if (!original) throw Error("Missing original batch")
  const results = serverResults(replayInput(original), "actor-a")
  const held = results[0]
  if (!held) throw Error("Missing original result")
  held.status = "REVIEW_REQUIRED"
  held.conflictCode = "INVALID_COMMAND"
  useOfflineCommandStore.getState().applyScopedReplayResults(results, original)
  session(actorB)
  queue("shared-client-identity", "New pending B sale")
  settings = { enabled: false, approvalRequired: false }
  const ui = await mount()
  try {
    expect(calls.filter((call) => call.kind === "replay")).toHaveLength(0)
  } finally {
    await ui.close()
  }
})

test("a failed registration can retry after an explicit offline to online transition", async () => {
  reset()
  queue()
  let attempts = 0
  registerResult = async () => {
    if (++attempts === 1) throw Error("Connection lost")
    return {}
  }
  const ui = await mount()
  try {
    expect(calls.map((call) => call.kind)).toEqual(["register"])
    await ui.run(() =>
      useOperationalModeStore.getState().setOfflineMode("business-a", true),
    )
    await ui.run(() =>
      useOperationalModeStore.getState().setOfflineMode("business-a", false),
    )
    expect(calls.map((call) => call.kind)).toEqual([
      "register",
      "register",
      "replay",
    ])
    expect(useOfflineCommandStore.getState().commands[0]?.localStatus).toBe(
      "applied",
    )
  } finally {
    await ui.close()
  }
})

test("root and sheet share one coordinator and run only the latest queued request", async () => {
  reset()
  queue("command-one")
  queue("command-two")
  queue("command-three")
  const registration = deferred<unknown>()
  registerResult = () =>
    calls.filter((call) => call.kind === "register").length === 1
      ? registration.promise
      : Promise.resolve({})
  const ui = await mount(["root", "sheet"])
  try {
    let running!: ReturnType<ReplayModel["request"]>
    await ui.run(() => {
      running = ui
        .model()
        .request({ registerFirst: true, include: (id) => id === "command-one" })
    })
    await ui.run(async () => {
      expect(
        await ui.model("sheet").request({
          registerFirst: true,
          include: (id) => id === "command-two",
        }),
      ).toEqual({ status: "queued" })
      expect(
        await ui.model("sheet").request({
          registerFirst: true,
          include: (id) => id === "command-three",
        }),
      ).toEqual({ status: "queued" })
    })
    expect(calls.map((call) => call.kind)).toEqual(["register"])
    await ui.run(() => registration.resolve({}))
    await ui.run(() => running)
    expect(calls.map((call) => call.kind)).toEqual([
      "register",
      "replay",
      "register",
      "replay",
    ])
    expect(
      calls
        .filter((call) => call.kind === "replay")
        .map((call) =>
          (call.input as ReplayInput).commands.map(
            (command) => command.clientCommandId,
          ),
        ),
    ).toEqual([["command-one"], ["command-three"]])
    expect(
      useOfflineCommandStore
        .getState()
        .commands.map((command) => command.localStatus),
    ).toEqual(["applied", "pending", "applied"])
  } finally {
    await ui.close()
  }
})

test("a queued request cannot retarget a later actor/business with a colliding identity", async () => {
  reset()
  queue()
  const registration = deferred<unknown>()
  registerResult = () => registration.promise
  const ui = await mount(["root", "sheet"])
  try {
    let running!: ReturnType<ReplayModel["request"]>
    await ui.run(() => {
      running = ui.model().request({ registerFirst: true })
    })
    session(actorB)
    queue("shared-client-identity", "B sale")
    await ui.render()
    await ui.run(async () => {
      expect(
        await ui.model("sheet").request({
          registerFirst: true,
          include: (id) => id === "shared-client-identity",
        }),
      ).toEqual({ status: "queued" })
    })
    session(businessB)
    queue("shared-client-identity", "Unrequested C sale")
    await ui.render()
    await ui.run(() => registration.resolve({}))
    await ui.run(() => running)
    expect(
      calls.filter((call) => call.profile?.businessId === "business-b"),
    ).toHaveLength(0)
    expect(useOfflineCommandStore.getState().commands[2]?.localStatus).toBe(
      "pending",
    )
  } finally {
    await ui.close()
  }
})

test("a refresh failure after accepted replay never reports that replay itself failed", async () => {
  reset()
  queue()
  invalidationResult = async () => {
    throw Error("Dashboard refresh failed after server commit")
  }
  const ui = await mount(["root"])
  try {
    let outcome: Awaited<ReturnType<ReplayModel["request"]>> | undefined
    await ui.run(async () => {
      outcome = await ui.model().request({ registerFirst: false })
    })
    expect(useOfflineCommandStore.getState().commands[0]?.localStatus).toBe(
      "applied",
    )
    expect(calls.filter((call) => call.kind === "replay")).toHaveLength(1)
    expect(outcome?.status).not.toBe("failed")
  } finally {
    await ui.close()
  }
})

test("cache-generation change during the first refresh await prevents later cache effects", async () => {
  reset()
  queue()
  const refresh = deferred<void>()
  invalidationResult = () =>
    invalidated.length === 1 ? refresh.promise : Promise.resolve()
  const ui = await mount(["root"])
  try {
    let running!: ReturnType<ReplayModel["request"]>
    await ui.run(() => {
      running = ui.model().request({ registerFirst: false })
    })
    expect(invalidated).toHaveLength(1)
    const generation = cache.getDataCacheGeneration()
    session(businessB)
    await ui.render()
    expect(cache.getDataCacheGeneration()).toBeGreaterThan(generation)
    await ui.run(() => refresh.resolve())
    await ui.run(() => running)
    expect(invalidated).toHaveLength(1)
    expect(ui.model().status.status).toBe("retired")
  } finally {
    await ui.close()
  }
})

test("the sheet receives the failure outcome of its queued replay", async () => {
  reset()
  queue("command-one")
  queue("command-two")
  const registration = deferred<unknown>()
  registerResult = () => registration.promise
  replayResult = async (input) => {
    if (
      input.commands.some(
        (command) => command.clientCommandId === "command-two",
      )
    )
      throw Error("Sheet replay refused")
    return serverResults(input)
  }
  const ui = await mount(["root", "sheet"])
  try {
    let running!: ReturnType<ReplayModel["request"]>
    await ui.run(() => {
      running = ui
        .model()
        .request({ registerFirst: true, include: (id) => id === "command-one" })
    })
    await ui.run(async () => {
      expect(
        await ui.model("sheet").request({
          registerFirst: true,
          include: (id) => id === "command-two",
        }),
      ).toEqual({ status: "queued" })
    })
    await ui.run(() => registration.resolve({}))
    await ui.run(() => running)
    expect(useOfflineCommandStore.getState().commands[1]?.localStatus).toBe(
      "pending",
    )
    expect(ui.model("sheet").status.status).toBe("failed")
  } finally {
    await ui.close()
  }
})

function originalResult() {
  const batch = useOfflineCommandStore.getState().prepareReplay()
  if (!batch) throw Error("Missing review batch")
  const result = serverResults(replayInput(batch))[0]
  if (!result) throw Error("Missing reviewed result")
  return result
}

test("normal review preserves accepted business result when refresh throws", async () => {
  reset()
  queue()
  const accepted = originalResult()
  reviewResult = async () => accepted
  invalidationResult = async () => {
    throw Error("Refresh after review failed")
  }
  const ui = await mount(["sheet"])
  try {
    let outcome: Awaited<ReturnType<ReplayModel["reviewCommand"]>> | undefined
    await ui.run(async () => {
      outcome = await ui
        .model("sheet")
        .reviewCommand({ commandId: accepted.id, decision: "approve" })
    })
    expect(outcome).toBe("applied_refresh_failed")
    expect(activities).toEqual([
      {
        name: "mobile_offline_review_result",
        properties: { action: "approve", status: "applied" },
      },
    ])
    expect(useOfflineCommandStore.getState().commands[0]?.localStatus).toBe(
      "applied",
    )
  } finally {
    await ui.close()
  }
})

test("normal review resolving after a scope switch applies and refreshes nothing", async () => {
  reset()
  queue()
  const accepted = originalResult()
  const response = deferred<Result>()
  reviewResult = () => response.promise
  const ui = await mount(["sheet"])
  try {
    let pending!: ReturnType<ReplayModel["reviewCommand"]>
    await ui.run(() => {
      pending = ui
        .model("sheet")
        .reviewCommand({ commandId: accepted.id, decision: "approve" })
    })
    session(actorB)
    queue("shared-client-identity", "B review collision")
    await ui.render()
    await ui.run(() => response.resolve(accepted))
    expect(await pending).toBe("retired")
    expect(
      useOfflineCommandStore
        .getState()
        .commands.map(({ localStatus }) => localStatus),
    ).toEqual(["pending", "pending"])
    expect(invalidated).toHaveLength(0)
  } finally {
    await ui.close()
  }
})

for (const kind of ["replay", "review"] as const) {
  test(`actual QueryObserver refetch failure after ${kind} commit must produce a refresh warning`, async () => {
    reset()
    queue()
    const accepted = originalResult()
    reviewResult = async () => accepted
    const actualClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const observer = new QueryObserver(actualClient, {
      queryKey: ["visibility"],
      initialData: { revision: "before-commit" },
      staleTime: Number.POSITIVE_INFINITY,
      queryFn: async () => {
        throw Error("Actual visibility refetch failed")
      },
    })
    const unsubscribe = observer.subscribe(() => {})
    invalidationResult = (filter, options) =>
      actualClient.invalidateQueries(filter as QueryFilters, options)
    const ui = await mount(["sheet"])
    try {
      let outcome: unknown
      await ui.run(async () => {
        outcome =
          kind === "replay"
            ? await ui.model("sheet").request({ registerFirst: false })
            : await ui
                .model("sheet")
                .reviewCommand({ commandId: accepted.id, decision: "approve" })
      })
      expect(observer.getCurrentResult().isError).toBe(true)
      expect(useOfflineCommandStore.getState().commands[0]?.localStatus).toBe(
        "applied",
      )
      expect(outcome).toEqual(
        kind === "replay"
          ? { status: "applied", refreshFailed: true }
          : "applied_refresh_failed",
      )
    } finally {
      await ui.close()
      unsubscribe()
      actualClient.clear()
    }
  })
}

test("actual sheet review continuation cannot refetch after its initiating refresh lifetime ends", async () => {
  reset()
  queue()
  const accepted = originalResult()
  reviewResult = async () => accepted
  const refresh = deferred<void>()
  invalidationResult = () => refresh.promise
  const ui = await mount(["sheet"])
  try {
    // Extract only this actual sheet callback, leaving all hook logic in its
    // real exported module. No native sheet imports or duplicate callback body.
    const sheetPath = new URL(
      "../../components/mobile/sync-status-sheet.tsx",
      import.meta.url,
    ).pathname
    const sheet = ts.createSourceFile(
      sheetPath,
      await Bun.file(sheetPath).text(),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    let callback: ts.ArrowFunction | undefined
    function visit(node: ts.Node) {
      if (
        ts.isVariableDeclaration(node) &&
        node.name.getText(sheet) === "reviewCommand" &&
        node.initializer &&
        ts.isArrowFunction(node.initializer)
      )
        callback = node.initializer
      ts.forEachChild(node, visit)
    }
    visit(sheet)
    if (!callback) throw Error("Actual sheet review callback missing")
    const callbackCode = ts.transpileModule(
      `const callback = ${callback.getText(sheet)};`,
      {
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.None,
        },
      },
    ).outputText
    let lateRefetches = 0
    const actualCallback = new Function(
      "sync",
      "setReviewRefreshFailed",
      "canManageReviews",
      "conflicts",
      `${callbackCode}\nreturn callback;`,
    )(ui.model("sheet"), () => {}, true, {
      refetch: async () => {
        lateRefetches++
      },
    }) as ReplayModel["reviewCommand"]
    let pending!: ReturnType<ReplayModel["reviewCommand"]>
    await ui.run(() => {
      pending = actualCallback({ commandId: accepted.id, decision: "approve" })
    })
    expect(invalidated).toHaveLength(1)
    session(actorB)
    await ui.render()
    await ui.run(() => refresh.resolve())
    await ui.run(() => pending)
    expect(invalidated).toHaveLength(1)
    expect(lateRefetches).toBe(0)
  } finally {
    await ui.close()
  }
})

function recoveryRow(): OfflineConflictRow {
  return {
    id: "held-command-row",
    actor: {
      id: "suspended-rep",
      name: "Original rep",
      displayName: "Original rep",
      email: "rep@example.test",
    },
    recovery: {
      version: 1,
      kind: "suspended_staff",
      membershipId: "rep-membership",
      accessRevision: 2,
      lifecycleEventId: "suspension",
      accessChangedAt: "2026-10-17T10:00:00.000Z",
      receivedAt: "2026-10-17T11:00:00.000Z",
    },
    recoveryOrigin: {
      store: {
        id: "original-store",
        name: "Original Store",
        status: "ACTIVE",
        currencyCode: "NGN",
      },
      device: null,
      moneyAccount: null,
    },
    recoveryEnvelope: {
      clientCommandId: "held-sale",
      createdAtClient: new Date("2026-10-17T09:00:00.000Z"),
      dependencyClientIds: [],
      eventVersion: 1,
      payload: {
        kind: "commercial_order",
        fulfillNow: true,
        lines: [
          { custom: "quick_sale", description: "Rice", amountMinor: 500 },
        ],
        initialPayment: {
          amountMinor: 500,
          clientPaymentId: "original-payment",
          method: "cash",
          moneyAccountId: "original-cash-account",
        },
      },
    },
    reviewKind: "suspended_recovery",
  } as unknown as OfflineConflictRow
}
function decisionInput(decision: "approve" | "reject" = "approve") {
  const row = recoveryRow()
  if (!row.recoveryEnvelope) throw Error("Missing original envelope")
  return {
    commandId: row.id,
    decision,
    reason: "Confirmed original record",
    envelope: row.recoveryEnvelope,
  }
}

test("recovery decision sends the exact original envelope and never changes the admin queue", async () => {
  reset()
  queue()
  const input = decisionInput()
  const before = structuredClone(useOfflineCommandStore.getState().commands)
  const ui = await mount(["sheet"])
  try {
    await ui.run(async () => {
      expect(await ui.model("sheet").decideRecovery(input)).toBe("applied")
    })
    expect(decisions).toEqual([input])
    expect(useOfflineCommandStore.getState().commands).toEqual(before)
    expect(invalidated).toHaveLength(15)
  } finally {
    await ui.close()
  }
})

test("a held recovery approval is not reported as an applied decision", async () => {
  reset()
  decisionResult = async () => ({
    clientCommandId: "held-sale",
    status: "held",
  })
  const ui = await mount(["sheet"])
  try {
    let outcome: unknown
    await ui.run(async () => {
      outcome = await ui.model("sheet").decideRecovery(decisionInput())
    })
    expect(decisions).toHaveLength(1)
    expect(outcome).not.toBe("applied")
    expect(outcome).not.toBe("applied_refresh_failed")
  } finally {
    await ui.close()
  }
})

test("recovery refusal keeps the admin queue and performs no success refresh", async () => {
  reset()
  queue()
  const before = structuredClone(useOfflineCommandStore.getState().commands)
  decisionResult = async () => {
    throw Error("Current reviewer refused")
  }
  const ui = await mount(["sheet"])
  try {
    await ui.run(async () => {
      expect(await ui.model("sheet").decideRecovery(decisionInput())).toBe(
        "failed",
      )
    })
    expect(useOfflineCommandStore.getState().commands).toEqual(before)
    expect(invalidated).toHaveLength(0)
  } finally {
    await ui.close()
  }
})

for (const [label, profile] of [
  ["actor", actorB],
  ["business", businessB],
  ["Store", storeB],
  ["cache generation", actorA],
] as const) {
  test(`retained recovery callback cannot dispatch after ${label} changes`, async () => {
    reset()
    const ui = await mount(["sheet"])
    try {
      const retained = ui.model("sheet").decideRecovery
      session(profile)
      await ui.render()
      await ui.run(() => retained(decisionInput()))
      expect(decisions).toHaveLength(0)
      expect(invalidated).toHaveLength(0)
    } finally {
      await ui.close()
    }
  })

  test(`pending recovery continuation retires after ${label} changes`, async () => {
    reset()
    queue()
    const response = deferred<DecisionReceipt>()
    decisionResult = () => response.promise
    const ui = await mount(["sheet"])
    try {
      let pending!: ReturnType<ReplayModel["decideRecovery"]>
      await ui.run(() => {
        pending = ui.model("sheet").decideRecovery(decisionInput())
      })
      session(profile)
      await ui.render()
      await ui.run(() =>
        response.resolve({ clientCommandId: "held-sale", status: "approved" }),
      )
      expect(await pending).toBe("retired")
      expect(invalidated).toHaveLength(0)
      expect(useOfflineCommandStore.getState().commands[0]?.localStatus).toBe(
        "pending",
      )
    } finally {
      response.resolve({ clientCommandId: "held-sale", status: "approved" })
      await ui.close()
    }
  })
}

test("an unmounted recovery callback cannot dispatch", async () => {
  reset()
  const ui = await mount(["sheet"])
  const retained = ui.model("sheet").decideRecovery
  await ui.close()
  await retained(decisionInput())
  expect(decisions).toHaveLength(0)
})

test("root replay and sheet recovery decision share a single flight", async () => {
  reset()
  queue()
  const replayResponse = deferred<Result[]>()
  replayResult = () => replayResponse.promise
  const ui = await mount(["root", "sheet"])
  let running: ReturnType<ReplayModel["request"]> | undefined
  let deciding: ReturnType<ReplayModel["decideRecovery"]> | undefined
  try {
    await ui.run(() => {
      running = ui.model("root").request({ registerFirst: false })
    })
    expect(calls.filter(({ kind }) => kind === "replay")).toHaveLength(1)
    await ui.run(() => {
      deciding = ui.model("sheet").decideRecovery(decisionInput())
    })
    expect(decisions).toHaveLength(0)
  } finally {
    await ui.run(() => replayResponse.resolve([]))
    await running
    await deciding
    await ui.close()
  }
})

test("actual failed refetch after recovery decision preserves the decision with a refresh warning", async () => {
  reset()
  const actualClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const observer = new QueryObserver(actualClient, {
    queryKey: ["visibility"],
    initialData: { revision: "old" },
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      throw Error("Recovery refresh unavailable")
    },
  })
  const unsubscribe = observer.subscribe(() => {})
  invalidationResult = (filter, options) =>
    actualClient.invalidateQueries(filter as QueryFilters, options)
  const ui = await mount(["sheet"])
  try {
    await ui.run(async () => {
      expect(
        await ui.model("sheet").decideRecovery(decisionInput("reject")),
      ).toBe("applied_refresh_failed")
    })
    expect(observer.getCurrentResult().isError).toBe(true)
    expect(decisions).toHaveLength(1)
  } finally {
    await ui.close()
    unsubscribe()
    actualClient.clear()
  }
})

test("actual recovery model preserves claimed times, original payment and access limits", () => {
  const row = recoveryRow()
  const summary = recoverySummary(row)
  expect(summary.envelope).toBe(row.recoveryEnvelope)
  expect(summary.claimedAt?.toISOString()).toBe("2026-10-17T09:00:00.000Z")
  expect(summary.accessChangedAt?.toISOString()).toBe(
    "2026-10-17T10:00:00.000Z",
  )
  expect(summary.receivedAt?.toISOString()).toBe("2026-10-17T11:00:00.000Z")
  expect(summary.payment?.amountMinor).toBe(500)
  expect(
    recoveryDecisionAccess({
      role: "MANAGER",
      viewerId: "manager",
      authorId: "suspended-rep",
    }).canDecide,
  ).toBe(false)
  expect(
    recoveryDecisionAccess({
      role: "OWNER",
      viewerId: "suspended-rep",
      authorId: "suspended-rep",
    }).canDecide,
  ).toBe(false)
})

test("a held record with no current Store projection remains available for safe rejection", () => {
  const row = recoveryRow()
  row.recoveryOrigin = { store: null, device: null, moneyAccount: null }
  expect(recoverySummary(row).decidable).toBe(true)
})

test("a held record missing its immutable envelope cannot be decided", () => {
  const row = recoveryRow()
  row.recoveryEnvelope = null
  expect(recoverySummary(row).decidable).toBe(false)
})

for (const [decision, receipt, expected] of [
  ["approve", "rejected", "rejected"],
  ["reject", "approved", "applied"],
] as const) {
  test(`recovery ${decision} reports opposite terminal receipt ${receipt} truthfully`, async () => {
    reset()
    decisionResult = async () => ({
      clientCommandId: "held-sale",
      status: receipt,
    })
    const ui = await mount(["sheet"])
    try {
      await ui.run(async () => {
        expect(
          await ui.model("sheet").decideRecovery(decisionInput(decision)),
        ).toBe(expected)
      })
      expect(decisions).toHaveLength(1)
    } finally {
      await ui.close()
    }
  })
}

for (const [receipt, expected] of [
  ["approved", "applied_refresh_failed"],
  ["rejected", "rejected_refresh_failed"],
] as const) {
  test(`actual refetch failure preserves ${receipt} recovery receipt`, async () => {
    reset()
    decisionResult = async () => ({
      clientCommandId: "held-sale",
      status: receipt,
    })
    const actualClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const observer = new QueryObserver(actualClient, {
      queryKey: ["visibility"],
      initialData: {},
      staleTime: Number.POSITIVE_INFINITY,
      queryFn: async () => {
        throw Error("Refresh failed")
      },
    })
    const unsubscribe = observer.subscribe(() => {})
    invalidationResult = (filter, options) =>
      actualClient.invalidateQueries(filter as QueryFilters, options)
    const ui = await mount(["sheet"])
    try {
      await ui.run(async () => {
        expect(await ui.model("sheet").decideRecovery(decisionInput())).toBe(
          expected,
        )
      })
      expect(observer.getCurrentResult().isError).toBe(true)
    } finally {
      await ui.close()
      unsubscribe()
      actualClient.clear()
    }
  })
}

test("queued recovery decision retires when its origin changes before dispatch", async () => {
  reset()
  queue()
  const replayResponse = deferred<Result[]>()
  replayResult = () => replayResponse.promise
  const ui = await mount(["root", "sheet"])
  let running: ReturnType<ReplayModel["request"]> | undefined
  let deciding: ReturnType<ReplayModel["decideRecovery"]> | undefined
  try {
    await ui.run(() => {
      running = ui.model("root").request({ registerFirst: false })
    })
    await ui.run(() => {
      deciding = ui.model("sheet").decideRecovery(decisionInput())
    })
    session(actorB)
    await ui.render()
    await ui.run(() => replayResponse.resolve([]))
    expect(await deciding).toBe("retired")
    expect(decisions).toHaveLength(0)
  } finally {
    replayResponse.resolve([])
    await running
    await deciding
    await ui.close()
  }
})

test("latest queued recovery decision supersedes its earlier waiter", async () => {
  reset()
  queue()
  const replayResponse = deferred<Result[]>()
  replayResult = () => replayResponse.promise
  const ui = await mount(["root", "sheet"])
  let running: ReturnType<ReplayModel["request"]> | undefined
  let older: ReturnType<ReplayModel["decideRecovery"]> | undefined
  let latest: ReturnType<ReplayModel["decideRecovery"]> | undefined
  const latestInput = {
    ...decisionInput("reject"),
    reason: "Latest explicit decision",
  }
  try {
    await ui.run(() => {
      running = ui.model("root").request({ registerFirst: false })
    })
    await ui.run(() => {
      older = ui.model("sheet").decideRecovery(decisionInput())
    })
    await ui.run(() => {
      latest = ui.model("sheet").decideRecovery(latestInput)
    })
    expect(await older).toBe("retired")
    expect(decisions).toHaveLength(0)
    await ui.run(() => replayResponse.resolve([]))
    await latest
    expect(decisions).toEqual([latestInput])
  } finally {
    replayResponse.resolve([])
    await running
    await older
    await latest
    await ui.close()
  }
})

test("recovery decision unmounted while queued never dispatches", async () => {
  reset()
  queue()
  const replayResponse = deferred<Result[]>()
  replayResult = () => replayResponse.promise
  const ui = await mount(["root", "sheet"])
  let running: ReturnType<ReplayModel["request"]> | undefined
  let deciding: ReturnType<ReplayModel["decideRecovery"]> | undefined
  try {
    await ui.run(() => {
      running = ui.model("root").request({ registerFirst: false })
    })
    await ui.run(() => {
      deciding = ui.model("sheet").decideRecovery(decisionInput())
    })
    await ui.close()
    await ui.run(() => replayResponse.resolve([]))
    expect(await deciding).toBe("retired")
    expect(decisions).toHaveLength(0)
  } finally {
    replayResponse.resolve([])
    await running
    await deciding
  }
})

test("actual sync reports mixed statuses and the exact submitted count", async () => {
  reset()
  queue("sale-one")
  queue("sale-two")
  replayResult = async (input) =>
    serverResults(input).map((row, index) => {
      if (index === 1) row.status = "REVIEW_REQUIRED"
      return row
    })
  const ui = await mount(["sheet"])
  try {
    await ui.run(() => ui.model("sheet").request({ registerFirst: false }))
    expect(activities).toHaveLength(1)
    expect(activities[0]).toMatchObject({
      name: "mobile_sync_result",
      properties: { status: "partial", item_count: 2 },
    })
    expect(mobileActivityInputSchema.safeParse(activities[0]).success).toBe(
      true,
    )
  } finally {
    await ui.close()
  }
})

test("actual failed registration reports unknown without copying its error", async () => {
  reset()
  queue()
  registerResult = async () => {
    throw Error("private-device-token")
  }
  const ui = await mount(["sheet"])
  try {
    await ui.run(async () => {
      expect(
        (await ui.model("sheet").request({ registerFirst: true })).status,
      ).toBe("failed")
    })
    expect(activities).toHaveLength(1)
    expect(activities[0]).toMatchObject({
      name: "mobile_sync_result",
      properties: { status: "unknown", item_count: 1 },
    })
    expect(JSON.stringify(activities)).not.toContain("private")
  } finally {
    await ui.close()
  }
})

for (const failed of [false, true]) {
  test(`normal discard review emits ${failed ? "unknown after error" : "discarded from server status"}`, async () => {
    reset()
    queue()
    const result = originalResult()
    result.status = "DISCARDED"
    reviewResult = async () => {
      if (failed) throw Error("private-order-error")
      return result
    }
    const ui = await mount(["sheet"])
    try {
      await ui.run(async () => {
        expect(
          await ui
            .model("sheet")
            .reviewCommand({ commandId: result.id, decision: "discard" }),
        ).toBe(failed ? "failed" : "applied")
      })
      expect(activities).toEqual([
        {
          name: "mobile_offline_review_result",
          properties: {
            action: "discard",
            status: failed ? "unknown" : "discarded",
          },
        },
      ])
    } finally {
      await ui.close()
    }
  })
}

for (const action of ["replay", "review", "decision"] as const) {
  test(`throwing analytics cannot alter actual ${action} outcome`, async () => {
    reset()
    queue()
    const result = originalResult()
    reviewResult = async () => result
    trackerFailure = true
    const ui = await mount(["sheet"])
    try {
      await ui.run(async () => {
        if (action === "replay")
          expect(
            (await ui.model("sheet").request({ registerFirst: false })).status,
          ).toBe("applied")
        else if (action === "review")
          expect(
            await ui
              .model("sheet")
              .reviewCommand({ commandId: result.id, decision: "approve" }),
          ).toBe("applied")
        else
          expect(await ui.model("sheet").decideRecovery(decisionInput())).toBe(
            "applied",
          )
      })
      expect(activities).toEqual([])
    } finally {
      await ui.close()
    }
  })
}

test("unmounted normal review emits no late activity", async () => {
  reset()
  queue()
  const accepted = originalResult()
  const response = deferred<Result>()
  reviewResult = () => response.promise
  const ui = await mount(["sheet"])
  let pending!: ReturnType<ReplayModel["reviewCommand"]>
  await ui.run(() => {
    pending = ui
      .model("sheet")
      .reviewCommand({ commandId: accepted.id, decision: "approve" })
  })
  await ui.close()
  response.resolve(accepted)
  await pending
  expect(activities).toEqual([])
})

for (const retirement of [
  "token",
  "cache",
  "offline",
  "offline-ABA",
  "access-ABA",
] as const) {
  test(`sync telemetry respects synchronous ${retirement} retirement before React render`, async () => {
    reset()
    queue()
    if (retirement === "access-ABA") {
      const current = getSession()
      if (!current) throw Error("Missing access fixture session")
      setSession({
        ...current,
        accessProfile: { hasBusinessAccess: true, hasCustomerHistory: false },
      })
    }
    const response = deferred<Result[]>()
    let submitted: Result[] = []
    replayResult = (input) => {
      submitted = serverResults(input)
      return response.promise
    }
    const ui = await mount(["sheet"])
    let pending!: ReturnType<ReplayModel["request"]>
    try {
      await ui.run(() => {
        pending = ui.model("sheet").request({ registerFirst: false })
      })
      if (retirement === "token") {
        const previous = getSession()
        if (!previous) throw Error("Missing session")
        setSession({ ...previous, token: "replacement-session" })
      } else if (retirement === "cache") cache.clearMobileDataCache()
      else if (retirement === "access-ABA") {
        const previous = getSession()
        if (!previous) throw Error("Missing session")
        const generation = cache.getDataCacheGeneration()
        setSession({
          ...previous,
          accessProfile: {
            hasBusinessAccess: false,
            hasCustomerHistory: false,
          },
        })
        setSession(previous)
        expect(cache.getDataCacheGeneration()).toBe(generation)
      } else {
        const generation = getOperationalModeGeneration()
        const mode = useOperationalModeStore.getState()
        useOperationalModeStore.setState({
          offlineAccessByBusinessId: {
            ...mode.offlineAccessByBusinessId,
            "unrelated-business": true,
          },
        })
        expect(getOperationalModeGeneration()).toBe(generation)
        useOperationalModeStore.setState({ isOfflineMode: true })
        expect(getOperationalModeGeneration()).toBe(generation + 1)
        if (retirement === "offline-ABA") {
          useOperationalModeStore.setState({ isOfflineMode: false })
          expect(getOperationalModeGeneration()).toBe(generation + 2)
        }
      }
      await ui.run(async () => {
        response.resolve(submitted)
        await pending
      })
      expect(activities).toEqual([])
    } finally {
      response.resolve(submitted)
      await pending
      await ui.close()
    }
  })
}
