import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import type { inferRouterOutputs } from "@trpc/server"
import { DOMImplementation } from "@xmldom/xmldom"
import { type ReactNode, act } from "react"

const document = new DOMImplementation().createDocument(
  "http://www.w3.org/1999/xhtml",
  "html",
  null,
)
const create = document.createElement.bind(document)
const createText = document.createTextNode.bind(document)
document.createTextNode = (value: string) => {
  const node = createText(value)
  Object.defineProperty(node, "length", {
    configurable: true,
    get: () => node.data.length,
  })
  // React updates nodeValue; the XML host serializes data. Native Text keeps them in sync.
  Object.defineProperty(node, "nodeValue", {
    configurable: true,
    get: () => node.data,
    set: (value: string | null) => {
      node.data = value ?? ""
    },
  })
  return node
}
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
  if (delay !== 1_500 || typeof callback !== "function")
    return realInterval(callback, delay, ...args)
  const id = realInterval(() => {}, 100_000_000)
  intervals.set(id, () => callback(...args))
  return id
}) as typeof setInterval
globalThis.clearInterval = ((id: ReturnType<typeof setInterval>) => {
  intervals.delete(id)
  realClear(id)
}) as typeof clearInterval
let now = Date.now()
const clock = spyOn(Date, "now").mockImplementation(() => now)
let nextDeadline = 0
const deadlines = new Map<number, { at: number; callback: () => void }>()
Object.assign(window, {
  setTimeout(callback: () => void, delay: number) {
    const id = ++nextDeadline
    deadlines.set(id, { at: now + delay, callback })
    return id
  },
  clearTimeout(id: number) {
    deadlines.delete(id)
  },
})
let externalCalls = 0
const network = spyOn(globalThis, "fetch").mockImplementation(
  Object.assign(
    async () => {
      externalCalls++
      throw Error("No external network in inert attachment fixture")
    },
    {
      preconnect: () => {
        throw Error("No external network")
      },
    },
  ),
)
const app = (path: string) =>
  new URL(`../../../../apps/dashboard/src/${path}`, import.meta.url).pathname
let options: ReturnType<typeof createTRPCOptionsProxy<AppRouter>>
mock.module(app("trpc/client"), () => ({ useTRPC: () => options }))
mock.module(app("observability/sentry"), () => ({ captureDashboardError() {} }))
const workflow = { track() {} }
const events = { canCollect: () => false }
mock.module("@ewatrade/events/dashboard-client", () => ({
  useDashboardWorkflow: () => workflow,
}))
mock.module("@ewatrade/events/client", () => ({ useEvents: () => events }))
const actions = new Map<string, () => unknown>()
const leaf = ({ children }: { children?: ReactNode }) => <div>{children}</div>
mock.module("@ewatrade/ui", () => ({
  cn: (...values: unknown[]) =>
    values.filter((value) => typeof value === "string").join(" "),
  Button: ({
    children,
    onClick,
    disabled,
  }: { children?: ReactNode; onClick?: () => unknown; disabled?: boolean }) => {
    if (typeof children === "string" && onClick)
      actions.set(children, () => {
        if (!disabled) return onClick()
      })
    return (
      <button type="button" disabled={disabled}>
        {children}
      </button>
    )
  },
  InputGroup: leaf,
  InputGroupAddon: leaf,
  InputGroupButton: leaf,
  InputGroupTextarea: leaf,
}))
mock.module("@hugeicons/react", () => ({ HugeiconsIcon: () => null }))
mock.module(app("components/setup-assistant/use-setup-voice-recorder"), () => ({
  useSetupVoiceRecorder: () => ({
    state: { kind: "idle" },
    maxDurationMs: 120_000,
  }),
  formatRecorderElapsed: () => "",
}))
type AttachmentRow =
  inferRouterOutputs<AppRouter>["setupAssistant"]["attachments"]["list"][number]
const originalRow = {
  id: "attachment",
  kind: "TEXT",
  status: "PROCESSING",
  fileName: "inert.txt",
  contentType: "text/plain",
  sent: false,
  summary: "Inert summary",
  transcript: null,
  retryable: false,
  error: null,
} satisfies AttachmentRow
let rows: AttachmentRow[] = [{ ...originalRow }]
let holdStatus = false
const heldReads = new Set<{ signal: AbortSignal | null; deliver(): void }>()
let code:
  | "FORBIDDEN"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "INTERNAL_SERVER_ERROR"
  | null = null
const calls: { path: string; type: string; input: unknown }[] = []
const rpc = createTRPCClient<AppRouter>({
  links: [
    () =>
      ({ op }) =>
        observable((observer) => {
          calls.push({ path: op.path, type: op.type, input: op.input })
          if (op.type !== "query") {
            observer.error(
              new TRPCClientError("No commands in inert status fixture"),
            )
            return
          }
          if (op.path === "setupAssistant.attachments.list" && code) {
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
                        referenceId: "inert",
                        requestId: undefined,
                        retryable: false,
                      },
                    },
                  },
                },
              }),
            )
            return
          }
          const deliver = () => {
            const ids =
              op.input &&
              typeof op.input === "object" &&
              "attachmentIds" in op.input &&
              Array.isArray(op.input.attachmentIds)
                ? op.input.attachmentIds
                : []
            const data =
              op.path === "setupAssistant.attachments.pending"
                ? rows.map((row) => ({ ...row }))
                : op.path === "setupAssistant.attachments.list"
                  ? rows.filter((row) => ids.includes(row.id))
                  : op.path === "setupAssistant.attachments.voiceCapabilities"
                    ? { enabled: false, maxDurationMs: 120_000 }
                    : op.path === "assistant.availability"
                      ? { available: true, media: { photos: false } }
                      : undefined
            if (data === undefined) throw Error("Unexpected read")
            observer.next({ result: { data } })
            observer.complete()
          }
          if (op.path === "setupAssistant.attachments.list" && holdStatus) {
            const read = { signal: op.signal ?? null, deliver }
            heldReads.add(read)
            return () => heldReads.delete(read)
          }
          deliver()
        }),
  ],
})
const { useSetupAttachments } = await import(
  "../../../../apps/dashboard/src/components/setup-assistant/use-setup-attachments"
)
const { SetupComposer } = await import(
  "../../../../apps/dashboard/src/components/setup-assistant/setup-composer"
)
const { makeQueryClient } = await import(
  "../../../../apps/dashboard/src/trpc/query-client"
)
let state: ReturnType<typeof useSetupAttachments>
const transcripts: string[] = []
function Subject() {
  state = useSetupAttachments({
    conversationId: "conversation",
    onTranscript: (value) => transcripts.push(value),
  })
  return null
}
const delay = () => new Promise((resolve) => setTimeout(resolve, 3))
async function flush(action?: () => unknown) {
  await act(async () => {
    action?.()
    await delay()
  })
  await act(async () => {
    await delay()
  })
}
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.()
  expect(externalCalls).toBe(0)
  expect(calls.every((call) => call.type === "query")).toBe(true)
  expect(intervals.size).toBe(0)
  expect(deadlines.size).toBe(0)
})
async function mounted(
  composer = false,
  seed: AttachmentRow[] = [originalRow],
  held = false,
) {
  rows = seed.map((row) => ({ ...row }))
  calls.length = 0
  transcripts.length = 0
  actions.clear()
  code = null
  holdStatus = held
  heldReads.clear()
  externalCalls = 0
  focusManager.setFocused(true)
  const client = makeQueryClient()
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
  await flush(() =>
    root.render(
      <QueryClientProvider client={client}>
        {composer ? (
          <SetupComposer
            conversationId="conversation"
            onSend={async () => {
              throw Error("No chat submission")
            }}
            onStop={() => {}}
            busy={false}
            mediaEnabled
          />
        ) : (
          <Subject />
        )}
      </QueryClientProvider>,
    ),
  )
  return {
    client,
    html: () => host.toString(),
    unmount: async () => {
      await act(async () => root.unmount())
    },
  }
}
const statusCount = () =>
  calls.filter((call) => call.path === "setupAssistant.attachments.list").length
const statusQuery = (query: { queryKey: readonly unknown[] }) =>
  Array.isArray(query.queryKey[0]) &&
  query.queryKey[0].join(".") === "setupAssistant.attachments.list"
async function tick() {
  await flush(() => {
    for (const callback of [...intervals.values()]) callback()
  })
}
async function advance(ms: number) {
  await flush(() => {
    now += ms
    for (const [id, timer] of [...deadlines])
      if (timer.at <= now) {
        deadlines.delete(id)
        timer.callback()
      }
  })
}
for (const refusal of ["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"] as const)
  test(`status ${refusal} stops intervals without failing, deleting or reprocessing the upload`, async () => {
    const { client } = await mounted()
    code = refusal
    await flush(() => client.invalidateQueries({ predicate: statusQuery }))
    const stopped = statusCount()
    await tick()
    expect(statusCount()).toBe(stopped)
    expect(state.items[0]?.phase).toBe("reading")
    expect(state.busy).toBe(true)
    expect(state.statusReadMessage).toBeTruthy()
    code = null
    await flush(() => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })
    expect(statusCount()).toBeGreaterThan(stopped)
    const recovered = statusCount()
    await tick()
    expect(statusCount()).toBeGreaterThan(recovered)
  })
test("automatic status polling has a bounded two-minute window, with a read-only Check again", async () => {
  await mounted()
  expect(statusCount()).toBe(1)
  await advance(120_000)
  const stopped = statusCount()
  await tick()
  expect(statusCount()).toBe(stopped)
  expect(state.items[0]?.phase).toBe("reading")
  expect(state.statusReadMessage).toBeTruthy()
  await flush(() => state.checkStatus())
  expect(statusCount()).toBe(stopped + 1)
  expect(state.statusReadMessage).toBeNull()
  await tick()
  expect(statusCount()).toBe(stopped + 2)
})
test("transient failures recover within the window without a command", async () => {
  const { client } = await mounted()
  code = "INTERNAL_SERVER_ERROR"
  await flush(() => client.invalidateQueries({ predicate: statusQuery }))
  const failed = statusCount()
  code = null
  await tick()
  expect(statusCount()).toBeGreaterThan(failed)
  expect(state.items[0]?.phase).toBe("reading")
})
test("late READY after the budget is applied by a fresh focus read without reprocessing", async () => {
  await mounted()
  await advance(120_000)
  rows = [{ ...originalRow, status: "READY" }]
  const before = statusCount()
  await flush(() => {
    focusManager.setFocused(false)
    focusManager.setFocused(true)
  })
  expect(statusCount()).toBeGreaterThan(before)
  expect(state.items[0]?.phase).toBe("ready")
  expect(state.busy).toBe(false)
  expect(state.readyCount).toBe(1)
  expect(state.statusReadMessage).toBeNull()
  const completed = statusCount()
  await tick()
  expect(statusCount()).toBe(completed)
})
test("empty composer owns no status interval or deadline", async () => {
  await mounted(false, [])
  await tick()
  expect(statusCount()).toBe(0)
  expect(deadlines.size).toBe(0)
  expect(state.busy).toBe(false)
})
test("partial completion cannot restart the remaining files' read budget", async () => {
  await mounted(false, [originalRow, { ...originalRow, id: "second" }])
  await advance(119_000)
  rows = [
    { ...originalRow, status: "READY" },
    { ...originalRow, id: "second" },
  ]
  await tick()
  expect(state.readyCount).toBe(1)
  expect(state.busy).toBe(true)
  const current = calls
    .filter((call) => call.path === "setupAssistant.attachments.list")
    .at(-1)
  expect(current?.input).toEqual({ attachmentIds: ["second"] })
  await advance(1_000)
  const stopped = statusCount()
  await tick()
  expect(statusCount()).toBe(stopped)
  expect(state.statusReadMessage).toBeTruthy()
})
test("a late committed read can finish READY after the automatic window", async () => {
  await mounted(false, [originalRow], true)
  const read = [...heldReads][0]
  expect(read).toBeDefined()
  await advance(120_000)
  expect(state.statusReadMessage).toBeTruthy()
  expect(read?.signal?.aborted).not.toBe(true)
  rows = [{ ...originalRow, status: "READY" }]
  await flush(() => read?.deliver())
  expect(state.readyCount).toBe(1)
  expect(state.busy).toBe(false)
  expect(state.statusReadMessage).toBeNull()
  expect(statusCount()).toBe(1)
})
test("unmount aborts only the status read and ignores its late transcript", async () => {
  const view = await mounted(false, [{ ...originalRow, kind: "AUDIO" }], true)
  const read = [...heldReads][0]
  expect(read).toBeDefined()
  await view.unmount()
  expect(read?.signal?.aborted).toBe(true)
  // The inert server deliberately finishes despite cancellation, as admitted work may do.
  rows = [
    {
      ...originalRow,
      kind: "AUDIO",
      status: "READY",
      transcript: "Review this inert transcript",
    },
  ]
  await flush(() => read?.deliver())
  expect(transcripts).toEqual([])
})
test("only a current READY audio row adds one editable transcript", async () => {
  const { client } = await mounted(false, [{ ...originalRow, kind: "AUDIO" }])
  rows = [
    {
      ...originalRow,
      kind: "AUDIO",
      status: "READY",
      transcript: "Review this inert transcript",
    },
  ]
  await flush(() => client.invalidateQueries({ predicate: statusQuery }))
  expect(transcripts).toEqual(["Review this inert transcript"])
  expect(state.readyCount).toBe(1)
  const completed = statusCount()
  await flush(() => state.checkStatus())
  await tick()
  expect(statusCount()).toBe(completed)
  expect(transcripts).toEqual(["Review this inert transcript"])
})
test("server FAILED remains distinct from paused status reads", async () => {
  const { client } = await mounted()
  rows = [
    { ...originalRow, status: "FAILED", error: "Inert processing failure" },
  ]
  await flush(() => client.invalidateQueries({ predicate: statusQuery }))
  expect(state.items[0]?.phase).toBe("failed")
  expect(state.items[0]?.error).toBe("Inert processing failure")
  expect(state.busy).toBe(false)
  expect(state.statusReadMessage).toBeNull()
  const completed = statusCount()
  await tick()
  expect(statusCount()).toBe(completed)
})
test("actual composer exposes read-only recovery instead of transcription retry", async () => {
  const view = await mounted(true)
  await advance(120_000)
  expect(view.html()).toContain("Check again")
  expect(view.html()).not.toContain("Retry transcription")
  rows = [{ ...originalRow, status: "READY" }]
  await flush(() => {
    const action = actions.get("Check again")
    if (!action) throw Error("Missing status recovery action")
    action()
  })
  expect(statusCount()).toBe(2)
  await flush()
  expect(view.html()).toContain("Inert summary")
  expect(view.html()).not.toContain("Check again")
})
process.on("exit", () => {
  network.mockRestore()
  clock.mockRestore()
  globalThis.setInterval = realInterval
  globalThis.clearInterval = realClear
  focusManager.setFocused(undefined)
})
