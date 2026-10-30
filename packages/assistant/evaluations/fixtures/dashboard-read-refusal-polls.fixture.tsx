import { afterEach, expect, mock, test } from "bun:test"
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
globalThis.setInterval = ((
  callback: TimerHandler,
  delay?: number,
  ...args: unknown[]
) => {
  if (delay !== 30_000 || typeof callback !== "function")
    return realInterval(callback, delay, ...args)
  const id = realInterval(() => {}, 100_000_000)
  intervals.set(id, () => callback(...args))
  return id
}) as typeof setInterval
globalThis.clearInterval = ((id: ReturnType<typeof setInterval>) => {
  intervals.delete(id)
  realClear(id)
}) as typeof clearInterval
const calls: string[] = []
type ReadFailure =
  | "FORBIDDEN"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "INTERNAL_SERVER_ERROR"
const failures = new Map<string, ReadFailure>()
const product = {
  enabled: true,
  drafts: [],
  allowance: {
    requestsRemaining: 5,
    requestLimit: 10,
    tokensRemaining: 1000,
    windowDays: 30,
    resetsAt: null,
    exhausted: false,
  },
}
const data: Record<string, unknown> = {
  "productAssistant.capabilities": product,
  "assistant.allowance": {
    remainingRequests: 5,
    remainingTokens: 1000,
    resetsAt: "2026-11-01T00:00:00Z",
  },
  "setupAssistant.state": { enabled: false },
  "stores.orderVisibility": {
    salesRepOrderVisibility: "OWN_SALES",
    reviewedAt: null,
  },
  "orders.pendingChangeApprovals": [],
}
const rpc = createTRPCClient<AppRouter>({
  links: [
    () =>
      ({ op }) =>
        observable((observer) => {
          calls.push(op.path)
          if (op.type !== "query") {
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
            observer.next({ result: { data: data[op.path] } })
            observer.complete()
          }
        }),
  ],
})
let options: ReturnType<typeof createTRPCOptionsProxy<AppRouter>>
const app = (path: string) =>
  new URL(`../../../../apps/dashboard/src/${path}`, import.meta.url).pathname
mock.module(app("trpc/client"), () => ({ useTRPC: () => options }))
mock.module(app("observability/sentry"), () => ({ captureDashboardError() {} }))
const leaf = ({ children }: { children?: ReactNode }) => <div>{children}</div>
mock.module("@ewatrade/ui", () => ({
  Button: leaf,
  Input: leaf,
  Select: leaf,
  Skeleton: leaf,
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
}))
mock.module("next/link", () => ({ default: leaf }))
mock.module("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }))
mock.module(app("components/settings/settings-page"), () => ({
  SettingsRow: leaf,
  SettingsSection: leaf,
}))
mock.module(app("hooks/use-catalog-item-params"), () => ({
  useCatalogItemParams: () => ({ setParams() {} }),
}))
mock.module(app("hooks/use-setup-assistant-params"), () => ({
  useSetupAssistantParams: () => ({ setSetupOpen() {} }),
}))
// Only format helpers used by these links are inert; their query owners are real.
mock.module(app("components/general-assistant/general-chat"), () => ({
  generalBudgetLine: () => "Inert allowance",
  generalBudgetUsed: () => false,
}))
const { AssistantAllowance } = await import(
  "../../../../apps/dashboard/src/components/product-assistant/assistant-allowance"
)
const { AssistantLinks } = await import(
  "../../../../apps/dashboard/src/components/general-assistant/assistant-links"
)
const { useOrderVisibility } = await import(
  "../../../../apps/dashboard/src/components/staff/order-visibility-card"
)
const { usePendingChangeApprovals } = await import(
  "../../../../apps/dashboard/src/components/orders/overview/order-change-approvals"
)
const { makeQueryClient } = await import(
  "../../../../apps/dashboard/src/trpc/query-client"
)
function Staff({ review = true }: { review?: boolean }) {
  useOrderVisibility("store-a", review)
  return null
}
function Approvals() {
  usePendingChangeApprovals()
  return null
}
const owners = [
  {
    name: "product allowance",
    path: "productAssistant.capabilities",
    render: () => <AssistantAllowance compact />,
  },
  {
    name: "Assistant product link",
    path: "productAssistant.capabilities",
    render: () => <AssistantLinks pending={[]} onReview={() => {}} />,
  },
  {
    name: "Assistant allowance link",
    path: "assistant.allowance",
    render: () => <AssistantLinks pending={[]} onReview={() => {}} />,
  },
  {
    name: "staff review",
    path: "stores.orderVisibility",
    render: () => <Staff />,
  },
  {
    name: "approval queue",
    path: "orders.pendingChangeApprovals",
    render: () => <Approvals />,
  },
]
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
})
async function mounted(render: () => ReactNode) {
  calls.length = 0
  failures.clear()
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
  return { client }
}
function target(path: string) {
  return (query: { queryKey: readonly unknown[] }) =>
    Array.isArray(query.queryKey[0]) && query.queryKey[0].join(".") === path
}
for (const owner of owners) {
  for (const code of ["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"] as const)
    test(`${owner.name} stops ${code} intervals and resumes after focus recovery`, async () => {
      const { client } = await mounted(owner.render)
      expect(count(owner.path)).toBeGreaterThan(0)
      failures.set(owner.path, code)
      await act(async () => {
        await client.invalidateQueries({ predicate: target(owner.path) })
        await delay()
      })
      await flush()
      for (const query of client
        .getQueryCache()
        .findAll({ predicate: target(owner.path) }))
        expect(query.state.data).toBeUndefined()
      const refused = count(owner.path)
      await tick()
      expect(count(owner.path)).toBe(refused)
      failures.delete(owner.path)
      await act(async () => {
        focusManager.setFocused(false)
        focusManager.setFocused(true)
        await delay()
      })
      await flush()
      expect(count(owner.path)).toBeGreaterThan(refused)
      const recovered = count(owner.path)
      await tick()
      expect(count(owner.path)).toBeGreaterThan(recovered)
    })
  test(`${owner.name} retains transient interval recovery`, async () => {
    const { client } = await mounted(owner.render)
    failures.set(owner.path, "INTERNAL_SERVER_ERROR")
    await act(async () => {
      await client.invalidateQueries({ predicate: target(owner.path) })
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
      .findAll({ predicate: target(owner.path) }))
      expect(query.state.status).toBe("success")
  })
}
test("staff directory uses no review interval but retains fresh focus reads", async () => {
  await mounted(() => <Staff review={false} />)
  const before = count("stores.orderVisibility")
  await tick()
  expect(count("stores.orderVisibility")).toBe(before)
  await act(async () => {
    focusManager.setFocused(false)
    focusManager.setFocused(true)
    await delay()
  })
  await flush()
  expect(count("stores.orderVisibility")).toBeGreaterThan(before)
})
process.on("exit", () => {
  globalThis.setInterval = realInterval
  globalThis.clearInterval = realClear
  focusManager.setFocused(undefined)
})
