import { beforeEach, expect, mock, test } from "bun:test"
import {
  type MobileActivityInput,
  mobileActivityInputSchema,
} from "@ewatrade/events/mobile-activity"
import { DOMParser } from "@xmldom/xmldom"
import { type ReactNode, act, createElement, useEffect, useRef } from "react"
import type { OfflineCommandScope } from "../offline-command-scope"
import { offlineCommandScopeKey } from "../offline-command-scope"

// Actual recovery hook/component/coordinator/session/Zustand persist store.
// Only native presentation/storage, auth notification and API/query ports are
// inert. No real transport, server, business read or registration can run.
const source = new URL("../../", import.meta.url)
function standIn(path: string, exports: Record<string, unknown>) {
  mock.module(new URL(path, source).pathname, () => exports)
}
const secure = new Map<string, string>()
const persisted = new Map<string, string>()
let nonce = 0
let generation = 0
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
standIn("hooks/use-auth", {
  useAuthContext: () => ({
    profile: getSession()?.profile,
    session: getSession(),
  }),
})
type Ack = { clientCommandId: string; status: "held" | "approved" | "rejected" }
const requests: unknown[] = []
const activities: MobileActivityInput[] = []
let trackerFailure = false
let transport: (input: unknown) => Promise<Ack[]> = async () => []
let mutationInstances = 0
const dispatchInstances: number[] = []
standIn("trpc/client", {
  getDataCacheGeneration: () => generation,
  useTRPC: () => ({
    offline: { recover: { mutationOptions: () => ({ kind: "recover" }) } },
  }),
})
mock.module("@tanstack/react-query", () => ({
  useQuery: () => {
    throw Error("Recovery must not read business data")
  },
  useMutation: ({ kind }: { kind: string }) => {
    if (kind !== "recover")
      throw Error("Recovery must not register or mutate business data")
    const identity = useRef(++mutationInstances).current
    return {
      mutateAsync: async (input: unknown) => {
        dispatchInstances.push(identity)
        requests.push(structuredClone(input))
        return transport(input)
      },
    }
  },
}))
type Button = {
  onPress: () => Promise<void>
  disabled: boolean
  isLoading: boolean
}
const buttons = new Map<object, Button>()
function box({ children }: { children?: ReactNode }) {
  return createElement("div", null, children)
}
standIn("components/ui/text", { Text: box })
standIn("components/ui/view", { View: box })
standIn("components/mobile/status-banner", {
  StatusBanner: ({ message }: { message: string }) =>
    createElement("div", null, message),
})
standIn("components/mobile/action-button", {
  ActionButton: (props: Button & { children?: ReactNode }) => {
    const key = useRef({}).current
    buttons.set(key, props)
    useEffect(
      () => () => {
        buttons.delete(key)
      },
      [key],
    )
    return createElement(
      "button",
      { type: "button", disabled: props.disabled },
      props.children,
    )
  },
})
const { useOfflineCommandStore: queue } = await import(
  "../../store/offlineCommandStore"
)
const { useOperationalModeStore } = await import(
  "../../store/operationalModeStore"
)
standIn("runtime/analytics-runtime", {
  trackMobileActivity: (event: MobileActivityInput) => {
    if (trackerFailure) throw Error("Inert tracker failure")
    activities.push(structuredClone(event))
  },
})
const { useOfflineRecovery } = await import("../../hooks/use-offline-recovery")
const { NoAccessSavedSales } = await import(
  "../../components/mobile/no-access-saved-sales"
)
await queue.persist.rehydrate()
const owner = {
  id: "original-actor",
  businessId: "business-a",
  storeId: "store-a",
  name: "Original rep",
  email: "rep@example.test",
}
const originalScope: OfflineCommandScope = {
  actorUserId: owner.id,
  businessId: "business-a",
  storeId: "store-a",
}
const key = offlineCommandScopeKey(originalScope)
const state = () => queue.getState()
function noAccess(token = "real-session-one") {
  setSession({
    token,
    profile: { id: owner.id, name: owner.name, email: owner.email },
    accessProfile: { hasBusinessAccess: false, hasCustomerHistory: false },
  })
}
function queued(id = "original-sale", profile = owner) {
  setSession({ token: "real-capturing-session", profile })
  state().queueCommand({
    clientCommandId: id,
    createdAtClient: new Date("2026-10-17T10:00:00Z"),
    dependencyClientIds: [],
    eventVersion: 1,
    payload: {
      kind: "commercial_order",
      fulfillNow: true,
      lines: [
        {
          custom: "quick_sale",
          amountMinor: 500,
          description: "Original rice",
        },
      ],
      initialPayment: {
        amountMinor: 500,
        clientPaymentId: `${id}:payment`,
        method: "cash",
        moneyAccountId: "original-account",
      },
    },
  })
  noAccess()
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (value: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
beforeEach(() => {
  secure.clear()
  persisted.clear()
  buttons.clear()
  requests.length = dispatchInstances.length = 0
  activities.length = 0
  trackerFailure = false
  generation = 0
  queue.setState({ commands: [], deviceIdsByScope: {}, hasHydrated: true })
  useOperationalModeStore.setState({ isOfflineMode: false })
  noAccess()
  transport = async () => [{ clientCommandId: "original-sale", status: "held" }]
})
type Model = ReturnType<typeof useOfflineRecovery>
async function mount(component = false, rootHook = true) {
  const document = new DOMParser().parseFromString(
    "<html><body/></html>",
    "text/html",
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
  let model: Model | undefined
  function Probe() {
    const hook = useOfflineRecovery()
    if (rootHook) model = hook
    return component ? createElement(NoAccessSavedSales) : null
  }
  const ui = {
    get model() {
      if (!model) throw Error("Recovery hook did not mount")
      return model
    },
    get text() {
      return host.textContent ?? ""
    },
    render: async () => {
      await act(async () => root.render(createElement(Probe)))
    },
    run: async (fn: () => unknown) => {
      await act(async () => {
        await fn()
      })
    },
    start: async <T,>(fn: () => Promise<T>) => {
      let task: Promise<T> | undefined
      await act(async () => {
        task = fn()
      })
      if (!task) throw Error("Expected asynchronous user action")
      return { task }
    },
    close: async () => {
      await act(async () => root.unmount())
    },
  }
  await ui.render()
  return ui
}

test("mount sends nothing, reads no business data, registers nothing and never mints a device", async () => {
  queued()
  const before = structuredClone(state().commands)
  const nonceBefore = nonce
  const ui = await mount(true)
  try {
    expect(requests).toEqual([])
    expect(nonce).toBe(nonceBefore)
    expect(state().commands).toEqual(before)
    expect(ui.text).toContain("1 sale")
  } finally {
    await ui.close()
  }
})

for (const status of ["held", "approved", "rejected"] as const) {
  test(`explicit recovery transmits exact issued envelope and applies ${status} without a canonical receipt`, async () => {
    queued()
    const expected = state().prepareRecovery(originalScope)
    if (!expected) throw Error("Expected original issued batch")
    const nonceBefore = nonce
    transport = async () => [{ clientCommandId: "original-sale", status }]
    const ui = await mount()
    try {
      let result: Awaited<ReturnType<Model["send"]>> | undefined
      await ui.run(async () => {
        result = await ui.model.send(key, originalScope)
      })
      expect(requests).toEqual([
        {
          deviceId: expected.deviceId,
          storeId: expected.scope.storeId,
          commands: expected.commands,
        },
      ])
      expect(result).toMatchObject({
        outcome: { status: "applied" },
        [status]: 1,
      })
      expect(state().commands[0]).toMatchObject({
        recoveryHeld: true,
        localStatus:
          status === "held"
            ? "approval"
            : status === "approved"
              ? "applied"
              : "discarded",
      })
      expect(state().commands[0]?.result).toBeUndefined()
      expect(state().commands[0]?.authoritativeState).toBeUndefined()
      expect(nonce).toBe(nonceBefore)
      expect(activities).toHaveLength(1)
      expect(activities[0]).toMatchObject({
        name: "mobile_sync_result",
        properties: {
          status: status === "approved" ? "completed" : "partial",
          item_count: 1,
        },
      })
      expect(mobileActivityInputSchema.safeParse(activities[0]).success).toBe(
        true,
      )
    } finally {
      await ui.close()
    }
  })
}

for (const failure of [
  Error("network unavailable"),
  { data: { code: "FORBIDDEN" } },
]) {
  test(`failed/refused explicit recovery preserves every draft fact (${failure instanceof Error ? "network" : "denied"})`, async () => {
    queued()
    const before = structuredClone(state().commands)
    transport = async () => {
      throw failure
    }
    const ui = await mount()
    try {
      let result: Awaited<ReturnType<Model["send"]>> | undefined
      await ui.run(async () => {
        result = await ui.model.send(key, originalScope)
      })
      expect(result?.outcome).toEqual({ status: "failed", error: failure })
      expect(activities).toHaveLength(1)
      expect(activities[0]).toMatchObject({
        name: "mobile_sync_result",
        properties: { status: "unknown", item_count: 1 },
      })
      expect(state().commands).toEqual(before)
      expect(ui.model.sending).toBeNull()
    } finally {
      await ui.close()
    }
  })
}

for (const changed of [
  "actor",
  "access",
  "generation",
  "token",
  "full scope",
  "device",
] as const) {
  test(`retained recovery render cannot dispatch after ${changed} changes`, async () => {
    queued()
    const ui = await mount()
    const send = ui.model.send
    try {
      const session = getSession()
      if (!session) throw Error("Expected signed-in actor")
      if (changed === "actor")
        setSession({
          ...session,
          profile: { ...session.profile, id: "foreign-actor" },
        })
      if (changed === "access")
        setSession({
          ...session,
          accessProfile: { hasBusinessAccess: true, hasCustomerHistory: false },
        })
      if (changed === "generation") generation++
      if (changed === "token") noAccess("real-session-two")
      if (changed === "full scope")
        setSession({
          ...session,
          profile: { ...owner, businessId: "business-b", storeId: "store-b" },
        })
      if (changed === "device") queue.setState({ deviceIdsByScope: {} })
      let result: Awaited<ReturnType<Model["send"]>> | undefined
      await ui.run(async () => {
        result = await send(key, originalScope)
      })
      expect(result?.outcome.status).toBe("retired")
      expect(requests).toEqual([])
    } finally {
      await ui.close()
    }
  })
}

test("unknown explicit partition is inert and never adopts or creates a device", async () => {
  queued()
  const nonceBefore = nonce
  const ui = await mount()
  try {
    await ui.run(() =>
      ui.model.send("unknown", { ...originalScope, storeId: "unknown-store" }),
    )
    expect(requests).toEqual([])
    expect(nonce).toBe(nonceBefore)
  } finally {
    await ui.close()
  }
})

test("logout and unmounted retained handlers cannot start recovery", async () => {
  queued()
  const ui = await mount()
  const send = ui.model.send
  await deleteSession()
  await ui.run(() => send(key, originalScope))
  noAccess()
  await ui.close()
  await send(key, originalScope)
  expect(requests).toEqual([])
})

test("root and component share one transport flight and superseded queued requests resolve independently", async () => {
  queued()
  const pending = deferred<Ack[]>()
  transport = () => pending.promise
  const ui = await mount(true)
  try {
    const { task: first } = await ui.start(() =>
      ui.model.send(key, originalScope),
    )
    const { task: second } = await ui.start(() =>
      ui.model.send(key, originalScope),
    )
    const button = [...buttons.values()][0]
    if (!button) throw Error("Expected actual component action")
    const { task: third } = await ui.start(() => button.onPress())
    expect(requests).toHaveLength(1)
    expect((await second).outcome.status).toBe("superseded")
    await ui.run(async () => {
      pending.resolve([{ clientCommandId: "original-sale", status: "held" }])
      await first
      await third
    })
    expect(requests).toHaveLength(2)
    expect(state().commands[0]?.localStatus).toBe("approval")
  } finally {
    await ui.close()
  }
})

test("queued recovery originating from an unmounted hook never dispatches", async () => {
  queued()
  const pending = deferred<Ack[]>()
  let calls = 0
  transport = async () =>
    ++calls === 1
      ? pending.promise
      : [{ clientCommandId: "original-sale", status: "held" }]
  const ui = await mount()
  const { task: first } = await ui.start(() =>
    ui.model.send(key, originalScope),
  )
  const { task: waiting } = await ui.start(() =>
    ui.model.send(key, originalScope),
  )
  await ui.close()
  pending.resolve([{ clientCommandId: "original-sale", status: "held" }])
  await first
  const result = await waiting
  expect(result.outcome.status).toBe("retired")
  expect(requests).toHaveLength(1)
})

for (const changed of [
  "actor",
  "access",
  "generation",
  "scope",
  "device",
] as const) {
  test(`in-flight ${changed} retirement never exposes acknowledgement counts or alters drafts`, async () => {
    queued()
    const before = structuredClone(state().commands)
    const pending = deferred<Ack[]>()
    transport = () => pending.promise
    const ui = await mount()
    try {
      const { task: send } = await ui.start(() =>
        ui.model.send(key, originalScope),
      )
      const session = getSession()
      if (!session) throw Error("Expected current session")
      if (changed === "actor")
        setSession({
          ...session,
          profile: { ...session.profile, id: "foreign-actor" },
        })
      if (changed === "access")
        setSession({
          ...session,
          accessProfile: { hasBusinessAccess: true, hasCustomerHistory: false },
        })
      if (changed === "generation") generation++
      if (changed === "scope")
        setSession({
          ...session,
          profile: { ...owner, businessId: "business-b", storeId: "store-b" },
        })
      if (changed === "device") queue.setState({ deviceIdsByScope: {} })
      let result: Awaited<ReturnType<Model["send"]>> | undefined
      await ui.run(async () => {
        pending.resolve([
          { clientCommandId: "original-sale", status: "approved" },
        ])
        result = await send
      })
      expect(result).toEqual({
        outcome: { status: "retired" },
        sent: true,
        held: 0,
        approved: 0,
        rejected: 0,
      })
      expect(state().commands).toEqual(before)
    } finally {
      await ui.close()
    }
  })
}

test("same-actor token replacement during transport cannot report applied while the issued-batch store refuses it", async () => {
  queued()
  const pending = deferred<Ack[]>()
  transport = () => pending.promise
  const ui = await mount()
  try {
    const { task: sending } = await ui.start(() =>
      ui.model.send(key, originalScope),
    )
    noAccess("new-real-login-token")
    let result: Awaited<ReturnType<Model["send"]>> | undefined
    await ui.run(async () => {
      pending.resolve([
        { clientCommandId: "original-sale", status: "approved" },
      ])
      result = await sending
    })
    expect(state().commands[0]?.localStatus).toBe("pending")
    expect(result?.outcome.status).toBe("retired")
    expect(result?.approved).toBe(0)
  } finally {
    await ui.close()
  }
})

test("a superseded send must not clear sending while the original request is still active", async () => {
  queued()
  const pending = deferred<Ack[]>()
  transport = () => pending.promise
  const ui = await mount()
  let first: ReturnType<Model["send"]> | undefined
  let third: ReturnType<Model["send"]> | undefined
  try {
    first = (await ui.start(() => ui.model.send(key, originalScope))).task
    const { task: second } = await ui.start(() =>
      ui.model.send(key, originalScope),
    )
    third = (await ui.start(() => ui.model.send(key, originalScope))).task
    await ui.run(() => second)
    expect(ui.model.sending).toBe(key)
  } finally {
    await ui.run(async () => {
      pending.resolve([{ clientCommandId: "original-sale", status: "held" }])
      await first
      await third
    })
    await ui.close()
  }
})

test("a second mounted recovery consumer shows a shared in-flight request as busy", async () => {
  queued()
  const pending = deferred<Ack[]>()
  transport = () => pending.promise
  const ui = await mount(true)
  let first: ReturnType<Model["send"]> | undefined
  try {
    await ui.run(() => {
      first = ui.model.send(key, originalScope)
    })
    const button = [...buttons.values()][0]
    expect(button?.disabled).toBe(true)
    expect(button?.isLoading).toBe(true)
  } finally {
    await ui.run(async () => {
      pending.resolve([{ clientCommandId: "original-sale", status: "held" }])
      await first
    })
    await ui.close()
  }
})

test("actual component cannot repeat a retained send action from an earlier sign-in token", async () => {
  queued()
  const ui = await mount(true)
  try {
    const button = [...buttons.values()][0]
    if (!button) throw Error("Expected saved-sales action")
    noAccess("new-signin-token")
    await ui.run(() => button.onPress())
    expect(requests).toEqual([])
  } finally {
    await ui.close()
  }
})

test("actual component does not tell the user nothing was sent after a dispatched request is retired", async () => {
  queued()
  const pending = deferred<Ack[]>()
  transport = () => pending.promise
  const ui = await mount(true)
  try {
    const button = [...buttons.values()][0]
    if (!button) throw Error("Expected saved-sales action")
    const { task: send } = await ui.start(() => button.onPress())
    expect(requests).toHaveLength(1)
    generation++
    await ui.run(async () => {
      pending.resolve([{ clientCommandId: "original-sale", status: "held" }])
      await send
    })
    expect(ui.text).not.toContain("nothing was sent")
    expect(state().commands[0]?.localStatus).toBe("pending")
  } finally {
    await ui.close()
  }
})

test("queued second partition keeps its own acknowledgements when first partition device retires", async () => {
  queued()
  const secondScope = { ...originalScope, storeId: "store-b" }
  const secondKey = offlineCommandScopeKey(secondScope)
  queued("second-sale", { ...owner, storeId: secondScope.storeId })
  const secondDevice = state().deviceIdsByScope[secondKey]
  const beforeFirst = structuredClone(state().commands[0])
  const pending = deferred<Ack[]>()
  transport = async () =>
    requests.length === 1
      ? pending.promise
      : [{ clientCommandId: "second-sale", status: "held" }]
  const ui = await mount(true)
  let first: ReturnType<Model["send"]> | undefined
  let second: ReturnType<Model["send"]> | undefined
  try {
    first = (await ui.start(() => ui.model.send(key, originalScope))).task
    second = (await ui.start(() => ui.model.send(secondKey, secondScope))).task
    expect(requests).toHaveLength(1)
    await ui.run(() =>
      queue.setState({
        deviceIdsByScope: {
          ...state().deviceIdsByScope,
          [key]: "replaced-first-device",
        },
      }),
    )
    await ui.run(() =>
      pending.resolve([
        { clientCommandId: "original-sale", status: "approved" },
      ]),
    )
    expect(await first).toEqual({
      outcome: { status: "retired" },
      sent: true,
      held: 0,
      approved: 0,
      rejected: 0,
    })
    expect(await second).toEqual({
      outcome: { status: "applied", refreshFailed: false },
      sent: true,
      held: 1,
      approved: 0,
      rejected: 0,
    })
    expect(requests[1]).toMatchObject({
      storeId: "store-b",
      deviceId: secondDevice,
    })
    expect(state().commands[0]).toEqual(beforeFirst)
    expect(state().commands[1]?.localStatus).toBe("approval")
    expect(ui.model.sending).toBeNull()
  } finally {
    await ui.run(async () => {
      pending.resolve([])
      await first
      await second
    })
    await ui.close()
  }
})

test("queued partition loses its device before its turn and is not silently adopted", async () => {
  queued()
  const secondScope = { ...originalScope, storeId: "store-b" }
  const secondKey = offlineCommandScopeKey(secondScope)
  queued("second-sale", { ...owner, storeId: secondScope.storeId })
  const pending = deferred<Ack[]>()
  transport = () => pending.promise
  const ui = await mount(true)
  const nonceBefore = nonce
  let first: ReturnType<Model["send"]> | undefined
  let second: ReturnType<Model["send"]> | undefined
  try {
    first = (await ui.start(() => ui.model.send(key, originalScope))).task
    second = (await ui.start(() => ui.model.send(secondKey, secondScope))).task
    const ids = { ...state().deviceIdsByScope }
    delete ids[secondKey]
    await ui.run(() => queue.setState({ deviceIdsByScope: ids }))
    await ui.run(() =>
      pending.resolve([{ clientCommandId: "original-sale", status: "held" }]),
    )
    expect(await second).toEqual({
      outcome: { status: "empty" },
      sent: false,
      held: 0,
      approved: 0,
      rejected: 0,
    })
    expect(requests).toHaveLength(1)
    expect(state().commands[1]?.localStatus).toBe("pending")
    expect(nonce).toBe(nonceBefore)
    expect(ui.model.sending).toBeNull()
  } finally {
    await ui.run(async () => {
      pending.resolve([])
      await first
      await second
    })
    await ui.close()
  }
})

test("actual recovery sync reports all submitted acknowledgements without business identifiers", async () => {
  queued("first-sale")
  queued("second-sale")
  transport = async () => [
    { clientCommandId: "first-sale", status: "approved" },
    { clientCommandId: "second-sale", status: "held" },
  ]
  const ui = await mount()
  try {
    await ui.run(async () => {
      expect((await ui.model.send(key, originalScope)).outcome.status).toBe(
        "applied",
      )
    })
    expect(activities).toHaveLength(1)
    expect(activities[0]).toMatchObject({
      name: "mobile_sync_result",
      properties: { status: "partial", item_count: 2 },
    })
    expect(mobileActivityInputSchema.safeParse(activities[0]).success).toBe(
      true,
    )
    expect(JSON.stringify(activities)).not.toContain("first-sale")
    expect(JSON.stringify(activities)).not.toContain("original-account")
  } finally {
    await ui.close()
  }
})

test("throwing tracker cannot alter actual recovery acknowledgement or held state", async () => {
  queued()
  trackerFailure = true
  const ui = await mount()
  try {
    await ui.run(async () => {
      expect(await ui.model.send(key, originalScope)).toMatchObject({
        outcome: { status: "applied" },
        sent: true,
        held: 1,
      })
    })
    expect(state().commands[0]?.recoveryHeld).toBe(true)
    expect(activities).toEqual([])
  } finally {
    await ui.close()
  }
})

test("recovery completion after originating hook unmount emits no activity", async () => {
  queued()
  const response = deferred<Ack[]>()
  transport = () => response.promise
  const ui = await mount()
  const { task } = await ui.start(() => ui.model.send(key, originalScope))
  await ui.close()
  response.resolve([{ clientCommandId: "original-sale", status: "held" }])
  await task
  expect(activities).toEqual([])
})

test("recovery telemetry cannot revive after an offline A-to-B-to-A transition without React render", async () => {
  queued()
  const response = deferred<Ack[]>()
  transport = () => response.promise
  const ui = await mount()
  const { task } = await ui.start(() => ui.model.send(key, originalScope))
  try {
    useOperationalModeStore.setState({ isOfflineMode: true })
    useOperationalModeStore.setState({ isOfflineMode: false })
    await ui.run(async () => {
      response.resolve([{ clientCommandId: "original-sale", status: "held" }])
      await task
    })
    expect(activities).toEqual([])
  } finally {
    response.resolve([])
    await task
    await ui.close()
  }
})
