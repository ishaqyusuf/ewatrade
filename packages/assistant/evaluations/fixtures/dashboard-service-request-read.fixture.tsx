import { expect, mock, test } from "bun:test"
import { type ReactNode, act } from "react"

// Real dashboard read owners (service request + manual message sheets) with a
// REAL TanStack QueryClient and real read-state helpers, mounted with React DOM
// in a local XML DOM. Only the tRPC client, URL hook, UI primitives and the
// pure content are stood in. No browser, API, database or provider runs.
const root = new URL("../../../../", import.meta.url)
const at = (path: string) =>
  new URL(`apps/dashboard/src/${path}`, root).pathname

type Pending = {
  procedure: string
  input: unknown
  signal?: AbortSignal
  resolve: (value: unknown) => void
}
const calls: Pending[] = []
mock.module(at("trpc/client.tsx"), () => ({
  useTRPCClient: () => {
    const call =
      (procedure: string) =>
      (input: unknown, options: { signal?: AbortSignal }) =>
        new Promise((resolve) => {
          calls.push({ procedure, input, signal: options?.signal, resolve })
        })
    return {
      serviceAssistantRequests: { original: { query: call("request") } },
      serviceCommunications: {
        manualMessageOriginal: { query: call("message") },
      },
    }
  },
}))
let requestTarget: unknown = null
let messageTarget: unknown = null
mock.module(at("hooks/use-assistant-service-request-params.ts"), () => ({
  useAssistantServiceRequestParams: () => ({
    isOpen: true,
    target: requestTarget,
    close: () => {},
  }),
}))
mock.module(at("hooks/use-assistant-manual-message-params.ts"), () => ({
  useAssistantManualMessageParams: () => ({
    isOpen: true,
    target: messageTarget,
    close: () => {},
  }),
}))
const pass = ({ children }: { children?: ReactNode }) => <>{children}</>
mock.module("@ewatrade/ui", () => ({
  Sheet: pass,
  Badge: pass,
  Button: ({ children }: { children?: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}))
mock.module(at("components/sheets/sheet-frame.tsx"), () => ({
  SheetFrame: pass,
}))
mock.module(at("components/assistant-service-request-content.tsx"), () => ({
  AssistantServiceRequestContent: ({
    record,
  }: { record: { marker: string } }) => <output>{record.marker}</output>,
}))
mock.module(at("components/assistant-manual-message-content.tsx"), () => ({
  AssistantManualMessageContent: ({
    record,
  }: { record: { marker: string } }) => <output>{record.marker}</output>,
}))
const { QueryClient, QueryClientProvider } = await import(
  "@tanstack/react-query"
)
const { AssistantServiceRequestSheet } = await import(
  "../../../../apps/dashboard/src/components/sheets/assistant-service-request-sheet"
)
const { AssistantManualMessageSheet } = await import(
  "../../../../apps/dashboard/src/components/sheets/assistant-manual-message-sheet"
)

const scope = (store = "store-1") =>
  JSON.stringify(["actor-1", "business-1", store])
const request = {
  kind: "service_request" as const,
  requestId: "request-1",
  origin: { tenantId: "business-1", storeId: "store-1" },
}
const message = {
  kind: "service_manual_message" as const,
  jobId: "job-1",
  intentId: "intent-1",
  shareId: "share-1",
}
const requestData = (marker: string, store = "store-1") => ({
  marker,
  actorUserId: "actor-1",
  tenantId: "business-1",
  storeId: store,
  request: { id: "request-1" },
})
const messageData = (marker: string, store = "store-1") => ({
  marker,
  actorUserId: "actor-1",
  tenantId: "business-1",
  storeId: store,
  job: { id: "job-1" },
  intent: {
    id: "intent-1",
    channel: "MANUAL",
    status: "COMPLETED",
    purpose: "assistant_manual_share",
  },
  share: { id: "share-1" },
  kind: "staff_reported_share",
  sending: "none",
  delivery: "unverified",
})

async function dom() {
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
  const text = document.createTextNode.bind(document)
  document.createTextNode = (value: string) => {
    const node = text(value)
    Object.defineProperty(node, "nodeValue", {
      get: () => node.data,
      set: (value: string) => {
        node.data = value
      },
    })
    return node
  }
  const { createRoot } = await import("react-dom/client")
  return () => {
    const host = document.createElement("div")
    document.documentElement?.appendChild(host)
    const root = createRoot(host as unknown as HTMLElement)
    return {
      render: async (node: ReactNode) => {
        await act(async () => root.render(node))
        return host.toString()
      },
      html: () => host.toString(),
      unmount: () => act(async () => root.unmount()),
    }
  }
}
// TanStack's notify manager batches observer updates onto a timer tick.
const settle = async () => {
  for (let index = 0; index < 3; index++) {
    for (let step = 0; step < 20; step++) await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

for (const kind of ["request", "message"] as const) {
  const Sheet =
    kind === "request"
      ? AssistantServiceRequestSheet
      : AssistantManualMessageSheet
  const data = kind === "request" ? requestData : messageData
  const loading =
    kind === "request"
      ? "Loading the original Service Request"
      : "Loading the original shared message"

  test(`${kind}: a new Open starts its own read and never shows an earlier in-flight Open's result`, async () => {
    calls.length = 0
    requestTarget = request
    messageTarget = message
    const client = new QueryClient()
    const mountRoot = await dom()
    const first = mountRoot()
    const second = mountRoot()
    const view = (key: string) => (
      <QueryClientProvider client={client}>
        <Sheet scopeKey={key} />
      </QueryClientProvider>
    )
    // The earlier Open's observer stays alive with its read in flight.
    await first.render(view(scope()))
    expect(calls).toHaveLength(1)
    // A new Open of the same exact tuple must own a second read.
    expect(await second.render(view(scope()))).toContain(loading)
    expect(calls).toHaveLength(2)
    await act(async () => {
      calls[0]?.resolve(data("FIRST_OPEN_PRIVATE"))
      await settle()
    })
    expect(second.html()).not.toContain("FIRST_OPEN_PRIVATE")
    expect(second.html()).toContain(loading)
    expect(first.html()).toContain("FIRST_OPEN_PRIVATE")
    await act(async () => {
      calls[1]?.resolve(data("SECOND_OPEN_PRIVATE"))
      await settle()
    })
    expect(second.html()).toContain("SECOND_OPEN_PRIVATE")
    expect(second.html()).not.toContain("FIRST_OPEN_PRIVATE")

    // Close then reopen: a fresh owner, a third read, nothing cached shown.
    await second.unmount()
    const reopened = mountRoot()
    const html = await reopened.render(view(scope()))
    expect(calls).toHaveLength(3)
    expect(html).toContain(loading)
    expect(html).not.toContain("SECOND_OPEN_PRIVATE")
    await act(async () => {
      calls[2]?.resolve(data("THIRD_OPEN_PRIVATE"))
      await settle()
    })
    expect(reopened.html()).toContain("THIRD_OPEN_PRIVATE")

    // A changed Store scope remounts the read owner and withholds old facts.
    const changed = await first.render(view(scope("store-2")))
    expect(changed).not.toContain("FIRST_OPEN_PRIVATE")
    expect(calls).toHaveLength(4)
    await act(async () => {
      calls[3]?.resolve(data("OTHER_STORE_PRIVATE", "store-2"))
      await settle()
    })
    // Request targets keep their saved origin Store, so another Store is refused;
    // the message target has no origin and is shown only for the matching scope.
    if (kind === "request") {
      expect(first.html()).not.toContain("OTHER_STORE_PRIVATE")
      expect(first.html()).toContain("unavailable")
    } else expect(first.html()).toContain("OTHER_STORE_PRIVATE")
    await first.unmount()
    await reopened.unmount()
    client.clear()
  })

  test(`${kind}: a response for another record, actor or Store is never shown`, async () => {
    for (const wrong of [
      { ...data("WRONG_ACTOR_PRIVATE"), actorUserId: "other-actor" },
      { ...data("WRONG_STORE_PRIVATE"), storeId: "other-store" },
      kind === "request"
        ? { ...data("WRONG_RECORD_PRIVATE"), request: { id: "other-request" } }
        : { ...data("WRONG_RECORD_PRIVATE"), share: { id: "other-share" } },
    ]) {
      calls.length = 0
      requestTarget = request
      messageTarget = message
      const client = new QueryClient()
      const view = (await dom())()
      await view.render(
        <QueryClientProvider client={client}>
          <Sheet scopeKey={scope()} />
        </QueryClientProvider>,
      )
      await act(async () => {
        calls[0]?.resolve(wrong)
        await settle()
      })
      expect(view.html()).not.toContain(wrong.marker)
      expect(view.html()).toContain("unavailable")
      await view.unmount()
      client.clear()
    }
  })
}

test("each read is sent the exact canonical input and its own abort signal", async () => {
  calls.length = 0
  requestTarget = request
  messageTarget = message
  const client = new QueryClient()
  const mountRoot = await dom()
  for (const Sheet of [
    AssistantServiceRequestSheet,
    AssistantManualMessageSheet,
  ]) {
    const view = mountRoot()
    await view.render(
      <QueryClientProvider client={client}>
        <Sheet scopeKey={scope()} />
      </QueryClientProvider>,
    )
    await view.unmount()
  }
  expect(calls.map((call) => [call.procedure, call.input])).toEqual([
    ["request", { requestId: "request-1" }],
    ["message", { jobId: "job-1", intentId: "intent-1", shareId: "share-1" }],
  ])
  expect(calls.every((call) => call.signal instanceof AbortSignal)).toBe(true)
  expect(calls.every((call) => call.signal?.aborted)).toBe(true)
  client.clear()
})
