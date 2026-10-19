import { beforeEach, expect, mock, test } from "bun:test"
import { DOMParser } from "@xmldom/xmldom"
import { act, createElement } from "react"

// Actual correction store actions, actual hook, actual session-store and
// operational-mode stores with their monotonic generations, and the real
// Zustand persist path over an inert AsyncStorage. Only the tRPC mutation
// transport, auth notification and data-cache generation are ports.
const source = new URL("../", import.meta.url)
function standIn(path: string, exports: Record<string, unknown>) {
  mock.module(new URL(path, source).pathname, () => exports)
}
const secure = new Map<string, string>()
const persisted = new Map<string, string>()
let failWrites = false
/** Corrupts what storage hands back (partial read). */
let tamperReads = false
/** When set, writes wait for this gate before landing. */
let writeGate: Promise<void> | null = null
let nonce = 0
let dataGeneration = 0
mock.module("expo-crypto", () => ({ randomUUID: () => `uuid-${++nonce}` }))
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
    getItem: async (key: string) => {
      const raw = persisted.get(key) ?? null
      if (!raw || !tamperReads) return raw
      const parsed = JSON.parse(raw)
      for (const attempt of Object.values(parsed.state?.corrections ?? {}))
        Reflect.deleteProperty(attempt as object, "replacementClientPaymentId")
      return JSON.stringify(parsed)
    },
    setItem: async (key: string, value: string) => {
      if (writeGate) await writeGate
      // A write that doesn't stick: resolves, but nothing is stored.
      if (failWrites) return
      persisted.set(key, value)
    },
    removeItem: async (key: string) => {
      persisted.delete(key)
    },
  },
}))
Object.assign(globalThis, { __DEV__: false })
const { getSession, setSession } = await import("../lib/session-store")
standIn("hooks/use-auth", {
  useAuthContext: () => ({
    profile: getSession()?.profile,
    token: getSession()?.token,
    accessProfile: getSession()?.accessProfile,
  }),
})
type Transport = (input: Record<string, unknown>) => Promise<unknown>
const requests: Record<string, unknown>[] = []
let transport: Transport = async () => {
  throw Error("no transport configured")
}
/** What storage held at the moment each request was sent. */
const savedAtSend: unknown[] = []
standIn("trpc/client", {
  getDataCacheGeneration: () => dataGeneration,
  useTRPC: () => ({
    offline: {
      correctBlankQuickSale: {
        mutationOptions: (options: Record<string, unknown>) => ({
          ...options,
          mutationFn: async (input: Record<string, unknown>) => {
            requests.push(structuredClone(input))
            savedAtSend.push(storedCorrections())
            return transport(input)
          },
        }),
      },
    },
  }),
})
const { QueryClient, QueryClientProvider } = await import(
  "@tanstack/react-query"
)
const { useOfflineCommandStore: queue } = await import(
  "../store/offlineCommandStore"
)
const { useOperationalModeStore } = await import(
  "../store/operationalModeStore"
)
const { useQuickSaleCorrection } = await import("./use-quick-sale-correction")
type Pressable = {
  onPress?: () => unknown
  children?: unknown
  disabled?: boolean
}
type Field = {
  onChangeText?: (value: string) => void
  label?: string
  value?: string
}
/** Latest rendered props of each sheet button, by label. */
const buttons = new Map<string, Pressable>()
const fields: Field[] = []
const box = ({ children }: { children?: unknown }) =>
  createElement("div", null, children as never)
standIn("components/ui/view", { View: box })
standIn("components/ui/text", { Text: box })
standIn("components/mobile/status-banner", {
  StatusBanner: ({ title }: { title?: string }) =>
    createElement("div", null, title),
})
standIn("components/ui/bottom-sheet-keyboard-aware-scroll-view", {
  BottomSheetKeyboardAwareScrollView: box,
})
standIn("components/ui/modal", {
  Modal: box,
  useModal: () => ({ present() {}, dismiss() {}, ref: null }),
})
standIn("components/mobile/form-field", {
  FormField: (props: Field) => {
    fields.push(props)
    return createElement("input", { readOnly: true, value: props.value ?? "" })
  },
})
standIn("components/mobile/action-button", {
  ActionButton: (props: Pressable) => {
    buttons.set(String(props.children), props)
    return createElement("button", { type: "button" }, props.children as never)
  },
})
const { QuickSaleCorrectionSheet } = await import(
  "../components/mobile/quick-sale-correction-sheet"
)
const { correctionAvailability, correctionView } = await import(
  "../lib/quick-sale-correction"
)
const { expectedCorrectionEnvelope } = await import(
  "../lib/quick-sale-correction"
)
const { offlineCommandScopeKey } = await import("../lib/offline-command-scope")
await queue.persist.rehydrate()

const STORAGE_KEY = "onboarding-storage:ewatrade-mobile-offline-commands"
function storedCorrections() {
  const raw = persisted.get(STORAGE_KEY)
  return raw ? JSON.parse(raw).state.corrections : undefined
}
const profileA = {
  id: "actor-a",
  businessId: "business-a",
  storeId: "store-a",
  name: "Rep A",
  email: "a@example.test",
  role: "CASHIER",
}
const scopeA = {
  actorUserId: "actor-a",
  businessId: "business-a",
  storeId: "store-a",
}
const createdAt = new Date("2026-10-13T16:12:00.000Z")
const originalPayload = {
  lines: [
    { custom: "quick_sale", amountMinor: 1_200_000 },
    {
      custom: "additional_cost",
      amountMinor: 150_000,
      description: "Delivery",
    },
  ],
  initialPayment: {
    clientPaymentId: "payment-original",
    amountMinor: 1_350_000,
    method: "cash",
  },
  customerName: "Walk-in",
}
function seed(
  extra: Record<string, unknown>[] = [],
  original: Record<string, unknown> = {},
) {
  queue.setState({
    commands: [
      {
        clientCommandId: "command-original",
        eventVersion: 1,
        payload: structuredClone(originalPayload),
        dependencyClientIds: [],
        createdAtClient: new Date(createdAt),
        ...scopeA,
        deviceId: "device-a",
        displayTotal: { amountMinor: 1_350_000, currencyCode: "NGN" },
        localStatus: "blocked",
        ...original,
      },
      ...extra,
    ] as never,
    corrections: {},
    deviceIdsByScope: { [offlineCommandScopeKey(scopeA)]: "device-a" },
    hasHydrated: true,
  })
}
function signIn(profile = profileA, token = "session-token-a") {
  setSession({ token, profile } as never)
}
beforeEach(() => {
  failWrites = false
  tamperReads = false
  writeGate = null
  dataGeneration++
  requests.length = 0
  savedAtSend.length = 0
  persisted.clear()
  useOperationalModeStore.setState({ isOfflineMode: false })
  signIn()
  seed()
  transport = async () => {
    throw Error("no transport configured")
  }
})
const descriptions = { 0: "  2 bags of rice " }
function replacedReceipt(
  input: Record<string, unknown>,
  status = "PENDING",
  recoveryHeld = false,
) {
  const attempt = Object.values(queue.getState().corrections)[0]
  if (!attempt) throw Error("Expected a saved attempt")
  return {
    outcome: "replaced",
    originalClientCommandId: (input.envelope as { clientCommandId: string })
      .clientCommandId,
    originalPayloadHash: "hash-original",
    replacement: {
      id: "server-row",
      envelope: expectedCorrectionEnvelope(attempt),
      payloadHash: "hash-replacement",
      status,
      recoveryHeld,
      result: null,
    },
    replacedAt: new Date(),
  }
}
const original = () =>
  queue
    .getState()
    .commands.find((c) => c.clientCommandId === "command-original")
const attemptNow = () => Object.values(queue.getState().corrections)[0]

async function mount() {
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
    document,
    window,
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
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  let latest: ReturnType<typeof useQuickSaleCorrection> | undefined
  function Probe() {
    latest = useQuickSaleCorrection()
    return null
  }
  const render = async () => {
    await act(async () =>
      root.render(
        createElement(QueryClientProvider, { client }, createElement(Probe)),
      ),
    )
  }
  await render()
  return {
    render,
    get hook() {
      if (!latest) throw Error("not mounted")
      return latest
    },
    run: async <T,>(fn: () => Promise<T>) => {
      let value: T | undefined
      await act(async () => {
        value = await fn()
      })
      return value as T
    },
    close: async () => act(async () => root.unmount()),
  }
}

test("the fix is saved before the first send, then the server replacement is installed exactly", async () => {
  transport = async (input) => replacedReceipt(input, "REVIEW_REQUIRED")
  const ui = await mount()
  try {
    expect(
      await ui.run(() => ui.hook.start("command-original", descriptions)),
    ).toBe("settled")
    expect(requests).toHaveLength(1)
    const saved = savedAtSend[0] as Record<
      string,
      { replacementClientCommandId: string }
    >
    expect(Object.values(saved)[0]?.replacementClientCommandId).toBe(
      requests[0]?.replacementClientCommandId as string,
    )
    expect(requests[0]).toMatchObject({
      deviceId: "device-a",
      storeId: "store-a",
      descriptions: [{ lineIndex: 0, description: "2 bags of rice" }],
      envelope: { clientCommandId: "command-original" },
    })
    expect(requests[0]?.replacementClientPaymentId).toBeTruthy()
    // Original kept as exact history; replacement installed as the server said.
    expect(original()).toMatchObject({
      localStatus: "discarded",
      correctedBy: requests[0]?.replacementClientCommandId,
      payload: originalPayload,
    })
    const installed = queue
      .getState()
      .commands.find(
        (c) => c.clientCommandId === requests[0]?.replacementClientCommandId,
      )
    expect(installed).toMatchObject({
      ...scopeA,
      deviceId: "device-a",
      localStatus: "approval",
      displayTotal: { amountMinor: 1_350_000, currencyCode: "NGN" },
    })
    expect(installed?.payload.lines[0]).toEqual({
      custom: "quick_sale",
      amountMinor: 1_200_000,
      description: "2 bags of rice",
    })
    expect(installed?.payload.lines[1] as unknown).toEqual(
      originalPayload.lines[1],
    )
    expect(attemptNow()?.state).toBe("replaced")
  } finally {
    await ui.close()
  }
})

test("already recorded reconciles the original with its result and creates nothing new", async () => {
  transport = async () => ({
    outcome: "already_applied",
    originalClientCommandId: "command-original",
    result: { orderId: "order-a", orderNumber: "SALE-9" },
  })
  const ui = await mount()
  try {
    await ui.run(() => ui.hook.start("command-original", descriptions))
    expect(original()).toMatchObject({
      localStatus: "applied",
      result: { orderId: "order-a" },
    })
    expect(queue.getState().commands).toHaveLength(1)
    expect(attemptNow()?.state).toBe("already_applied")
  } finally {
    await ui.close()
  }
})

test("a lost reply re-sends the exact same fix, also after a restart; edits can't mint another", async () => {
  transport = async () => {
    throw Object.assign(Error("socket closed"), {})
  }
  const ui = await mount()
  try {
    await ui.run(() => ui.hook.start("command-original", descriptions))
    expect(attemptNow()?.state).toBe("unknown")
    // A different description later still returns the same proposal.
    const again = await queue
      .getState()
      .prepareCorrection("command-original", { 0: "Beans" })
    expect(again?.descriptions).toEqual([
      { lineIndex: 0, description: "2 bags of rice" },
    ])
    await ui.run(() => ui.hook.checkAgain(attemptNow()?.key ?? ""))
    expect(requests).toHaveLength(2)
    expect(requests[1]).toEqual(requests[0] as Record<string, unknown>)
    // Restart: memory is lost; storage restores the attempt as unknown with
    // the same identities.
    await new Promise((resolve) => setTimeout(resolve, 5))
    const saved = persisted.get(STORAGE_KEY)
    queue.setState({ corrections: {}, commands: [] })
    await new Promise((resolve) => setTimeout(resolve, 5))
    if (saved) persisted.set(STORAGE_KEY, saved)
    await queue.persist.rehydrate()
    queue.setState({ hasHydrated: true })
    expect(attemptNow()?.state).toBe("unknown")
    expect(attemptNow()?.replacementClientCommandId).toBe(
      requests[0]?.replacementClientCommandId as string,
    )
    transport = async (input) => replacedReceipt(input)
    await ui.run(() => ui.hook.checkAgain(attemptNow()?.key ?? ""))
    expect(requests[2]).toEqual(requests[0] as Record<string, unknown>)
    expect(attemptNow()?.state).toBe("replaced")
  } finally {
    await ui.close()
  }
})

test("a definitive refusal keeps the original and allows no new proposal", async () => {
  transport = async () => {
    throw Object.assign(Error("refused"), {
      data: { code: "BAD_REQUEST", httpStatus: 400 },
    })
  }
  const ui = await mount()
  try {
    await ui.run(() => ui.hook.start("command-original", descriptions))
    expect(attemptNow()?.state).toBe("refused")
    expect(original()).toMatchObject({
      localStatus: "blocked",
      payload: originalPayload,
    })
    expect(
      await ui.run(() => ui.hook.checkAgain(attemptNow()?.key ?? "")),
    ).toBe("inert")
    expect(requests).toHaveLength(1)
  } finally {
    await ui.close()
  }
})

test("a mismatched receipt installs nothing and keeps the same fix to check again", async () => {
  transport = async (input) => {
    const receipt = replacedReceipt(input) as unknown as {
      replacement: { envelope: { payload: { customerName: string } } }
    }
    receipt.replacement.envelope.payload.customerName = "Someone else"
    return receipt
  }
  const ui = await mount()
  try {
    await ui.run(() => ui.hook.start("command-original", descriptions))
    expect(queue.getState().commands).toHaveLength(1)
    expect(original()?.localStatus).toBe("blocked")
    expect(attemptNow()?.state).toBe("unknown")
  } finally {
    await ui.close()
  }
})

test("only an issued ticket can settle; a forged ticket or replay of one is refused", async () => {
  const attempt = await queue
    .getState()
    .prepareCorrection("command-original", descriptions)
  if (!attempt) throw Error("expected attempt")
  const forged = Object.freeze({ key: attempt.key, request: {} }) as never
  expect(
    queue.getState().settleCorrection(forged, {
      receipt: {
        outcome: "already_applied",
        originalClientCommandId: "command-original",
        result: { orderId: "x" },
      },
    }),
  ).toBe(false)
  expect(original()?.localStatus).toBe("blocked")
  const ticket = queue.getState().issueCorrection(attempt.key)
  if (!ticket) throw Error("expected ticket")
  expect(
    queue.getState().settleCorrection(ticket, { failure: "unknown" }),
  ).toBe(true)
  // The same ticket can't settle twice.
  expect(
    queue.getState().settleCorrection(ticket, {
      receipt: replacedReceipt(ticket.request as never),
    }),
  ).toBe(false)
  expect(queue.getState().commands).toHaveLength(1)
})

test("a late receipt after the session changed stays unapplied; another user can't issue it", async () => {
  const attempt = await queue
    .getState()
    .prepareCorrection("command-original", descriptions)
  if (!attempt) throw Error("expected attempt")
  const ticket = queue.getState().issueCorrection(attempt.key)
  if (!ticket) throw Error("expected ticket")
  signIn(
    { ...profileA, id: "actor-b", email: "b@example.test" },
    "session-token-b",
  )
  expect(queue.getState().issueCorrection(attempt.key)).toBeNull()
  expect(
    queue.getState().settleCorrection(ticket, {
      receipt: replacedReceipt(ticket.request as never),
    }),
  ).toBe(false)
  expect(queue.getState().commands).toHaveLength(1)
  expect(original()?.localStatus).toBe("blocked")
  // Same user signing in again is a new session: the old ticket stays dead.
  signIn()
  expect(
    queue.getState().settleCorrection(ticket, {
      receipt: replacedReceipt(ticket.request as never),
    }),
  ).toBe(false)
})

test("an existing local entry with the replacement identity blocks installation", async () => {
  const attempt = await queue
    .getState()
    .prepareCorrection("command-original", descriptions)
  if (!attempt) throw Error("expected attempt")
  queue.setState((state) => ({
    commands: [
      ...state.commands,
      {
        ...state.commands[0],
        clientCommandId: attempt.replacementClientCommandId,
        localStatus: "pending",
      } as never,
    ],
  }))
  const ticket = queue.getState().issueCorrection(attempt.key)
  if (!ticket) throw Error("expected ticket")
  expect(
    queue.getState().settleCorrection(ticket, {
      receipt: replacedReceipt(ticket.request as never),
    }),
  ).toBe(false)
  expect(original()?.localStatus).toBe("blocked")
  expect(attemptNow()?.state).toBe("unknown")
})

test("retained actions retire on session or offline A→B→A and on unmount", async () => {
  transport = async (input) => replacedReceipt(input)
  const ui = await mount()
  const { start } = ui.hook
  // Session written twice to identical values: the generation moved on.
  signIn({ ...profileA, role: "MANAGER" })
  signIn()
  expect(await ui.run(() => start("command-original", descriptions))).toBe(
    "inert",
  )
  await ui.render()
  const fresh = ui.hook.start
  useOperationalModeStore.setState({ isOfflineMode: true })
  useOperationalModeStore.setState({ isOfflineMode: false })
  expect(await ui.run(() => fresh("command-original", descriptions))).toBe(
    "inert",
  )
  await ui.render()
  const last = ui.hook.start
  await ui.close()
  expect(await last("command-original", descriptions)).toBe("inert")
  expect(requests).toHaveLength(0)
  expect(attemptNow()).toBeUndefined()
})

test("offline: nothing is sent", async () => {
  useOperationalModeStore.setState({ isOfflineMode: true })
  const ui = await mount()
  try {
    expect(ui.hook.canSend).toBe(false)
    expect(
      await ui.run(() => ui.hook.start("command-original", descriptions)),
    ).toBe("inert")
    expect(requests).toHaveLength(0)
  } finally {
    await ui.close()
  }
})

test("a held or depended-on original goes to the owner; required and overlong descriptions never propose", async () => {
  seed([], { recoveryHeld: true })
  expect(
    await queue.getState().prepareCorrection("command-original", descriptions),
  ).toBeNull()
  seed([
    {
      clientCommandId: "command-child",
      eventVersion: 1,
      payload: { lines: [] },
      dependencyClientIds: ["command-original"],
      createdAtClient: new Date(),
      ...scopeA,
      deviceId: "device-a",
      localStatus: "pending",
    },
  ])
  expect(
    await queue.getState().prepareCorrection("command-original", descriptions),
  ).toBeNull()
  seed()
  expect(
    await queue.getState().prepareCorrection("command-original", {}),
  ).toBeNull()
  expect(
    await queue.getState().prepareCorrection("command-original", { 0: "   " }),
  ).toBeNull()
  expect(
    await queue
      .getState()
      .prepareCorrection("command-original", { 0: "x".repeat(201) }),
  ).toBeNull()
  expect(
    await queue
      .getState()
      .prepareCorrection("command-original", { 0: "Rice", 1: "Delivery" }),
  ).toBeNull()
  expect(queue.getState().corrections).toEqual({})
})

test("another user's or another device's record is never offered", async () => {
  seed([], { actorUserId: "actor-b" })
  expect(
    await queue.getState().prepareCorrection("command-original", descriptions),
  ).toBeNull()
  seed([], { deviceId: "device-other" })
  expect(
    await queue.getState().prepareCorrection("command-original", descriptions),
  ).toBeNull()
  // Two local entries sharing the original's identity are ambiguous.
  seed([
    {
      ...structuredClone(originalPayload),
      clientCommandId: "command-original",
      eventVersion: 1,
      payload: structuredClone(originalPayload),
      dependencyClientIds: [],
      createdAtClient: new Date(createdAt),
      ...scopeA,
      deviceId: "device-a",
      localStatus: "blocked",
    },
  ])
  expect(
    await queue.getState().prepareCorrection("command-original", descriptions),
  ).toBeNull()
})

test("a storage write that doesn't stick stops the send; nothing claims to be durable", async () => {
  failWrites = true
  transport = async (input) => replacedReceipt(input)
  const ui = await mount()
  try {
    expect(
      await ui.run(() => ui.hook.start("command-original", descriptions)),
    ).toBe("not_saved")
    expect(requests).toHaveLength(0)
  } finally {
    await ui.close()
  }
})

test("double taps send once", async () => {
  let release: (value: unknown) => void = () => {}
  transport = (input) =>
    new Promise((resolve) => {
      release = () => resolve(replacedReceipt(input))
    })
  const ui = await mount()
  try {
    let first: Promise<unknown> | undefined
    let second: Promise<unknown> | undefined
    await act(async () => {
      first = ui.hook.start("command-original", descriptions)
      await Promise.resolve()
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      second = ui.hook.checkAgain(attemptNow()?.key ?? "")
    })
    expect(await second).toBe("inert")
    await act(async () => {
      release(undefined)
      await first
    })
    expect(requests).toHaveLength(1)
    expect(attemptNow()?.state).toBe("replaced")
  } finally {
    await ui.close()
  }
})

test("ordinary retry, discard, replay and stale replay results never revive a corrected or in-progress original", async () => {
  transport = async () => {
    throw Error("socket closed")
  }
  const ui = await mount()
  try {
    await ui.run(() => ui.hook.start("command-original", descriptions))
    expect(attemptNow()?.state).toBe("unknown")
    queue.getState().retryCommand("command-original")
    queue.getState().discardCommand("command-original")
    expect(original()?.localStatus).toBe("blocked")
    expect(queue.getState().prepareReplay()?.commands ?? []).toHaveLength(0)
    transport = async (input) => replacedReceipt(input)
    await ui.run(() => ui.hook.checkAgain(attemptNow()?.key ?? ""))
    expect(original()?.correctedBy).toBeTruthy()
    // A delayed ordinary replay answer for the old identity changes nothing.
    const batch = {
      scope: scopeA,
      deviceId: "device-a",
      commands: [
        {
          clientCommandId: "command-original",
          eventVersion: 1,
          payload: structuredClone(originalPayload),
          dependencyClientIds: [],
          createdAtClient: new Date(createdAt),
        },
      ],
    }
    queue.getState().applyScopedReplayResults(
      [
        {
          clientCommandId: "command-original",
          status: "APPLIED",
          payload: {
            ...structuredClone(originalPayload),
            actorUserId: "actor-a",
          },
          result: { orderId: "order-late" },
          authoritativeState: null,
          conflictCode: null,
          conflictMessage: null,
        } as never,
      ],
      batch as never,
    )
    queue.getState().retryCommand("command-original")
    expect(original()).toMatchObject({
      localStatus: "discarded",
      result: undefined,
    })
    // Unrelated commands keep the old behaviour.
    expect(
      queue
        .getState()
        .prepareReplay()
        ?.commands.map((c) => c.clientCommandId),
    ).toEqual([requests[0]?.replacementClientCommandId as string])
  } finally {
    await ui.close()
  }
})

test("a malformed saved attempt restores as unsendable and blocks a fresh proposal", async () => {
  persisted.set(
    STORAGE_KEY,
    JSON.stringify({
      state: {
        commands: queue.getState().commands,
        corrections: {
          [JSON.stringify([
            "actor-a",
            "business-a",
            "store-a",
            "device-a",
            "command-original",
          ])]: {
            state: "sent",
            replacementClientCommandId: "x",
          },
        },
        deviceId: "device-a",
        deviceIdsByScope: { [offlineCommandScopeKey(scopeA)]: "device-a" },
      },
      version: 3,
    }),
  )
  await queue.persist.rehydrate()
  queue.setState({ hasHydrated: true })
  expect(attemptNow()?.state).toBe("invalid")
  const again = await queue
    .getState()
    .prepareCorrection("command-original", descriptions)
  expect(again?.state).toBe("invalid")
  expect(queue.getState().issueCorrection(again?.key ?? "")).toBeNull()
})

test("a failed save then Check again never sends; recovered storage sends the same fix once", async () => {
  failWrites = true
  transport = async (input) => replacedReceipt(input)
  const ui = await mount()
  try {
    expect(
      await ui.run(() => ui.hook.start("command-original", descriptions)),
    ).toBe("not_saved")
    const key = attemptNow()?.key ?? ""
    const ids = {
      command: attemptNow()?.replacementClientCommandId,
      payment: attemptNow()?.replacementClientPaymentId,
    }
    expect(await ui.run(() => ui.hook.checkAgain(key))).toBe("not_saved")
    expect(queue.getState().issueCorrection(key)).toBeNull()
    expect(requests).toHaveLength(0)
    // Storage recovers: the same saved identities go out, exactly once even
    // with two presses racing across the storage await.
    failWrites = false
    let first: Promise<unknown> | undefined
    let second: Promise<unknown> | undefined
    await act(async () => {
      first = ui.hook.checkAgain(key)
      second = ui.hook.checkAgain(key)
      await first
      await second
    })
    expect(await second).toBe("inert")
    expect(requests).toHaveLength(1)
    expect(requests[0]?.replacementClientCommandId).toBe(ids.command as string)
    expect(requests[0]?.replacementClientPaymentId).toBe(ids.payment as string)
    expect(attemptNow()?.state).toBe("replaced")
  } finally {
    await ui.close()
  }
})

test("a retained re-send can't revive after a session A→B→A while storage was failing", async () => {
  failWrites = true
  transport = async (input) => replacedReceipt(input)
  const ui = await mount()
  try {
    await ui.run(() => ui.hook.start("command-original", descriptions))
    const retained = ui.hook.checkAgain
    signIn({ ...profileA, role: "MANAGER" })
    signIn()
    failWrites = false
    expect(await ui.run(() => retained(attemptNow()?.key ?? ""))).toBe("inert")
    expect(requests).toHaveLength(0)
  } finally {
    await ui.close()
  }
})

test("a partial or corrupt read-back refuses transport", async () => {
  tamperReads = true
  transport = async (input) => replacedReceipt(input)
  const ui = await mount()
  try {
    expect(
      await ui.run(() => ui.hook.start("command-original", descriptions)),
    ).toBe("not_saved")
    expect(requests).toHaveLength(0)
  } finally {
    await ui.close()
  }
})

test("uncertainty is monotonic: unknown then a refusal stays unknown, until the same fix reconciles", async () => {
  transport = async () => {
    throw Error("socket closed")
  }
  const ui = await mount()
  try {
    await ui.run(() => ui.hook.start("command-original", descriptions))
    expect(attemptNow()?.state).toBe("unknown")
    transport = async () => {
      throw Object.assign(Error("access changed"), {
        data: { code: "FORBIDDEN", httpStatus: 403 },
      })
    }
    await ui.run(() => ui.hook.checkAgain(attemptNow()?.key ?? ""))
    expect(attemptNow()?.state).toBe("unknown")
    expect(requests[1]).toEqual(requests[0] as Record<string, unknown>)
    // After a restart it's still the same uncertain fix; a denial keeps it so.
    await new Promise((resolve) => setTimeout(resolve, 5))
    const saved = persisted.get(STORAGE_KEY)
    queue.setState({ corrections: {}, commands: [] })
    await new Promise((resolve) => setTimeout(resolve, 5))
    if (saved) persisted.set(STORAGE_KEY, saved)
    await queue.persist.rehydrate()
    queue.setState({ hasHydrated: true })
    await ui.run(() => ui.hook.checkAgain(attemptNow()?.key ?? ""))
    expect(attemptNow()?.state).toBe("unknown")
    transport = async (input) => replacedReceipt(input)
    await ui.run(() => ui.hook.checkAgain(attemptNow()?.key ?? ""))
    expect(requests).toHaveLength(4)
    for (const request of requests)
      expect(request).toEqual(requests[0] as Record<string, unknown>)
    expect(attemptNow()?.state).toBe("replaced")
  } finally {
    await ui.close()
  }
})

/** The actual composition: Sync status keeps the hook; the sheet comes and goes. */
async function mountSheet() {
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
    document,
    window,
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
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  let shown: string | null = "command-original"
  function Parent() {
    const correction = useQuickSaleCorrection()
    const command = queue
      .getState()
      .commands.find((c) => c.clientCommandId === shown)
    if (!command) return null
    const attempt = queue.getState().correctionFor(command)
    const view = correctionView({
      availability: correctionAvailability(command, queue.getState().commands),
      attempt,
      sending: correction.isSending(attempt?.key),
      canSend: correction.canSend,
    })
    return createElement(QuickSaleCorrectionSheet, {
      key: command.clientCommandId,
      open: true,
      onClose() {},
      command,
      attempt,
      view,
      correction,
    })
  }
  const render = async () => {
    await act(async () =>
      root.render(
        createElement(QueryClientProvider, { client }, createElement(Parent)),
      ),
    )
  }
  await render()
  return {
    show: async (id: string | null) => {
      shown = id
      await render()
    },
    type: async (text: string) => {
      await act(async () => fields.at(-1)?.onChangeText?.(text))
    },
    close: async () => act(async () => root.unmount()),
  }
}

test("the actual sheet sends while shown; a retained Send after it closes does nothing", async () => {
  transport = async (input) => replacedReceipt(input)
  const sheet = await mountSheet()
  try {
    await sheet.type("Rice")
    const retained = buttons.get("Send fix")?.onPress
    if (!retained) throw Error("expected Send")
    // Close just the sheet; the Sync status parent and its hook stay mounted.
    await sheet.show(null)
    await act(async () => {
      await retained()
    })
    expect(requests).toHaveLength(0)
    // Shown again (a fresh sheet), a live press sends.
    await sheet.show("command-original")
    await sheet.type("Rice")
    await act(async () => {
      await buttons.get("Send fix")?.onPress?.()
    })
    expect(requests).toHaveLength(1)
  } finally {
    await sheet.close()
  }
})

test("a sheet closed while its fix is still being saved never sends", async () => {
  transport = async (input) => replacedReceipt(input)
  let open: () => void = () => {}
  writeGate = new Promise((resolve) => {
    open = resolve
  })
  const sheet = await mountSheet()
  try {
    await sheet.type("Rice")
    let pending: Promise<unknown> | undefined
    await act(async () => {
      pending = buttons.get("Send fix")?.onPress?.() as Promise<unknown>
      await Promise.resolve()
    })
    await sheet.show(null)
    await act(async () => {
      open()
      writeGate = null
      await pending
    })
    expect(requests).toHaveLength(0)
    expect(attemptNow()?.state).toBe("ready")
  } finally {
    await sheet.close()
  }
})

test("a press retained across a sale A→B→A switch does nothing", async () => {
  seed([
    {
      clientCommandId: "command-other",
      eventVersion: 1,
      payload: structuredClone(originalPayload),
      dependencyClientIds: [],
      createdAtClient: new Date(createdAt),
      ...scopeA,
      deviceId: "device-a",
      displayTotal: { amountMinor: 1_350_000, currencyCode: "NGN" },
      localStatus: "blocked",
    },
  ])
  transport = async (input) => replacedReceipt(input)
  const sheet = await mountSheet()
  try {
    await sheet.type("Rice")
    const retained = buttons.get("Send fix")?.onPress
    await sheet.show("command-other")
    await sheet.show("command-original")
    await act(async () => {
      await retained?.()
    })
    expect(requests).toHaveLength(0)
  } finally {
    await sheet.close()
  }
})
