import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
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
const window = {
  document,
  HTMLElement: class {},
  HTMLIFrameElement: class {},
  addEventListener() {},
  removeEventListener() {},
}
Object.assign(document, {
  defaultView: window,
  addEventListener() {},
  removeEventListener() {},
})
Object.assign(globalThis, { window, document, IS_REACT_ACT_ENVIRONMENT: true })
const { QueryClientProvider, focusManager } = await import(
  "@tanstack/react-query"
)
const { createRoot } = await import("react-dom/client")
const { createTRPCClient, TRPCClientError } = await import("@trpc/client")
const { createTRPCOptionsProxy } = await import("@trpc/tanstack-react-query")
const { observable } = await import("@trpc/server/observable")
const realInterval = globalThis.setInterval
const realClear = globalThis.clearInterval
const intervals = new Map<ReturnType<typeof setInterval>, () => void>()
const cadences = new Map<ReturnType<typeof setInterval>, number>()
globalThis.setInterval = ((
  callback: TimerHandler,
  delay?: number,
  ...args: unknown[]
) => {
  if (
    ![2_000, 5_000, 15_000, 30_000].includes(delay ?? 0) ||
    typeof callback !== "function"
  )
    return realInterval(callback, delay, ...args)
  const id = realInterval(() => {}, 100_000_000)
  intervals.set(id, () => callback(...args))
  cadences.set(id, delay ?? 0)
  return id
}) as typeof setInterval
globalThis.clearInterval = ((id: ReturnType<typeof setInterval>) => {
  intervals.delete(id)
  cadences.delete(id)
  realClear(id)
}) as typeof clearInterval
const calls: string[] = []
type ReadFailure =
  | "FORBIDDEN"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "INTERNAL_SERVER_ERROR"
const failures = new Map<string, ReadFailure>()
const heldPaths = new Set<string>()
const heldReads = new Set<() => void>()
Object.assign(window, {
  setInterval: globalThis.setInterval,
  clearInterval: globalThis.clearInterval,
})
const scope = {
  actorUserId: "actor",
  tenantId: "tenant",
  storeId: "store",
  businessName: "Inert business",
  storeName: "Inert Store",
}
const context = {
  actorUserId: "actor",
  tenant: { id: "tenant" },
  activeStore: { id: "store" },
}
const grant = {
  id: "grant",
  identityId: "identity",
  generation: 1,
  identityGeneration: 1,
  selectionGeneration: 1,
  active: true,
  maskedSender: "private-sentinel",
  businessName: "Inert business",
  storeName: "Inert Store",
  expiresAt: new Date("2099-01-01"),
  idleExpiresAt: new Date("2099-01-01"),
}
let externalCalls = 0
const refuseNetwork = () => {
  externalCalls++
  throw Error("No external network in inert owner fixture")
}
const networkTrap = spyOn(globalThis, "fetch").mockImplementation(
  Object.assign(async () => refuseNetwork(), { preconnect: refuseNetwork }),
)
const domain = {
  normalizedDomain: "private-sentinel.test",
  paymentStatus: "PAID",
  registrationStatus: "PENDING",
}
const initialData: Record<string, unknown> = {
  "tenant.current": context,
  "assistantChannels.availability": { enabled: true },
  "assistantChannels.whatsAppConnections": [grant],
  "assistantChannels.whatsAppLink": {
    id: "link",
    state: "awaiting_whatsapp",
    revision: 1,
    expiresAt: new Date("2099-01-01"),
    maskedSender: null,
  },
  "domains.order": domain,
}
let data = { ...initialData }
const rpc = createTRPCClient<AppRouter>({
  links: [
    () =>
      ({ op }) =>
        observable((observer) => {
          calls.push(op.path)
          if (
            op.type === "mutation" &&
            op.path === "assistantChannels.createWhatsAppLink"
          ) {
            observer.next({
              result: {
                data: {
                  id: "link",
                  url: "https://wa.me/2348000000000?text=inert-only",
                  expiresAt: new Date("2099-01-01"),
                },
              },
            })
            observer.complete()
            return
          }
          if (op.type !== "query" || !(op.path in data)) {
            observer.error(
              new TRPCClientError("No commands allowed in inert fixture"),
            )
            return
          }
          const code = failures.get(op.path)
          if (code)
            observer.error(
              new TRPCClientError("Inert refusal", {
                result: {
                  error: {
                    code:
                      code === "UNAUTHORIZED"
                        ? -32001
                        : code === "NOT_FOUND"
                          ? -32004
                          : code === "FORBIDDEN"
                            ? -32003
                            : -32603,
                    message: "Inert refusal",
                    data: {
                      code,
                      httpStatus:
                        code === "UNAUTHORIZED"
                          ? 401
                          : code === "NOT_FOUND"
                            ? 404
                            : code === "FORBIDDEN"
                              ? 403
                              : 500,
                      stack: undefined,
                      ownerSignupBusinessId: undefined,
                      appError: {
                        code:
                          code === "UNAUTHORIZED"
                            ? "AUTHENTICATION_REQUIRED"
                            : code === "NOT_FOUND"
                              ? "NOT_FOUND"
                              : code === "FORBIDDEN"
                                ? "PERMISSION_DENIED"
                                : "UNEXPECTED",
                        message: "Inert refusal",
                        referenceId: "inert-reference",
                        requestId: undefined,
                        retryable: code === "INTERNAL_SERVER_ERROR",
                      },
                    },
                  },
                },
              }),
            )
          else {
            const deliver = () => {
              observer.next({ result: { data: data[op.path] } })
              observer.complete()
            }
            if (heldPaths.has(op.path)) {
              heldReads.add(deliver)
              return () => heldReads.delete(deliver)
            }
            deliver()
          }
        }),
  ],
})
let options: ReturnType<typeof createTRPCOptionsProxy<AppRouter>>
const app = (path: string) =>
  new URL(`../../../../apps/dashboard/src/${path}`, import.meta.url).pathname
let generation = 0
mock.module(app("trpc/client"), () => ({
  useTRPC: () => options,
  useTRPCClient: () => rpc,
  getDataCacheGeneration: () => generation,
}))
mock.module(app("observability/sentry"), () => ({ captureDashboardError() {} }))
const actions = new Map<string, () => unknown>()
const leaf = ({ children }: { children?: ReactNode }) => <div>{children}</div>
mock.module("@ewatrade/ui", () => ({
  buttonVariants: () => "",
  Button: ({
    children,
    onClick,
    disabled,
  }: { children?: ReactNode; onClick?: () => unknown; disabled?: boolean }) => {
    if (typeof children === "string" && onClick) actions.set(children, onClick)
    return (
      <button type="button" disabled={disabled}>
        {children}
      </button>
    )
  },
}))
mock.module("next/link", () => ({ default: leaf }))
mock.module("qrcode", () => ({
  default: { toDataURL: async () => "data:image/png;base64,aW5lcnQ=" },
}))
let select:
  | ((value: {
      purpose: "GENERAL"
      conversationId: string
      tenantId: string
      storeId: string
    }) => void)
  | undefined
mock.module(app("components/assistant-whatsapp/whatsapp-scope-picker"), () => ({
  WhatsAppScopePicker: ({ onSelected }: { onSelected: typeof select }) => {
    select = onSelected
    return <div>Inert scope choice</div>
  },
}))
let orderId: string | null = "order"
mock.module(app("hooks/use-domain-params"), () => ({
  useDomainParams: () => ({ domainOrderId: orderId, setParams() {} }),
}))
const { ConnectWhatsApp } = await import(
  "../../../../apps/dashboard/src/components/assistant-whatsapp/connect-whatsapp"
)
const { WhatsAppConnections } = await import(
  "../../../../apps/dashboard/src/components/assistant-whatsapp/whatsapp-connections"
)
const { DomainProgress } = await import(
  "../../../../apps/dashboard/src/components/domains/domain-progress"
)
const { makeQueryClient } = await import(
  "../../../../apps/dashboard/src/trpc/query-client"
)
const count = (path: string) => calls.filter((value) => value === path).length
const delay = () => new Promise((resolve) => setTimeout(resolve, 5))
async function flush() {
  await act(async () => {
    await delay()
  })
  await act(async () => {
    await delay()
  })
}
async function tick() {
  await act(async () => {
    for (const callback of [...intervals.values()]) callback()
    await delay()
  })
  await flush()
}
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.()
  expect(externalCalls).toBe(0)
})
async function mounted(render: () => ReactNode) {
  calls.length = 0
  failures.clear()
  heldPaths.clear()
  heldReads.clear()
  actions.clear()
  select = undefined
  generation = 0
  orderId = "order"
  data = { ...initialData }
  externalCalls = 0
  focusManager.setFocused(true)
  const client = makeQueryClient()
  // Interval recovery is tested independently of the already-covered retry policy.
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    queries: { ...client.getDefaultOptions().queries, retry: false },
  })
  options = createTRPCOptionsProxy<AppRouter>({
    client: rpc,
    queryClient: client,
  })
  const host = document.createElement("div")
  document.documentElement.appendChild(host)
  const root = createRoot(host as unknown as HTMLElement)
  cleanups.push(async () => {
    await act(async () => root.unmount())
    client.clear()
    document.documentElement.removeChild(host)
  })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>{render()}</QueryClientProvider>,
    )
    await delay()
  })
  await flush()
  return { client, html: () => host.toString() }
}
function target(path: string) {
  return (query: { queryKey: readonly unknown[] }) =>
    path === "connect-context"
      ? query.queryKey[0] === "whatsapp-connect-context"
      : path === "selected-context"
        ? query.queryKey[0] === "whatsapp-selected-chat-context"
        : Array.isArray(query.queryKey[0]) &&
          query.queryKey[0].join(".") === path
}
async function action(label: string) {
  const handler = actions.get(label)
  if (!handler) throw Error(`Missing inert action ${label}`)
  await act(async () => {
    handler()
    await delay()
  })
  await flush()
}
const owners = [
  {
    name: "connection context",
    path: "tenant.current",
    key: "connect-context",
    render: () => <ConnectWhatsApp scope={scope} />,
  },
  {
    name: "connection availability",
    path: "assistantChannels.availability",
    render: () => <ConnectWhatsApp scope={scope} />,
  },
  {
    name: "link status",
    path: "assistantChannels.whatsAppLink",
    render: () => <ConnectWhatsApp scope={scope} />,
    setup: async () => action("Connect WhatsApp"),
  },
  {
    name: "connection pages",
    path: "assistantChannels.whatsAppConnections",
    render: () => <WhatsAppConnections actorUserId="actor" />,
  },
  {
    name: "selected chat context",
    path: "tenant.current",
    key: "selected-context",
    render: () => <WhatsAppConnections actorUserId="actor" />,
    setup: async () => {
      await action("Choose WhatsApp chat")
      if (!select) throw Error("Missing selected-chat callback")
      await act(async () => {
        select?.({
          purpose: "GENERAL",
          conversationId: "chat",
          tenantId: "tenant",
          storeId: "store",
        })
        await delay()
      })
      await flush()
    },
  },
  {
    name: "domain progress",
    path: "domains.order",
    render: () => <DomainProgress />,
  },
]
for (const owner of owners) {
  for (const code of ["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"] as const)
    test(`${owner.name} stops ${code} intervals and resumes after focus recovery`, async () => {
      const { client, html } = await mounted(owner.render)
      await owner.setup?.()
      expect(count(owner.path)).toBeGreaterThan(0)
      failures.set(owner.path, code)
      await act(async () => {
        await client.invalidateQueries({
          predicate: target(owner.key ?? owner.path),
        })
        await delay()
      })
      await flush()
      for (const query of client
        .getQueryCache()
        .findAll({ predicate: target(owner.key ?? owner.path) }))
        expect(query.state.data).toBeUndefined()
      if (owner.path === "assistantChannels.whatsAppLink")
        expect(html()).not.toContain("https://wa.me/")
      const refused = count(owner.path)
      await tick()
      expect(count(owner.path)).toBe(refused)
      failures.delete(owner.path)
      if (owner.path === "assistantChannels.whatsAppLink")
        heldPaths.add(owner.path)
      await act(async () => {
        focusManager.setFocused(false)
        focusManager.setFocused(true)
        await delay()
      })
      await flush()
      expect(count(owner.path)).toBeGreaterThan(refused)
      if (owner.path === "assistantChannels.whatsAppLink") {
        expect(heldReads.size).toBe(1)
        expect(html()).not.toContain("https://wa.me/")
        await act(async () => {
          heldPaths.delete(owner.path)
          for (const deliver of [...heldReads]) deliver()
          await delay()
        })
        await flush()
        expect(html()).toContain("https://wa.me/")
      }
      const recovered = count(owner.path)
      await tick()
      expect(count(owner.path)).toBeGreaterThan(recovered)
    })
  test(`${owner.name} retains transient interval recovery`, async () => {
    const { client } = await mounted(owner.render)
    await owner.setup?.()
    failures.set(owner.path, "INTERNAL_SERVER_ERROR")
    await act(async () => {
      await client.invalidateQueries({
        predicate: target(owner.key ?? owner.path),
      })
      await delay()
    })
    await flush()
    const failed = count(owner.path)
    await tick()
    expect(count(owner.path)).toBeGreaterThan(failed)
    failures.delete(owner.path)
    await tick()
    for (const query of client
      .getQueryCache()
      .findAll({ predicate: target(owner.key ?? owner.path) }))
      expect(query.state.status).toBe("success")
  })
}
for (const state of ["confirmed", "cancelled", "expired"]) {
  test(`link ${state} stops its interval and removes the one-time URL`, async () => {
    const { client, html } = await mounted(() => (
      <ConnectWhatsApp scope={scope} />
    ))
    await action("Connect WhatsApp")
    expect([...cadences.values()]).toContain(2_000)
    data["assistantChannels.whatsAppLink"] = {
      id: "link",
      state,
      revision: 2,
      expiresAt: new Date("2099-01-01"),
      maskedSender: null,
    }
    await act(async () => {
      await client.invalidateQueries({
        predicate: target("assistantChannels.whatsAppLink"),
      })
      await delay()
    })
    await flush()
    expect([...cadences.values()]).not.toContain(2_000)
    expect(html()).not.toContain("https://wa.me/")
    const stopped = count("assistantChannels.whatsAppLink")
    await tick()
    expect(count("assistantChannels.whatsAppLink")).toBe(stopped)
  })
}
for (const state of [
  { registrationStatus: "REGISTERED", paymentStatus: "PAID" },
  { registrationStatus: "FAILED", paymentStatus: "REFUNDED" },
]) {
  test(`domain ${state.registrationStatus}/${state.paymentStatus} stops terminal polling`, async () => {
    const { client } = await mounted(() => <DomainProgress />)
    expect([...cadences.values()]).toEqual([5_000])
    data["domains.order"] = { ...domain, ...state }
    await act(async () => {
      await client.invalidateQueries({ predicate: target("domains.order") })
      await delay()
    })
    await flush()
    expect(cadences.size).toBe(0)
    const stopped = count("domains.order")
    await tick()
    expect(count("domains.order")).toBe(stopped)
  })
}
for (const state of [
  { registrationStatus: "UNCERTAIN", paymentStatus: "PAID", interval: 30_000 },
  {
    registrationStatus: "FAILED",
    paymentStatus: "REFUND_PENDING",
    interval: 5_000,
  },
]) {
  test(`domain ${state.registrationStatus}/${state.paymentStatus} retains durable recovery cadence`, async () => {
    const { client } = await mounted(() => <DomainProgress />)
    data["domains.order"] = { ...domain, ...state }
    await act(async () => {
      await client.invalidateQueries({ predicate: target("domains.order") })
      await delay()
    })
    await flush()
    expect([...cadences.values()]).toEqual([state.interval])
    const active = count("domains.order")
    await tick()
    expect(count("domains.order")).toBeGreaterThan(active)
  })
}
test("no selected domain order starts no progress reads", async () => {
  await mounted(() => {
    orderId = null
    return <DomainProgress />
  })
  await tick()
  expect(count("domains.order")).toBe(0)
  expect(cadences.size).toBe(0)
})
process.on("exit", () => {
  networkTrap.mockRestore()
  globalThis.setInterval = realInterval
  globalThis.clearInterval = realClear
  focusManager.setFocused(undefined)
})
