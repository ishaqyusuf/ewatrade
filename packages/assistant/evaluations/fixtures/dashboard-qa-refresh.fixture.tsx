import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { QaProfile } from "@ewatrade/utils/qa-profiles"
import { DOMImplementation } from "@xmldom/xmldom"
import { type ReactNode, act } from "react"

const document = new DOMImplementation().createDocument(
  "http://www.w3.org/1999/xhtml",
  "html",
  null,
)
const create = document.createElement.bind(document)
document.createElement = (name: string) =>
  Object.assign(create(name), {
    style: {},
    addEventListener() {},
    removeEventListener() {},
  })
const listeners = new Map<string, Set<() => void>>()
const addEventListener = (name: string, callback: () => void) => {
  const values = listeners.get(name) ?? new Set()
  values.add(callback)
  listeners.set(name, values)
}
const removeEventListener = (name: string, callback: () => void) =>
  listeners.get(name)?.delete(callback)
let interval: (() => void) | undefined
let expiry: (() => void) | undefined
let expiryDelay = 0
const window = {
  document,
  HTMLElement: class {},
  HTMLIFrameElement: class {},
  addEventListener,
  removeEventListener,
  setInterval(callback: () => void, delay: number) {
    expect(delay).toBe(60_000)
    interval = callback
    return 1
  },
  clearInterval() {
    interval = undefined
  },
  setTimeout(callback: () => void, delay: number) {
    expiry = callback
    expiryDelay = delay
    return 2
  },
  clearTimeout() {
    expiry = undefined
  },
}
Object.assign(document, {
  defaultView: window,
  visibilityState: "visible",
  addEventListener,
  removeEventListener,
})
Object.assign(globalThis, { window, document, IS_REACT_ACT_ENVIRONMENT: true })
let isOnline = true
const originalOnline = Object.getOwnPropertyDescriptor(navigator, "onLine")
Object.defineProperty(navigator, "onLine", {
  configurable: true,
  get: () => isOnline,
})
const { createRoot } = await import("react-dom/client")
const app = (path: string) =>
  new URL(`../../../../apps/dashboard/src/${path}`, import.meta.url).pathname
type Entry = {
  emailField: ReactNode
  canSignIn: boolean
  signIn(): Promise<void>
}
let entry: Entry | undefined
let choose: ((profile: QaProfile) => void) | undefined
let manualRefresh: (() => void) | undefined
let renders = 0
mock.module(app("components/auth/login-form"), () => ({
  LoginForm: ({ accountEntry }: { accountEntry?: Entry }) => {
    renders++
    entry = accountEntry
    return <div>{accountEntry?.emailField}</div>
  },
}))
mock.module(app("components/qa/qa-profile-select"), () => ({
  QaProfileSelect: ({
    onSelect,
    onRefresh,
  }: { onSelect: typeof choose; onRefresh: typeof manualRefresh }) => {
    choose = onSelect
    manualRefresh = onRefresh
    return <div>Inert profile picker</div>
  },
}))
const leaf = ({ children }: { children?: ReactNode }) => <div>{children}</div>
mock.module("@ewatrade/ui", () => ({
  Badge: leaf,
  Button: leaf,
  Dialog: leaf,
  DialogContent: leaf,
  DialogDescription: leaf,
  DialogHeader: leaf,
  DialogTitle: leaf,
  DialogTrigger: leaf,
  Field: leaf,
  FieldLabel: leaf,
  Input: leaf,
}))
const profile: QaProfile = {
  business: { id: "business", name: "Inert business" },
  identity: { id: "actor", email: "inert@example.test", name: "Inert actor" },
  membership: { role: "OWNER" },
  store: { id: "store", name: "Inert Store" },
  profileReference: "inert-reference",
}
const access = () => ({
  qaDomain: "inert.example.test",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  profiles: [profile],
})
const requests: {
  signal: AbortSignal | null | undefined
  deliver(body?: unknown, ok?: boolean): void
}[] = []
const selections: { deliver(): void }[] = []
const network = spyOn(globalThis, "fetch").mockImplementation(
  Object.assign(
    async (url: string | URL | Request, init?: RequestInit) => {
      if (
        url === "/api/qa-access" &&
        init?.method === "POST" &&
        typeof init.body === "string" &&
        JSON.parse(init.body).action === "select"
      ) {
        expect(JSON.parse(init.body)).toEqual({
          action: "select",
          profileReference: "inert-reference",
        })
        return new Promise<Response>((resolve) => {
          selections.push({
            deliver: () =>
              resolve(
                new Response(JSON.stringify({ message: "Inert refusal" }), {
                  status: 403,
                }),
              ),
          })
        })
      }
      if (url !== "/api/qa-access" || (init?.method ?? "GET") !== "GET")
        throw Error("No external network or mutations allowed in inert fixture")
      return new Promise<Response>((resolve) => {
        requests.push({
          signal: init?.signal,
          deliver(body = { available: true, access: access() }, ok = true) {
            resolve(
              new Response(JSON.stringify(body), { status: ok ? 200 : 403 }),
            )
          },
        })
      })
    },
    {
      preconnect: () => {
        throw Error("No external network")
      },
    },
  ),
)
const { QaLoginEntry } = await import(
  "../../../../apps/dashboard/src/components/qa/qa-login-entry"
)
const delay = () => new Promise((resolve) => setTimeout(resolve, 2))
async function flush(action?: () => unknown) {
  await act(async () => {
    action?.()
    await delay()
  })
}
async function emit(name: string) {
  await flush(() => {
    for (const callback of [...(listeners.get(name) ?? [])]) callback()
  })
}
function visibility(value: "visible" | "hidden") {
  Object.assign(document, { visibilityState: value })
}
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.()
  expect(
    ["focus", "visibilitychange", "online", "offline"].every(
      (name) => !listeners.get(name)?.size,
    ),
  ).toBe(true)
  expect(interval).toBeUndefined()
  expect(expiry).toBeUndefined()
})
async function mounted(options: { hidden?: boolean; offline?: boolean } = {}) {
  listeners.clear()
  interval = undefined
  expiry = undefined
  entry = undefined
  choose = undefined
  manualRefresh = undefined
  renders = 0
  requests.length = 0
  selections.length = 0
  isOnline = !options.offline
  visibility(options.hidden ? "hidden" : "visible")
  const host = document.createElement("div")
  document.documentElement.appendChild(host)
  const root = createRoot(host as unknown as HTMLElement)
  const unmount = async () => {
    await act(async () => root.unmount())
    document.documentElement.removeChild(host)
  }
  cleanups.push(unmount)
  await flush(() => {
    root.render(<QaLoginEntry marketingUrl="https://inert.example.test" />)
  })
  return {
    html: () => host.toString(),
    unmount: async () => {
      cleanups.pop()
      await unmount()
    },
  }
}
test("visible mount, focus, interval and manual refresh share one pending GET", async () => {
  await mounted()
  expect(requests.length).toBe(1)
  await emit("focus")
  await flush(() => interval?.())
  expect(requests.length).toBe(1)
  await flush(() => requests[0]?.deliver())
  await emit("focus")
  await flush(() => manualRefresh?.())
  expect(requests.length).toBe(2)
  await flush(() => requests[1]?.deliver())
  expect(entry).toBeDefined()
})
for (const options of [{ hidden: true }, { offline: true }])
  test(`inactive mount does not fetch: ${JSON.stringify(options)}`, async () => {
    await mounted(options)
    await emit("focus")
    await flush(() => interval?.())
    expect(requests.length).toBe(0)
    visibility("visible")
    isOnline = true
    await emit(options.hidden ? "visibilitychange" : "online")
    expect(requests.length).toBe(1)
    await flush(() => requests[0]?.deliver())
    expect(entry).toBeDefined()
  })
test("hidden and offline reads pause; visibility and reconnect resume once", async () => {
  await mounted()
  await flush(() => requests[0]?.deliver())
  visibility("hidden")
  await emit("visibilitychange")
  await flush(() => interval?.())
  await emit("focus")
  expect(requests.length).toBe(1)
  visibility("visible")
  await emit("visibilitychange")
  await emit("focus")
  expect(requests.length).toBe(2)
  await flush(() => requests[1]?.deliver())
  isOnline = false
  await emit("offline")
  await flush(() => interval?.())
  expect(requests.length).toBe(2)
  isOnline = true
  await emit("online")
  await emit("focus")
  expect(requests.length).toBe(3)
  await flush(() => requests[2]?.deliver())
})
test("hidden pending read aborts and late delivery cannot restore profiles", async () => {
  const view = await mounted()
  visibility("hidden")
  await emit("visibilitychange")
  expect(requests[0]?.signal?.aborted).toBe(true)
  expect(entry).toBeUndefined()
  expect(view.html()).not.toContain("Reconnect, then retry")
  visibility("visible")
  await emit("visibilitychange")
  expect(requests.length).toBe(2)
  await flush(() => requests[0]?.deliver())
  expect(entry).toBeUndefined()
  await emit("focus")
  expect(requests.length).toBe(2)
  await flush(() => requests[1]?.deliver())
  expect(entry).toBeDefined()
})
test("unmount aborts pending GET and removes every event/timer owner", async () => {
  const view = await mounted()
  await view.unmount()
  expect(requests[0]?.signal?.aborted).toBe(true)
  const previous = renders
  await flush(() => requests[0]?.deliver())
  expect(renders).toBe(previous)
})
test("access expiry still clears the selected profile while hidden", async () => {
  await mounted()
  await flush(() => requests[0]?.deliver())
  await flush(() => choose?.(profile))
  expect(entry?.canSignIn).toBe(true)
  expect(expiryDelay).toBeGreaterThan(0)
  expect(expiryDelay).toBeLessThanOrEqual(60_000)
  visibility("hidden")
  await emit("visibilitychange")
  await flush(() => expiry?.())
  expect(entry).toBeUndefined()
  expect(requests.length).toBe(1)
})
test("fresh refusal clears selection and later current read can recover", async () => {
  await mounted()
  await flush(() => requests[0]?.deliver())
  await flush(() => choose?.(profile))
  expect(entry?.canSignIn).toBe(true)
  await emit("focus")
  await flush(() => requests[1]?.deliver({ available: false }, false))
  expect(entry).toBeUndefined()
  await emit("focus")
  await flush(() => requests[2]?.deliver())
  expect(entry).toBeDefined()
  expect(entry?.canSignIn).toBe(false)
})
test("explicit selection cancels only the obsolete GET and blocks automatic reads until settled", async () => {
  await mounted()
  await flush(() => requests[0]?.deliver())
  await flush(() => choose?.(profile))
  expect(entry?.canSignIn).toBe(true)
  await emit("focus")
  let selection: Promise<void> | undefined
  await flush(() => {
    selection = entry?.signIn().catch(() => {})
  })
  expect(selections.length).toBe(1)
  expect(requests[1]?.signal?.aborted).toBe(true)
  await emit("focus")
  await flush(() => interval?.())
  expect(requests.length).toBe(2)
  await flush(() => requests[1]?.deliver())
  expect(entry?.canSignIn).toBe(false)
  await flush(() => selections[0]?.deliver())
  await selection
  expect(entry).toBeUndefined()
  await emit("focus")
  expect(requests.length).toBe(3)
  await flush(() => requests[2]?.deliver())
  expect(entry?.canSignIn).toBe(false)
})
process.on("exit", () => {
  network.mockRestore()
  if (originalOnline) Object.defineProperty(navigator, "onLine", originalOnline)
  else Reflect.deleteProperty(navigator, "onLine")
})
