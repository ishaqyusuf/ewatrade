import { afterAll, beforeEach, expect, mock, test } from "bun:test"
import { DOMParser } from "@xmldom/xmldom"
import { act, createElement, useSyncExternalStore } from "react"

// Real provider, React effects and QueryObservers; native/state/API ports are
// injected. Run in a child process so the module stand-ins cannot leak to tests.
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
const intervals = new Map<number, { run: () => void; milliseconds: number }>()
let timerId = 0
const originalInterval = globalThis.setInterval
const originalClearInterval = globalThis.clearInterval
Object.assign(globalThis, {
  document,
  window,
  IS_REACT_ACT_ENVIRONMENT: true,
  setInterval(run: () => void, milliseconds: number) {
    const id = ++timerId
    intervals.set(id, { run, milliseconds })
    return id
  },
  clearInterval(id: number) {
    intervals.delete(id)
  },
  fetch: async () => {
    throw new Error("Unexpected network request in offline fixture")
  },
})
const { QueryClient, QueryClientProvider } = await import(
  "@tanstack/react-query"
)
const { createRoot } = await import("react-dom/client")
const source = new URL("../../", import.meta.url)
const standIn = (path: string, exports: Record<string, unknown>) =>
  mock.module(new URL(path, source).pathname, () => exports)
const appListeners = new Set<(state: string) => void>()
const modeListeners = new Set<() => void>()
const appState = {
  currentState: "active",
  addEventListener(_event: string, listener: (state: string) => void) {
    appListeners.add(listener)
    return { remove: () => appListeners.delete(listener) }
  },
}
let offline = false
let variant = "preview"
let authorization: {
  token: string
  expiresAt: string
  qaDomain: string
  testerIdentity: string
} | null = null
const useOperationalModeStore = Object.assign(
  (select: (state: { isOfflineMode: boolean }) => boolean) =>
    useSyncExternalStore(
      (listener) => {
        modeListeners.add(listener)
        return () => modeListeners.delete(listener)
      },
      () => select({ isOfflineMode: offline }),
    ),
  { getState: () => ({ isOfflineMode: offline }) },
)
const reads: Record<string, number> = {}
const query = (name: string) => ({
  queryOptions(_input: unknown, options: Record<string, unknown>) {
    return {
      queryKey: ["qa", name],
      queryFn: async () => {
        reads[name] = (reads[name] ?? 0) + 1
        if (name === "capability")
          return { available: true, environment: "preview" }
        if (name === "profiles") return []
        return { valid: true }
      },
      ...options,
    }
  },
})
const mutation = { mutationOptions: () => ({ mutationFn: async () => ({}) }) }
const trpc = {
  qaAccess: {
    capability: query("capability"),
    revalidate: query("revalidate"),
    profiles: query("profiles"),
    fixtureContext: query("fixtureContext"),
    exchange: mutation,
    selectProfile: mutation,
    revoke: mutation,
  },
}
standIn("trpc/client.tsx", { useTRPC: () => trpc, clearMobileDataCache() {} })
standIn("hooks/use-auth.tsx", {
  useAuthContext: () => ({
    isAuthenticated: true,
    onLogout() {},
    applyAuthenticatedSession() {},
  }),
})
standIn("hooks/use-authenticated-qa-tools.ts", {
  useAuthenticatedQaTools: () => ({
    fixtureContext: null,
    refreshFixtureContext: async () => null,
  }),
})
standIn("store/operationalModeStore.ts", { useOperationalModeStore })
standIn("lib/app-variant.ts", { getAppVariant: () => variant })
standIn("lib/qa-authorization-store.ts", {
  getStoredQaAuthorization: () => authorization,
  getStoredQaClientId: () => "fixture-client",
  getStoredQaDomain: () => null,
  clearStoredQaAuthorization() {},
  clearStoredQaClientId() {},
  clearStoredQaDomain() {},
  setStoredQaAuthorization() {},
  setStoredQaClientId() {},
  setStoredQaDomain() {},
})
mock.module("react-native", () => ({ AppState: appState }))
mock.module("expo-crypto", () => ({ randomUUID: () => "fixture-nonce" }))
const { QaAcceleratorProvider, useQaAccelerator } = await import(
  "../../hooks/use-qa-accelerator"
)
type Context = ReturnType<typeof useQaAccelerator>
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
async function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 60_000 } },
  })
  const host = document.createElement("div")
  document.documentElement?.appendChild(host)
  const root = createRoot(host as unknown as HTMLElement)
  let latest: Context | undefined
  function Probe() {
    latest = useQaAccelerator()
    return null
  }
  await act(async () =>
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(QaAcceleratorProvider, null, createElement(Probe)),
      ),
    ),
  )
  await settle()
  await settle()
  return {
    get value() {
      if (!latest) throw new Error("Provider did not mount")
      return latest
    },
    async close() {
      await act(async () => root.unmount())
      client.clear()
      host.parentNode?.removeChild(host)
    },
  }
}
beforeEach(() => {
  for (const key of Object.keys(reads)) delete reads[key]
  appState.currentState = "active"
  offline = false
  variant = "preview"
  authorization = {
    token: "fixture-token",
    expiresAt: "2099-01-01T00:00:00Z",
    qaDomain: "fixture.test",
    testerIdentity: "fixture",
  }
})
afterAll(() => {
  Object.assign(globalThis, {
    setInterval: originalInterval,
    clearInterval: originalClearInterval,
  })
  mock.restore()
})
test("one-minute revalidation stops in background, retained refetches cannot bypass it, and resume revalidates once", async () => {
  const ui = await mount()
  try {
    expect(reads.revalidate).toBe(1)
    const poll = [...intervals.values()].filter(
      ({ milliseconds }) => milliseconds === 60_000,
    )
    expect(poll).toHaveLength(1)
    await act(async () => {
      for (const { run } of poll) run()
    })
    await settle()
    expect(reads.revalidate).toBe(2)
    const retained = ui.value
    await act(async () => {
      appState.currentState = "background"
      for (const listener of appListeners) listener("background")
    })
    const before = { ...reads }
    expect(
      [...intervals.values()].filter(
        ({ milliseconds }) => milliseconds === 60_000,
      ),
    ).toHaveLength(0)
    await act(async () => {
      await retained.retryCapability()
      await retained.refreshProfiles()
      expect(await retained.refreshFixtureContext()).toBeNull()
    })
    expect(reads).toEqual(before)
    await act(async () => {
      appState.currentState = "active"
      for (const listener of appListeners) listener("active")
    })
    await settle()
    expect(reads.revalidate).toBe((before.revalidate ?? 0) + 1)
    expect(reads.fixtureContext).toBe((before.fixtureContext ?? 0) + 1)
  } finally {
    await ui.close()
  }
})
test("offline mode stops polling and retained refreshes; reconnect revalidates", async () => {
  const ui = await mount()
  try {
    const retained = ui.value
    await act(async () => {
      offline = true
      for (const listener of modeListeners) listener()
    })
    const before = { ...reads }
    await act(async () => {
      await retained.retryCapability()
      await retained.refreshProfiles()
      await retained.refreshFixtureContext()
    })
    expect(reads).toEqual(before)
    expect(
      [...intervals.values()].filter(
        ({ milliseconds }) => milliseconds === 60_000,
      ),
    ).toHaveLength(0)
    await act(async () => {
      offline = false
      for (const listener of modeListeners) listener()
    })
    await settle()
    expect(reads.revalidate).toBe((before.revalidate ?? 0) + 1)
  } finally {
    await ui.close()
  }
})
test("missing QA authorization has no polling; Production has no QA discovery", async () => {
  authorization = null
  const guest = await mount()
  try {
    expect(reads).toEqual({ capability: 1 })
    expect(intervals.size).toBe(0)
  } finally {
    await guest.close()
  }
  for (const key of Object.keys(reads)) delete reads[key]
  variant = "production"
  const production = await mount()
  try {
    expect(reads).toEqual({})
    expect(intervals.size).toBe(0)
  } finally {
    await production.close()
  }
})
