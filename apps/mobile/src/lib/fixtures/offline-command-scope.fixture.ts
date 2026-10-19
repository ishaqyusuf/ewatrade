import { expect, mock, test } from "bun:test"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type {
  LocalOfflineCommand,
  OfflineReplayBatch,
} from "../../store/offlineCommandStore"
import type { MobileSession } from "../session-store"

// Isolated process: real Zustand persist/store/session/MMKV adapter, replacing
// only native ports with inert memory. No network or device storage is used.
const secure = new Map<string, string>()
const persisted = new Map<string, string>()
let nonce = 0
mock.module("expo-crypto", () => ({ randomUUID: () => `fixture-${++nonce}` }))
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
const { getSession, setSession, deleteSession } = await import(
  "../session-store"
)
const {
  activeBusinessOfflineCommands,
  getOfflineProvisionalProjection,
  pendingOfflineCommands,
  useOfflineCommandStore,
} = await import("../../store/offlineCommandStore")
await useOfflineCommandStore.persist.rehydrate()

type Result = RouterOutputs["offline"]["replay"][number]
const storageKey = "onboarding-storage:ewatrade-mobile-offline-commands"
const date = new Date("2026-10-17T10:00:00.000Z")
const actorA: MobileSession["profile"] = {
  id: "actor-a",
  businessId: "business-a",
  storeId: "store-a",
  name: "Actor A",
  email: "actor-a@example.test",
}
const actorB = { ...actorA, id: "actor-b" }
const storeB = { ...actorA, storeId: "store-b" }
const businessB = { ...actorA, businessId: "business-b", storeId: "store-b" }
function session(profile = actorA) {
  setSession({ profile, token: "inert-fixture-token" })
}
function reset() {
  secure.clear()
  persisted.clear()
  session()
  useOfflineCommandStore.setState({
    commands: [],
    deviceIdsByScope: {},
    hasHydrated: true,
  })
}
const state = () => useOfflineCommandStore.getState()
function prepared() {
  const batch = state().prepareReplay()
  if (!batch) throw Error("Expected a signed-in scoped replay batch")
  return batch
}
function queue(clientCommandId = "command-current", description = "Rice") {
  return state().queueCommand({
    clientCommandId,
    createdAtClient: date,
    dependencyClientIds: [],
    eventVersion: 1,
    payload: {
      kind: "commercial_order",
      lines: [{ custom: "quick_sale", amountMinor: 500, description }],
    },
  })
}
function result(
  clientCommandId: string,
  status: Result["status"] = "APPLIED",
  conflictCode: Result["conflictCode"] = null,
  batch?: OfflineReplayBatch,
): Result {
  const command =
    batch?.commands.find(
      (entry) => entry.clientCommandId === clientCommandId,
    ) ??
    state().commands.find((entry) => entry.clientCommandId === clientCommandId)
  return {
    authoritativeState: null,
    clientCommandId,
    conflictCode,
    conflictMessage: conflictCode ? "Needs review" : null,
    createdAtClient: date,
    dependencyClientIds: [],
    id: `server-${clientCommandId}`,
    payload: {
      ...JSON.parse(
        JSON.stringify(
          command?.payload ?? { kind: "commercial_order", lines: [] },
        ),
      ),
      actorUserId: batch?.scope.actorUserId ?? "actor-a",
    },
    processedAt: date,
    result: { id: "order-from-actor-a" },
    status,
    type: "COMMERCIAL_ORDER",
  }
}

test("new queue records capture the actual session actor, business and Store", () => {
  reset()
  expect(getSession()?.profile).toEqual(actorA)
  expect(queue()).toBe("command-current")
  expect(state().commands[0]).toMatchObject({
    actorUserId: "actor-a",
    businessId: "business-a",
    storeId: "store-a",
    clientCommandId: "command-current",
    createdAtClient: date,
    localStatus: "pending",
  })
  expect(
    activeBusinessOfflineCommands(state().commands, "business-a"),
  ).toHaveLength(1)
  const replay = pendingOfflineCommands(state(), "business-a")
  expect(replay).toHaveLength(1)
  expect(replay[0]).not.toHaveProperty("actorUserId")
  expect(replay[0]).not.toHaveProperty("storeId")
  const batch = prepared()
  expect(batch.scope).toEqual({
    actorUserId: "actor-a",
    businessId: "business-a",
    storeId: "store-a",
  })
  expect(state().commands[0]?.deviceId).toBe(batch.deviceId)
})

type RecoveryResult = RouterOutputs["offline"]["recover"][number]
function recoveryBatch() {
  const batch = state().prepareReplay("recovery")
  if (!batch) throw Error("Expected original scoped recovery batch")
  return batch
}
function acknowledgement(
  clientCommandId: string,
  status: RecoveryResult["status"] = "held",
): RecoveryResult {
  return { clientCommandId, status }
}

const originalScope = {
  actorUserId: actorA.id,
  businessId: actorA.businessId ?? "",
  storeId: actorA.storeId ?? "",
}
function noBusinessSession(token = "fresh-no-business-token") {
  setSession({
    token,
    profile: { id: actorA.id, name: actorA.name, email: actorA.email },
    accessProfile: { hasBusinessAccess: false, hasCustomerHistory: false },
  })
}
function explicitlyPrepared(scope = originalScope) {
  const batch = state().prepareRecovery(scope)
  if (!batch) throw Error("Expected explicitly chosen recovery partition")
  return batch
}

test("fresh real no-business sign-in can explicitly recover its original partition without minting a device", () => {
  reset()
  const id = queue()
  const devices = structuredClone(state().deviceIdsByScope)
  const nonceBefore = nonce
  noBusinessSession()
  expect(state().recoveryPartitions()).toEqual([
    {
      scope: originalScope,
      deviceId: Object.values(devices)[0],
      commandCount: 1,
    },
  ])
  const batch = explicitlyPrepared()
  expect(batch.scope).toEqual(originalScope)
  expect(batch.commands[0]?.clientCommandId).toBe(id)
  expect(batch.commands[0]).not.toHaveProperty("actorUserId")
  expect(state().prepareReplay()).toBeNull()
  expect(state().deviceIdsByScope).toEqual(devices)
  expect(nonce).toBe(nonceBefore)
  state().applyScopedRecoveryResults([acknowledgement(id)], batch)
  expect(state().commands[0]).toMatchObject({
    recoveryHeld: true,
    localStatus: "approval",
  })
  expect(state().commands[0]?.result).toBeUndefined()
})

test("no-business recovery requires explicit original partition choice across the same actor's businesses and Stores", () => {
  reset()
  queue("original")
  session(storeB)
  queue("other-store")
  session(businessB)
  queue("other-business")
  noBusinessSession()
  const partitions = state().recoveryPartitions()
  expect(partitions).toHaveLength(3)
  expect(
    partitions.map(
      (entry) =>
        state().prepareRecovery(entry.scope)?.commands[0]?.clientCommandId,
    ),
  ).toEqual(["original", "other-store", "other-business"])
  state().applyScopedRecoveryResults(
    [acknowledgement("other-store")],
    explicitlyPrepared(partitions[1]?.scope),
  )
  expect(state().commands.map((entry) => entry.localStatus)).toEqual([
    "pending",
    "approval",
    "pending",
  ])
})

test("active business sessions retain exact current scope fences for explicit recovery selection", () => {
  reset()
  queue("original")
  session(storeB)
  queue("other-store")
  expect(state().recoveryPartitions()).toHaveLength(1)
  expect(state().prepareRecovery(originalScope)).toBeNull()
  session(actorB)
  expect(state().recoveryPartitions()).toEqual([])
  expect(state().prepareRecovery(originalScope)).toBeNull()
})

test("unknown origin, foreign actor and missing or retired durable device bindings fail closed without repair", () => {
  for (const changed of [
    "actor",
    "business",
    "Store",
    "foreign actor",
    "missing device",
    "retired device",
  ] as const) {
    reset()
    queue()
    const entry = state().commands[0]
    if (!entry) throw Error("Expected queued draft")
    const altered = { ...entry }
    if (changed === "actor") Reflect.deleteProperty(altered, "actorUserId")
    if (changed === "business") altered.businessId = ""
    if (changed === "Store") Reflect.deleteProperty(altered, "storeId")
    if (changed === "foreign actor") altered.actorUserId = actorB.id
    if (changed === "missing device")
      Reflect.deleteProperty(altered, "deviceId")
    if (changed === "retired device") altered.deviceId = "retired-device"
    useOfflineCommandStore.setState({ commands: [altered] })
    noBusinessSession()
    const before = structuredClone(state().commands)
    const nonceBefore = nonce
    expect(state().recoveryPartitions()).toEqual([])
    expect(state().prepareRecovery(originalScope)).toBeNull()
    expect(state().commands).toEqual(before)
    expect(nonce).toBe(nonceBefore)
  }
})

test("recovery is unavailable before hydration and when the durable partition mapping is absent", () => {
  reset()
  queue()
  noBusinessSession()
  useOfflineCommandStore.setState({ hasHydrated: false })
  expect(state().recoveryPartitions()).toEqual([])
  expect(state().prepareRecovery(originalScope)).toBeNull()
  useOfflineCommandStore.setState({ hasHydrated: true, deviceIdsByScope: {} })
  expect(state().recoveryPartitions()).toEqual([])
  expect(state().prepareRecovery(originalScope)).toBeNull()
})

test("only original pending, review and approval work is recoverable; captured envelopes are deep clones", () => {
  reset()
  for (const status of [
    "pending",
    "review",
    "approval",
    "blocked",
    "applied",
    "discarded",
  ] as const) {
    queue(status)
    useOfflineCommandStore.setState({
      commands: state().commands.map((entry) =>
        entry.clientCommandId === status
          ? { ...entry, localStatus: status }
          : entry,
      ),
    })
  }
  noBusinessSession()
  expect(state().recoveryPartitions()[0]?.commandCount).toBe(3)
  const batch = explicitlyPrepared()
  expect(batch.commands.map((entry) => entry.clientCommandId)).toEqual([
    "pending",
    "review",
    "approval",
  ])
  const before = structuredClone(state().commands)
  const first = batch.commands[0]
  if (!first) throw Error("Expected captured draft")
  first.payload.customerName = "mutated clone"
  first.dependencyClientIds.push("mutated")
  first.createdAtClient.setFullYear(2040)
  batch.scope.storeId = "mutated-scope"
  expect(state().commands).toEqual(before)
  expect(explicitlyPrepared().scope).toEqual(originalScope)
})

test("duplicate client identities within one original partition refuse recovery selection", () => {
  reset()
  queue("duplicate")
  queue("duplicate")
  noBusinessSession()
  expect(state().recoveryPartitions()).toEqual([])
  expect(state().prepareRecovery(originalScope)).toBeNull()
})

test("QA, local, empty, expired and malformed-expiry sessions cannot select or acknowledge recovery", () => {
  for (const invalid of [
    { token: "qas_fixture" },
    { token: "local-fixture" },
    { token: "" },
    { token: "real-token", expiresAt: "2000-01-01T00:00:00Z" },
    { token: "real-token", expiresAt: "not-a-date" },
  ]) {
    reset()
    const id = queue()
    noBusinessSession()
    const batch = explicitlyPrepared()
    const existing = getSession()
    if (!existing) throw Error("Expected session")
    setSession({ ...existing, ...invalid })
    const before = structuredClone(state().commands)
    expect(state().recoveryPartitions()).toEqual([])
    expect(state().prepareRecovery(originalScope)).toBeNull()
    state().applyScopedRecoveryResults([acknowledgement(id)], batch)
    expect(state().commands).toEqual(before)
  }
})

test("issued recovery batches are retired by logout/login token changes, no-access changes or full-scope switches", async () => {
  for (const changed of ["token", "access", "scope"] as const) {
    reset()
    const id = queue()
    noBusinessSession()
    const batch = explicitlyPrepared()
    const existing = getSession()
    if (!existing) throw Error("Expected session")
    if (changed === "token") {
      await deleteSession()
      noBusinessSession("new-login-token")
    }
    if (changed === "access")
      setSession({
        ...existing,
        accessProfile: { hasBusinessAccess: true, hasCustomerHistory: false },
      })
    if (changed === "scope") session(businessB)
    const before = structuredClone(state().commands)
    state().applyScopedRecoveryResults([acknowledgement(id, "approved")], batch)
    expect(state().commands).toEqual(before)
  }
})

test("copied or constructed batches have no recovery acknowledgement authority", () => {
  reset()
  const id = queue()
  noBusinessSession()
  const issued = explicitlyPrepared()
  const before = structuredClone(state().commands)
  for (const forged of [
    structuredClone(issued),
    { ...issued },
    preparedFallback(issued),
  ]) {
    state().applyScopedRecoveryResults(
      [acknowledgement(id, "approved")],
      forged,
    )
    expect(state().commands).toEqual(before)
  }
  state().applyScopedRecoveryResults([acknowledgement(id)], issued)
  expect(state().commands[0]?.localStatus).toBe("approval")
})
function preparedFallback(batch: OfflineReplayBatch): OfflineReplayBatch {
  return {
    scope: { ...batch.scope },
    deviceId: batch.deviceId,
    commands: [...batch.commands],
  }
}

test("persisted no-access recovery retains original partitions and durable hold while freshly issuing batches", async () => {
  reset()
  const id = queue()
  noBusinessSession()
  state().applyScopedRecoveryResults(
    [acknowledgement(id)],
    explicitlyPrepared(),
  )
  const saved = persisted.get(storageKey)
  if (!saved) throw Error("Expected persisted held draft")
  useOfflineCommandStore.setState({
    commands: [],
    deviceIdsByScope: {},
    hasHydrated: false,
  })
  persisted.set(storageKey, saved)
  await useOfflineCommandStore.persist.rehydrate()
  const batch = explicitlyPrepared()
  expect(state().recoveryPartitions()[0]?.scope).toEqual(originalScope)
  expect(state().commands[0]?.recoveryHeld).toBe(true)
  expect(batch.commands[0]?.createdAtClient).toBeInstanceOf(Date)
  state().applyScopedRecoveryResults([acknowledgement(id, "approved")], batch)
  expect(state().commands[0]).toMatchObject({
    localStatus: "applied",
    recoveryHeld: true,
  })
  expect(state().commands[0]?.result).toBeUndefined()
})

test("issued batch cannot be rewritten to acknowledge an unselected original partition", () => {
  reset()
  queue("first")
  session(storeB)
  queue("second")
  noBusinessSession()
  const issued = explicitlyPrepared()
  const other = explicitlyPrepared({ ...originalScope, storeId: "store-b" })
  issued.scope = other.scope
  issued.deviceId = other.deviceId
  issued.commands = other.commands
  const before = structuredClone(state().commands)
  state().applyScopedRecoveryResults(
    [acknowledgement("second", "approved")],
    issued,
  )
  expect(state().commands).toEqual(before)
})

test("duplicate durable identity added after capture cannot receive a recovery acknowledgement", () => {
  reset()
  const id = queue()
  noBusinessSession()
  const issued = explicitlyPrepared()
  const original = state().commands[0]
  if (!original) throw Error("Expected original draft")
  useOfflineCommandStore.setState({
    commands: [...state().commands, structuredClone(original)],
  })
  const before = structuredClone(state().commands)
  state().applyScopedRecoveryResults([acknowledgement(id, "approved")], issued)
  expect(state().commands).toEqual(before)
})

test("status-only held/approved/rejected acknowledgements preserve draft and never project a canonical receipt", () => {
  for (const [status, localStatus] of [
    ["held", "approval"],
    ["approved", "applied"],
    ["rejected", "discarded"],
  ] as const) {
    reset()
    const id = queue()
    const batch = recoveryBatch()
    const draft = structuredClone(state().commands[0]?.payload)
    state().applyScopedReplayResults(
      [result(id, "REVIEW_REQUIRED", "INVALID_COMMAND", batch)],
      batch,
    )
    state().applyScopedRecoveryResults([acknowledgement(id, status)], batch)
    expect(state().commands[0]).toMatchObject({
      recoveryHeld: true,
      localStatus,
      payload: draft,
      actorUserId: actorA.id,
      storeId: actorA.storeId,
      businessId: actorA.businessId,
      deviceId: batch.deviceId,
    })
    expect(state().commands[0]?.result).toBeUndefined()
    expect(state().commands[0]?.authoritativeState).toBeUndefined()
    expect(state().commands[0]?.conflictCode).toBeNull()
    expect(state().commands[0]?.conflictMessage).toBeNull()
    // These counts remain explicitly provisional; no receipt or stock/Service
    // effect is fabricated by a server status acknowledgement.
    expect(getOfflineProvisionalProjection(state().commands)).toMatchObject({
      inventoryOperations: 0,
      serviceOperations: 0,
      catalogItems: [],
    })
  }
})

test("ordinary replay excludes held records while recovery includes current held and pending records", () => {
  reset()
  const held = queue("recovery-held")
  const pending = queue("ordinary-pending")
  const batch = recoveryBatch()
  state().applyScopedRecoveryResults([acknowledgement(held)], batch)
  expect(prepared().commands.map((entry) => entry.clientCommandId)).toEqual([
    pending,
  ])
  expect(
    pendingOfflineCommands(state(), actorA.businessId).map(
      (entry) => entry.clientCommandId,
    ),
  ).toEqual([pending])
  expect(
    recoveryBatch().commands.map((entry) => entry.clientCommandId),
  ).toEqual([held, pending])
  expect(
    pendingOfflineCommands(state(), actorA.businessId, true).map(
      (entry) => entry.clientCommandId,
    ),
  ).toEqual([held, pending])
})

test("recovery hold survives actual JSON persistence/restart and cannot be locally retried, discarded or ordinarily reconciled", async () => {
  reset()
  const id = queue()
  const original = recoveryBatch()
  state().applyScopedRecoveryResults([acknowledgement(id)], original)
  const saved = persisted.get(storageKey)
  if (!saved) throw Error("Expected persisted recovery hold")
  expect(JSON.parse(saved).state.commands[0].recoveryHeld).toBe(true)
  useOfflineCommandStore.setState({ commands: [], deviceIdsByScope: {} })
  persisted.set(storageKey, saved)
  await useOfflineCommandStore.persist.rehydrate()
  const before = structuredClone(state().commands)
  state().retryCommand(id)
  state().discardCommand(id)
  state().applyScopedReplayResults(
    [result(id, "APPLIED", null, original)],
    original,
  )
  expect(state().commands).toEqual(before)
  expect(prepared().commands).toEqual([])
  expect(recoveryBatch()).toEqual(original)
  expect(state().commands[0]?.result).toBeUndefined()
})

for (const [label, profile] of [
  ["actor", actorB],
  ["Store", storeB],
  ["business", businessB],
] as const) {
  test(`late recovery acknowledgement cannot affect a colliding current ${label} command`, () => {
    reset()
    const id = queue("colliding-recovery-id", "Original private draft")
    const original = recoveryBatch()
    session(profile)
    queue(id, "Current scope draft")
    const before = structuredClone(state().commands)
    state().applyScopedRecoveryResults(
      [acknowledgement(id, "approved")],
      original,
    )
    expect(state().commands).toEqual(before)
    expect(
      activeBusinessOfflineCommands(state().commands, profile.businessId)[0],
    ).toMatchObject({ localStatus: "pending" })
    expect(
      activeBusinessOfflineCommands(state().commands, profile.businessId)[0]
        ?.result,
    ).toBeUndefined()
  })
}

test("logout refuses recovery acknowledgement without deleting or modifying private queue", async () => {
  reset()
  const id = queue()
  const batch = recoveryBatch()
  const original = structuredClone(state().commands)
  await deleteSession()
  state().applyScopedRecoveryResults([acknowledgement(id, "approved")], batch)
  expect(state().commands).toEqual(original)
  expect(state().prepareReplay("recovery")).toBeNull()
})

for (const changed of [
  "payload",
  "dependency",
  "timestamp",
  "version",
  "identity",
  "device",
] as const) {
  test(`recovery acknowledgement refuses a changed submitted ${changed}`, () => {
    reset()
    const id = queue()
    const batch = recoveryBatch()
    const original = structuredClone(state().commands)
    const submitted = batch.commands[0]
    if (!submitted) throw Error("Expected submitted envelope")
    if (changed === "payload")
      submitted.payload.customerName = "Changed after submission"
    if (changed === "dependency")
      submitted.dependencyClientIds.push("different-dependency")
    if (changed === "timestamp") submitted.createdAtClient.setUTCFullYear(2030)
    if (changed === "version") submitted.eventVersion = 2
    if (changed === "identity")
      submitted.clientCommandId = "changed-client-command"
    if (changed === "device") batch.deviceId = "foreign-device"
    state().applyScopedRecoveryResults([acknowledgement(id)], batch)
    expect(state().commands).toEqual(original)
  })
}

test("foreign and unsubmitted recovery acknowledgements never update another local draft", () => {
  reset()
  const included = queue("included-recovery")
  const batch = recoveryBatch()
  const excluded = queue("not-submitted")
  state().applyScopedRecoveryResults(
    [acknowledgement("not-local"), acknowledgement(excluded, "approved")],
    batch,
  )
  expect(state().commands.map((entry) => entry.localStatus)).toEqual([
    "pending",
    "pending",
  ])
  state().applyScopedRecoveryResults([acknowledgement(included)], batch)
  expect(state().commands.map((entry) => entry.localStatus)).toEqual([
    "approval",
    "pending",
  ])
})

test("duplicate recovery acknowledgements are refused even when status values agree", () => {
  for (const statuses of [
    ["held", "held"],
    ["held", "approved"],
  ] as const) {
    reset()
    const id = queue()
    const batch = recoveryBatch()
    const original = structuredClone(state().commands)
    state().applyScopedRecoveryResults(
      statuses.map((status) => acknowledgement(id, status)),
      batch,
    )
    expect(state().commands).toEqual(original)
  }
})

test("malformed runtime recovery acknowledgements are ignored without throwing or modifying queue", () => {
  const malformed: unknown[] = [
    null,
    undefined,
    "approved",
    5,
    [],
    {},
    { status: "approved" },
    { clientCommandId: "command-current" },
    { clientCommandId: "command-current", status: "APPLIED" },
    { clientCommandId: "command-current", status: null },
  ]
  for (const response of [
    ...malformed.map((value) => [value]),
    null,
    undefined,
    {},
    5,
    "held",
  ]) {
    reset()
    queue()
    const batch = recoveryBatch()
    const original = structuredClone(state().commands)
    expect(() =>
      Reflect.apply(state().applyScopedRecoveryResults, state(), [
        response,
        batch,
      ]),
    ).not.toThrow()
    expect(state().commands).toEqual(original)
  }
})

test("extra canonical-looking data on a status acknowledgement never becomes stored receipt/authority", () => {
  reset()
  const id = queue()
  const batch = recoveryBatch()
  Reflect.apply(state().applyScopedRecoveryResults, state(), [
    [
      {
        clientCommandId: id,
        status: "approved",
        result: { id: "forbidden-canonical-receipt" },
        authoritativeState: { balances: 100 },
        payload: { customerName: "forbidden private payload" },
      },
    ],
    batch,
  ])
  expect(state().commands[0]?.result).toBeUndefined()
  expect(state().commands[0]?.authoritativeState).toBeUndefined()
  expect(JSON.stringify(state().commands)).not.toContain("forbidden")
})

test("ambiguous duplicate submitted identities cannot authorize recovery mutation", () => {
  reset()
  const id = queue()
  const batch = recoveryBatch()
  const submitted = batch.commands[0]
  if (!submitted) throw Error("Expected captured command")
  batch.commands.push(structuredClone(submitted))
  const original = structuredClone(state().commands)
  state().applyScopedRecoveryResults([acknowledgement(id)], batch)
  expect(state().commands).toEqual(original)
})

test("late acknowledgement from a retired partition device cannot mutate its quarantined queue", async () => {
  reset()
  const id = queue()
  const old = recoveryBatch()
  const original = structuredClone(state().commands)
  persisted.set(
    storageKey,
    JSON.stringify({
      version: 3,
      state: {
        commands: original,
        deviceId: "legacy-global",
        deviceIdsByScope: {
          [JSON.stringify([actorA.id, actorA.businessId, actorA.storeId])]:
            "replacement-device",
        },
      },
    }),
  )
  await useOfflineCommandStore.persist.rehydrate()
  expect(recoveryBatch().deviceId).toBe("replacement-device")
  expect(
    activeBusinessOfflineCommands(state().commands, actorA.businessId),
  ).toEqual([])
  state().applyScopedRecoveryResults([acknowledgement(id, "approved")], old)
  expect(state().commands).toEqual(original)
})

for (const status of ["approved", "rejected"] as const) {
  test(`terminal recovery ${status} survives delayed held/opposite/normal responses and local mutations`, async () => {
    reset()
    const id = queue()
    const originalBatch = recoveryBatch()
    state().applyScopedRecoveryResults(
      [acknowledgement(id, status)],
      originalBatch,
    )
    const terminal = structuredClone(state().commands)
    state().applyScopedRecoveryResults([acknowledgement(id)], originalBatch)
    state().applyScopedRecoveryResults(
      [acknowledgement(id, status === "approved" ? "rejected" : "approved")],
      originalBatch,
    )
    state().applyScopedReplayResults(
      [result(id, "REVIEW_REQUIRED", "INVALID_COMMAND", originalBatch)],
      originalBatch,
    )
    state().retryCommand(id)
    state().discardCommand(id)
    expect(state().commands).toEqual(terminal)
    expect(prepared().commands).toEqual([])
    expect(recoveryBatch().commands).toEqual([])
    const saved = persisted.get(storageKey)
    if (!saved) throw Error("Expected persisted terminal outcome")
    useOfflineCommandStore.setState({ commands: [], deviceIdsByScope: {} })
    persisted.set(storageKey, saved)
    await useOfflineCommandStore.persist.rehydrate()
    state().applyScopedRecoveryResults([acknowledgement(id)], originalBatch)
    expect(state().commands).toEqual(terminal)
  })
}

for (const [label, profile] of [
  ["another actor in the same business/Store", actorB],
  ["another Store for the same actor/business", storeB],
  ["another business for the same actor", businessB],
] as const) {
  test(`${label} cannot see, replay, discard, retry or apply results to the original queue`, () => {
    reset()
    queue()
    const batch = prepared()
    state().applyReplayResults(
      [result("command-current", "REVIEW_REQUIRED", "INVALID_COMMAND", batch)],
      batch,
    )
    const before = JSON.stringify(state().commands)
    session(profile)
    expect(
      activeBusinessOfflineCommands(state().commands, profile.businessId),
    ).toEqual([])
    expect(pendingOfflineCommands(state(), profile.businessId)).toEqual([])
    state().discardCommand("command-current")
    state().retryCommand("command-current")
    state().applyScopedReplayResults(
      [result("command-current", "APPLIED", null, batch)],
      batch,
    )
    expect(JSON.stringify(state().commands)).toBe(before)
    session()
    expect(
      activeBusinessOfflineCommands(state().commands, "business-a"),
    ).toHaveLength(1)
    expect(state().commands[0]?.localStatus).toBe("review")
  })
}

test("actor/business/Store partitions keep distinct durable devices across persistence restart", async () => {
  reset()
  const profiles = [actorA, actorB, storeB, businessB]
  const devices = profiles.map((profile) => {
    session(profile)
    return prepared().deviceId
  })
  expect(new Set(devices).size).toBe(4)
  session()
  queue()
  expect(prepared().deviceId).toBe(devices[0])
  const serialized = persisted.get(storageKey)
  if (!serialized) throw Error("Expected persisted partition identities")
  useOfflineCommandStore.setState({ commands: [], deviceIdsByScope: {} })
  persisted.set(storageKey, serialized)
  await useOfflineCommandStore.persist.rehydrate()
  expect(state().commands[0]?.deviceId).toBe(devices[0])
  for (const [index, profile] of profiles.entries()) {
    session(profile)
    expect(prepared().deviceId).toBe(devices[index])
  }
})

test("retained caller payload/dependencies and submitted batch cannot mutate queued facts", () => {
  reset()
  const payload = {
    kind: "commercial_order" as const,
    lines: [
      {
        custom: "quick_sale" as const,
        amountMinor: 500,
        description: "Original rice",
      },
    ],
    initialPayment: {
      amountMinor: 500,
      clientPaymentId: "original-payment",
      method: "cash" as const,
    },
  }
  const dependencyClientIds = ["original-dependency"]
  state().queueCommand({
    clientCommandId: "immutable-command",
    createdAtClient: date,
    eventVersion: 1,
    dependencyClientIds,
    payload,
  })
  const before = JSON.stringify(state().commands[0])
  const originalLine = payload.lines[0]
  if (!originalLine) throw Error("Expected caller's original line")
  originalLine.description = "Mutated caller"
  payload.initialPayment.amountMinor = 999
  dependencyClientIds.push("new-dependency")
  expect(JSON.stringify(state().commands[0])).toBe(before)
  const batch = prepared()
  const line = batch.commands[0]?.payload.lines[0]
  if (!line || !("custom" in line))
    throw Error("Expected the submitted custom line")
  line.description = "Mutated submitted batch"
  batch.commands[0]?.dependencyClientIds.push("batch-dependency")
  expect(JSON.stringify(state().commands[0])).toBe(before)
})

test("server JSONB object-key reordering still permits matching current replay results", () => {
  reset()
  const id = queue()
  const batch = prepared()
  const server = result(id, "APPLIED", null, batch)
  server.payload = {
    actorUserId: "actor-a",
    lines: [{ description: "Rice", amountMinor: 500, custom: "quick_sale" }],
    kind: "commercial_order",
  }
  state().applyScopedReplayResults([server], batch)
  expect(state().commands[0]?.localStatus).toBe("applied")
  expect(state().commands[0]?.result).toEqual({ id: "order-from-actor-a" })
})

for (const mismatch of ["author", "payload"] as const) {
  test(`replay results with a mismatched server ${mismatch} are refused`, () => {
    reset()
    const id = queue()
    const batch = prepared()
    const server = result(id, "APPLIED", null, batch)
    server.payload = {
      actorUserId: mismatch === "author" ? "actor-b" : "actor-a",
      kind: "commercial_order",
      lines: [
        {
          custom: "quick_sale",
          amountMinor: mismatch === "payload" ? 999 : 500,
          description: "Rice",
        },
      ],
    }
    state().applyScopedReplayResults([server], batch)
    expect(state().commands[0]?.localStatus).toBe("pending")
    expect(state().commands[0]?.result).toBeUndefined()
  })
}

test("results without the captured action-boundary batch never update a command", () => {
  reset()
  const id = queue()
  const batch = prepared()
  state().applyReplayResults([result(id, "APPLIED", null, batch)])
  expect(state().commands[0]?.localStatus).toBe("pending")
  expect(state().commands[0]?.result).toBeUndefined()
})

test("a changed submitted envelope cannot reconcile a different stored command", () => {
  reset()
  const id = queue()
  const batch = prepared()
  const server = result(id, "APPLIED", null, batch)
  batch.commands[0]?.dependencyClientIds.push("different-dependency")
  state().applyScopedReplayResults([server], batch)
  expect(state().commands[0]?.localStatus).toBe("pending")
  expect(state().commands[0]?.result).toBeUndefined()
})

test("results from a different partition device never update a current command", () => {
  reset()
  const id = queue()
  const batch = prepared()
  const server = result(id, "APPLIED", null, batch)
  batch.deviceId = "another-device"
  state().applyScopedReplayResults([server], batch)
  expect(state().commands[0]?.localStatus).toBe("pending")
  expect(state().commands[0]?.result).toBeUndefined()
})

test("retained caller Date cannot change a queued command's immutable timestamp", () => {
  reset()
  const createdAtClient = new Date(date)
  state().queueCommand({
    clientCommandId: "immutable-time-command",
    createdAtClient,
    dependencyClientIds: [],
    eventVersion: 1,
    payload: {
      kind: "commercial_order",
      lines: [{ custom: "quick_sale", amountMinor: 500, description: "Rice" }],
    },
  })
  createdAtClient.setUTCFullYear(2030)
  expect(state().commands[0]?.createdAtClient).toEqual(date)
  expect(prepared().commands[0]?.createdAtClient).toEqual(date)
})

test("sign-out blocks new queue records and all existing command mutations", async () => {
  reset()
  queue()
  const batch = prepared()
  const before = JSON.stringify(state().commands)
  await deleteSession()
  expect(getSession()).toBeNull()
  expect(() => queue("signed-out-command")).toThrow(
    "original account, business and Store",
  )
  expect(activeBusinessOfflineCommands(state().commands, "business-a")).toEqual(
    [],
  )
  expect(pendingOfflineCommands(state(), "business-a")).toEqual([])
  state().discardCommand("command-current")
  state().retryCommand("command-current")
  state().applyReplayResults(
    [result("command-current", "APPLIED", null, batch)],
    batch,
  )
  expect(state().prepareReplay()).toBeNull()
  expect(JSON.stringify(state().commands)).toBe(before)
})

test("legacy v3 hydration retains unowned records privately and never adopts them into a session", async () => {
  reset()
  const legacy: LocalOfflineCommand = {
    businessId: "business-a",
    clientCommandId: "legacy-v3-command",
    createdAtClient: date,
    dependencyClientIds: [],
    eventVersion: 1,
    localStatus: "pending",
    payload: {
      kind: "commercial_order",
      lines: [{ custom: "quick_sale", amountMinor: 500 }],
    },
  }
  persisted.set(
    storageKey,
    JSON.stringify({
      version: 3,
      state: { commands: [legacy], deviceId: "legacy-global-device" },
    }),
  )
  await useOfflineCommandStore.persist.rehydrate()
  expect(state().hasHydrated).toBe(true)
  expect(state().commands).toHaveLength(1)
  expect(state().commands[0]?.createdAtClient).toBeInstanceOf(Date)
  expect(state().commands[0]?.createdAtClient).toEqual(date)
  expect(state().commands[0]).not.toHaveProperty("actorUserId")
  expect(state().commands[0]).not.toHaveProperty("storeId")
  expect(activeBusinessOfflineCommands(state().commands, "business-a")).toEqual(
    [],
  )
  expect(pendingOfflineCommands(state(), "business-a")).toEqual([])
  state().retryCommand("legacy-v3-command")
  state().discardCommand("legacy-v3-command")
  state().applyReplayResults([result("legacy-v3-command")])
  expect(state().commands[0]?.localStatus).toBe("pending")
  queue()
  const saved = JSON.parse(persisted.get(storageKey) ?? "null")
  expect(saved.state.commands).toHaveLength(2)
  expect(saved.state.commands[0].clientCommandId).toBe("legacy-v3-command")
  expect(saved.state.commands[0].actorUserId).toBeUndefined()
  expect(
    pendingOfflineCommands(state(), "business-a").map(
      (command) => command.clientCommandId,
    ),
  ).toEqual(["command-current"])
  // A legacy global ID is retained for recovery but never adopted by a partition.
  expect(state().deviceId).toBe("legacy-global-device")
  expect(prepared().deviceId).not.toBe("legacy-global-device")
  expect(prepared().commands.map((command) => command.clientCommandId)).toEqual(
    ["command-current"],
  )
})

test("legacy actor/business/Store records without a partition device stay quarantined", async () => {
  reset()
  const legacy: LocalOfflineCommand = {
    actorUserId: "actor-a",
    businessId: "business-a",
    storeId: "store-a",
    clientCommandId: "legacy-owned-no-device",
    createdAtClient: date,
    dependencyClientIds: [],
    eventVersion: 1,
    localStatus: "review",
    payload: {
      kind: "commercial_order",
      lines: [{ custom: "quick_sale", amountMinor: 500 }],
    },
  }
  persisted.set(
    storageKey,
    JSON.stringify({
      version: 3,
      state: { commands: [legacy], deviceId: "legacy-device" },
    }),
  )
  await useOfflineCommandStore.persist.rehydrate()
  const batch = prepared()
  expect(batch.commands).toEqual([])
  expect(activeBusinessOfflineCommands(state().commands, "business-a")).toEqual(
    [],
  )
  state().retryCommand(legacy.clientCommandId)
  state().discardCommand(legacy.clientCommandId)
  expect(state().commands[0]?.localStatus).toBe("review")
  expect(state().commands[0]?.deviceId).toBeUndefined()
  expect(state().commands).toHaveLength(1)
})

test("valid current replay results map applied, discarded, blocked, approval and review statuses", () => {
  reset()
  const cases = [
    ["APPLIED", null, "applied"],
    ["DISCARDED", null, "discarded"],
    ["BLOCKED", "DEPENDENCY_BLOCKED", "blocked"],
    ["REVIEW_REQUIRED", null, "approval"],
    ["REVIEW_REQUIRED", "INVALID_COMMAND", "review"],
  ] as const
  for (const [index, [status, conflictCode, localStatus]] of cases.entries()) {
    const id = queue(`status-command-${index}`)
    const batch = prepared()
    state().applyScopedReplayResults(
      [result(id, status, conflictCode, batch)],
      batch,
    )
    expect(state().commands[index]).toMatchObject({
      localStatus,
      conflictCode,
      result: { id: "order-from-actor-a" },
    })
  }
})

test("current retry and discard preserve the immutable command identity and payload", () => {
  reset()
  const id = queue()
  const original = state().commands[0]
  const batch = prepared()
  state().applyReplayResults(
    [result(id, "REVIEW_REQUIRED", "INVALID_COMMAND", batch)],
    batch,
  )
  state().retryCommand(id)
  expect(state().commands[0]).toMatchObject({
    clientCommandId: id,
    createdAtClient: date,
    actorUserId: "actor-a",
    businessId: "business-a",
    storeId: "store-a",
    localStatus: "pending",
    conflictCode: null,
    conflictMessage: null,
    payload: original?.payload,
  })
  expect(state().commands[0]?.authoritativeState).toBeUndefined()
  state().discardCommand(id)
  expect(state().commands[0]?.localStatus).toBe("discarded")
  expect(state().commands[0]?.payload).toEqual(original?.payload)
  expect(pendingOfflineCommands(state(), "business-a")).toEqual([])
})

for (const [label, profile] of [
  ["actor", actorB],
  ["Store", storeB],
  ["business", businessB],
] as const) {
  test(`late replay results from a different ${label} cannot apply to a colliding current command identity`, () => {
    reset()
    queue("shared-client-identity", "Actor A sale")
    const batch = prepared()
    const lateResults = [
      result("shared-client-identity", "APPLIED", null, batch),
    ]
    session(profile)
    queue("shared-client-identity", "Current scope sale")
    state().applyScopedReplayResults(lateResults, batch)
    const visible = activeBusinessOfflineCommands(
      state().commands,
      profile.businessId,
    )
    expect(visible).toHaveLength(1)
    expect(visible[0]?.localStatus).toBe("pending")
    expect(visible[0]?.result).toBeUndefined()
    expect(state().commands[0]?.localStatus).toBe("pending")
  })
}
