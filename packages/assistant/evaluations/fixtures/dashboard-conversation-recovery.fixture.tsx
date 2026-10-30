import { afterEach, expect, mock, test } from "bun:test"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import type { StoreConversationMessageProjection as Message } from "@ewatrade/service-commerce"
import { DOMImplementation } from "@xmldom/xmldom"
import { act, useState } from "react"

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
function events() {
  const listeners = new Map<string, Set<() => void>>()
  return {
    addEventListener(name: string, callback: () => void) {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name)?.add(callback)
    },
    removeEventListener(name: string, callback: () => void) {
      listeners.get(name)?.delete(callback)
    },
    emit(name: string) {
      for (const callback of [...(listeners.get(name) ?? [])]) callback()
    },
  }
}
const windowEvents = events()
const documentEvents = events()
const timers = new Map<number, () => void>()
let timerId = 0
const window = {
  document,
  HTMLElement: class {},
  HTMLIFrameElement: class {},
  ...windowEvents,
  setInterval(callback: () => void) {
    const id = ++timerId
    timers.set(id, callback)
    return id
  },
  clearInterval(id: number) {
    timers.delete(id)
  },
}
Object.assign(document, {
  defaultView: window,
  visibilityState: "visible",
  ...documentEvents,
})
Object.assign(globalThis, { window, document, IS_REACT_ACT_ENVIRONMENT: true })
const network = { onLine: true, userAgent: "inert" }
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: network,
})
const { QueryClient, QueryClientProvider } = await import(
  "@tanstack/react-query"
)
const { createRoot } = await import("react-dom/client")
const { createTRPCClient, TRPCClientError } = await import("@trpc/client")
const { createTRPCOptionsProxy } = await import("@trpc/tanstack-react-query")
const { observable } = await import("@trpc/server/observable")

type Input = {
  afterSequence: number
  conversationId: string
  storeId: string
  limit: number
}
type Page = { messages: Message[]; nextCursor: number | null }
type Ack = {
  clientOperationId: string
  conversationId: string
  storeId: string
  readThroughSequence: number
}
const reads: Input[] = []
const acknowledgements: Ack[] = []
const batches: Message[][] = []
const notices: string[] = []
const callbackVersions: number[] = []
let aborts = 0
let cacheGeneration = 0
let read: (input: Input) => Promise<Page> = async () => ({
  messages: [],
  nextCursor: null,
})
let acknowledge: (input: Ack) => Promise<object> = async () => ({})
const rpc = createTRPCClient<AppRouter>({
  links: [
    () =>
      ({ op }) =>
        observable((observer) => {
          const abort = () => {
            aborts++
            observer.error(new TRPCClientError("Inert read cancelled"))
          }
          op.signal?.addEventListener("abort", abort, { once: true })
          const run = async () => {
            if (op.path === "serviceCommerce.storeConversationMessagesAfter") {
              const input = op.input as Input
              reads.push(input)
              if (reads.length > 30)
                throw new TRPCClientError("Inert reproduction limit")
              return read(input)
            }
            if (
              op.path ===
              "serviceCommerce.acknowledgeStoreConversationStaffRead"
            ) {
              const input = op.input as Ack
              acknowledgements.push(input)
              if (acknowledgements.length > 5)
                throw new TRPCClientError("Inert reproduction limit")
              return acknowledge(input)
            }
            throw new Error("Unexpected inert RPC boundary")
          }
          void run().then(
            (data) => {
              observer.next({ result: { data } })
              observer.complete()
            },
            (error) => observer.error(error),
          )
          return () => op.signal?.removeEventListener("abort", abort)
        }),
  ],
})
let trpc: ReturnType<typeof createTRPCOptionsProxy<AppRouter>>
mock.module("@/trpc/client", () => ({
  useTRPC: () => trpc,
  getDataCacheGeneration: () => cacheGeneration,
}))
const { useStoreConversationRealtime } = await import(
  "../../../../apps/dashboard/src/components/store-conversations/use-store-conversation-realtime"
)
const { mergeStoreConversationSequence } = await import("@ewatrade/utils")
function message(sequence: number): Message {
  return {
    id: `message-${sequence}`,
    sequence,
    text: "Inert message",
    occurredAt: new Date("2026-10-29T00:00:00Z"),
    author: { kind: "customer", label: "Inert customer" },
    channel: "web",
    kind: "customer_text",
    attachments: [],
  }
}
let shown: Message[] = []
function Probe({
  enabled,
  conversationId,
  storeId,
  renderVersion,
  initialMessages,
}: {
  enabled: boolean
  conversationId: string
  storeId: string
  renderVersion: number
  initialMessages: Message[]
}) {
  const [messages, setMessages] = useState(initialMessages)
  shown = messages
  useStoreConversationRealtime({
    enabled,
    conversationId,
    storeId,
    messages,
    // Same inline callback/merge pattern as StoreConversationSheetContent.
    onMessages: (incoming) => {
      callbackVersions.push(renderVersion)
      batches.push(incoming)
      setMessages((current) =>
        mergeStoreConversationSequence(current, incoming),
      )
    },
    onNotice: (notice) => {
      notices.push(notice)
    },
  })
  return <output>{renderVersion}</output>
}
const delay = (ms = 8) => new Promise((resolve) => setTimeout(resolve, ms))
async function flush() {
  await act(async () => {
    await delay()
  })
  await act(async () => {
    await delay()
  })
}
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.()
})
async function mounted(initialMessages: Message[] = []) {
  reads.length = 0
  acknowledgements.length = 0
  batches.length = 0
  notices.length = 0
  callbackVersions.length = 0
  aborts = 0
  cacheGeneration = 0
  network.onLine = true
  Object.assign(document, { visibilityState: "visible" })
  read = async () => ({ messages: [], nextCursor: null })
  acknowledge = async () => ({})
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  trpc = createTRPCOptionsProxy<AppRouter>({ client: rpc, queryClient: client })
  const host = document.createElement("div")
  document.documentElement.appendChild(host)
  const root = createRoot(host as unknown as HTMLElement)
  let disposed = false
  const render = async (
    input: {
      enabled?: boolean
      conversationId?: string
      storeId?: string
      version?: number
      pair?: boolean
      onlySecond?: boolean
    } = {},
  ) => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          {!input.onlySecond ? (
            <Probe
              key="first"
              enabled={input.enabled ?? true}
              conversationId={input.conversationId ?? "chat-a"}
              storeId={input.storeId ?? "store-a"}
              renderVersion={input.version ?? 0}
              initialMessages={initialMessages}
            />
          ) : null}
          {input.pair ? (
            <Probe
              key="second"
              enabled
              conversationId="chat-a"
              storeId="store-a"
              renderVersion={0}
              initialMessages={initialMessages}
            />
          ) : null}
        </QueryClientProvider>,
      )
      await delay()
    })
    await flush()
  }
  const unmount = async () => {
    if (!disposed) {
      disposed = true
      await act(async () => root.unmount())
    }
  }
  cleanups.push(async () => {
    await unmount()
    client.clear()
    document.documentElement.removeChild(host)
  })
  return { client, render, unmount }
}
async function tick() {
  await act(async () => {
    for (const callback of [...timers.values()]) callback()
    await delay()
  })
  await flush()
}

test("callback and mutation renders do not restart recovery or reset its acknowledged sequence", async () => {
  const ui = await mounted([message(1)])
  await ui.render()
  await ui.render({ version: 1 })
  await ui.render({ version: 2 })
  expect(reads).toHaveLength(1)
  expect(acknowledgements).toHaveLength(1)
  await tick()
  expect(reads).toHaveLength(2)
  expect(acknowledgements).toHaveLength(1)
})

for (const action of ["disable", "unmount"] as const)
  test(`a delayed read after ${action} cannot drain another page, notify or acknowledge`, async () => {
    const ui = await mounted()
    const pending = Promise.withResolvers<Page>()
    read = async () => pending.promise
    await ui.render()
    if (action === "disable") await ui.render({ enabled: false })
    else await ui.unmount()
    await act(async () => {
      pending.resolve({ messages: [message(1)], nextCursor: 1 })
      await delay()
    })
    await flush()
    expect(reads).toHaveLength(1)
    expect(batches).toEqual([])
    expect(acknowledgements).toEqual([])
    expect(notices).toEqual([])
    expect(aborts).toBeGreaterThan(0)
  })

test("scope replacement starts its own recovery and rejects a delayed older scope", async () => {
  const ui = await mounted()
  const pending = Promise.withResolvers<Page>()
  read = async (input) =>
    input.conversationId === "chat-a"
      ? pending.promise
      : {
          messages: input.afterSequence < 20 ? [message(20)] : [],
          nextCursor: null,
        }
  await ui.render()
  await ui.render({ conversationId: "chat-b", storeId: "store-b" })
  expect(reads.some((input) => input.conversationId === "chat-b")).toBe(true)
  expect(shown.map((item) => item.sequence)).toEqual([20])
  await act(async () => {
    pending.resolve({ messages: [message(1)], nextCursor: 1 })
    await delay()
  })
  await flush()
  expect(
    reads.filter((input) => input.conversationId === "chat-a"),
  ).toHaveLength(1)
  expect(
    acknowledgements.every(
      (input) =>
        input.conversationId === "chat-b" && input.storeId === "store-b",
    ),
  ).toBe(true)
  expect(shown.map((item) => item.sequence)).toEqual([20])
})

for (const action of ["disable", "unmount"] as const)
  test(`a terminal read after ${action} cannot issue a new acknowledgement`, async () => {
    const ui = await mounted()
    const pending = Promise.withResolvers<Page>()
    read = async () => pending.promise
    await ui.render()
    if (action === "disable") await ui.render({ enabled: false })
    else await ui.unmount()
    await act(async () => {
      pending.resolve({ messages: [message(1)], nextCursor: null })
      await delay()
    })
    await flush()
    expect(acknowledgements).toEqual([])
    expect(batches).toEqual([])
  })

test("active catch-up drains bounded pages in order and acknowledges once", async () => {
  const ui = await mounted()
  read = async (input) =>
    input.afterSequence === 0
      ? { messages: [message(1), message(2)], nextCursor: 2 }
      : { messages: [message(3)], nextCursor: null }
  await ui.render()
  expect(reads.map((input) => input.afterSequence)).toEqual([0, 2])
  expect(shown.map((item) => item.sequence)).toEqual([1, 2, 3])
  expect(acknowledgements).toHaveLength(1)
  expect(acknowledgements[0]?.readThroughSequence).toBe(3)
})

test("failed acknowledgement retries the same idempotency operation on the next poll", async () => {
  const ui = await mounted([message(1)])
  let attempts = 0
  acknowledge = async () => {
    if (++attempts === 1) throw new TRPCClientError("Inert transient failure")
    return {}
  }
  await ui.render()
  expect(acknowledgements).toHaveLength(1)
  await tick()
  expect(acknowledgements).toHaveLength(2)
  expect(acknowledgements[1]?.clientOperationId).toBe(
    acknowledgements[0]?.clientOperationId,
  )
  await tick()
  expect(acknowledgements).toHaveLength(2)
})

for (const reason of ["hidden", "offline"] as const)
  test(`${reason} cancels optional recovery; resume reads current state`, async () => {
    const ui = await mounted()
    const pending = Promise.withResolvers<Page>()
    read = async () => pending.promise
    await ui.render()
    await act(async () => {
      if (reason === "hidden") {
        Object.assign(document, { visibilityState: "hidden" })
        documentEvents.emit("visibilitychange")
      } else {
        network.onLine = false
        windowEvents.emit("offline")
      }
      await delay()
    })
    await act(async () => {
      pending.resolve({ messages: [message(1)], nextCursor: null })
      await delay()
    })
    await flush()
    expect(batches).toEqual([])
    expect(acknowledgements).toEqual([])
    expect(aborts).toBeGreaterThan(0)
    read = async (input) => ({
      messages: input.afterSequence < 2 ? [message(2)] : [],
      nextCursor: null,
    })
    await act(async () => {
      if (reason === "hidden") {
        Object.assign(document, { visibilityState: "visible" })
        documentEvents.emit("visibilitychange")
      } else {
        network.onLine = true
        windowEvents.emit("online")
      }
      await delay()
    })
    await flush()
    expect(shown.map((item) => item.sequence)).toEqual([2])
    expect(acknowledgements).toHaveLength(1)
  })

test("focus bursts coalesce behind one pending read and an issued acknowledgement can finish after close", async () => {
  const ui = await mounted()
  const first = Promise.withResolvers<Page>()
  const ack = Promise.withResolvers<object>()
  read = async (input) =>
    reads.length === 1 ? first.promise : { messages: [], nextCursor: null }
  acknowledge = async () => ack.promise
  await ui.render()
  await act(async () => {
    for (let n = 0; n < 10; n++) windowEvents.emit("focus")
    first.resolve({ messages: [message(1)], nextCursor: null })
    await delay()
  })
  await flush()
  expect(reads).toHaveLength(1)
  expect(acknowledgements).toHaveLength(1)
  await ui.unmount()
  await act(async () => {
    ack.resolve({})
    await delay()
  })
  await flush()
  expect(reads).toHaveLength(1)
  expect(acknowledgements).toHaveLength(1)
  expect(ui.client.getMutationCache().getAll()[0]?.state.status).toBe("success")
})

test("active focus bursts queue one recovery rather than parallel reads", async () => {
  const ui = await mounted()
  const first = Promise.withResolvers<Page>()
  read = async () =>
    reads.length === 1 ? first.promise : { messages: [], nextCursor: null }
  await ui.render()
  await act(async () => {
    for (let n = 0; n < 10; n++) windowEvents.emit("focus")
    first.resolve({ messages: [message(1)], nextCursor: null })
    await delay()
  })
  await flush()
  expect(reads).toHaveLength(2)
  expect(reads[1]?.afterSequence).toBe(1)
  expect(acknowledgements).toHaveLength(1)
})

test("an in-flight recovery uses the latest callback without restarting the read", async () => {
  const ui = await mounted()
  const pending = Promise.withResolvers<Page>()
  read = async () => pending.promise
  await ui.render()
  await ui.render({ version: 7 })
  await act(async () => {
    pending.resolve({ messages: [message(1)], nextCursor: null })
    await delay()
  })
  await flush()
  expect(reads).toHaveLength(1)
  expect(callbackVersions).toEqual([7])
  expect(acknowledgements).toHaveLength(1)
})

test("a cache-scope clear stops queued work until a fresh generation is rendered", async () => {
  const ui = await mounted()
  const pending = Promise.withResolvers<Page>()
  read = async () =>
    reads.length === 1
      ? pending.promise
      : { messages: [message(2)], nextCursor: null }
  await ui.render()
  await act(async () => {
    windowEvents.emit("focus")
    cacheGeneration++
    ui.client.clear()
    await delay()
  })
  await flush()
  expect(reads).toHaveLength(1)
  expect(acknowledgements).toEqual([])
  expect(notices).toEqual([])
  await ui.render()
  expect(reads).toHaveLength(2)
  expect(shown.map((item) => item.sequence)).toEqual([2])
})

test("cancelling one owner does not abort a separate visible owner of the same conversation", async () => {
  const ui = await mounted()
  const first = Promise.withResolvers<Page>()
  const second = Promise.withResolvers<Page>()
  read = async () => (reads.length === 1 ? first.promise : second.promise)
  await ui.render({ pair: true })
  expect(reads).toHaveLength(2)
  await ui.render({ pair: true, onlySecond: true })
  expect(aborts).toBe(1)
  await act(async () => {
    first.resolve({ messages: [message(1)], nextCursor: null })
    second.resolve({ messages: [message(2)], nextCursor: null })
    await delay()
  })
  await flush()
  expect(shown.map((item) => item.sequence)).toEqual([2])
  expect(acknowledgements).toHaveLength(1)
})
