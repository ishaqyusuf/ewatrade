import { expect, mock, test } from "bun:test"
import type { ServiceManualMessageTarget } from "@ewatrade/assistant/general/service-message-read"
import { type ReactNode, act } from "react"
import { renderToStaticMarkup } from "react-dom/server"
// Actual saved-target/receipt dispatch and protected consumer. Native furniture,
// content and query transport are stand-ins; no device/HTTP/database/provider.
const root = new URL("../../../../apps/mobile/src/", import.meta.url)
const standIn = (path: string, value: Record<string, unknown>) =>
  mock.module(new URL(path, root).pathname, () => value)
const children = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
)
standIn("components/ui/text", { Text: children })
standIn("components/ui/view", { View: children })
standIn("components/mobile/green-till/kit", { ListCard: children })
mock.module("react-native", () => ({ ScrollView: children }))
const buttons = new Map<string, () => void>()
const routes: unknown[] = []
standIn("components/mobile/action-button", {
  ActionButton: ({
    children,
    onPress,
  }: { children: string; onPress: () => void }) => {
    buttons.set(children, onPress)
    return <button type="button">{children}</button>
  },
})
mock.module("expo-router", () => ({
  useRouter: () => ({
    push: (route: unknown) => routes.push(route),
    back: () => {},
  }),
}))
const owner = {
  id: "actor",
  businessId: "tenant",
  storeId: "store",
  role: "OWNER",
  staffAccessMode: "LEGACY",
  catalogEditor: false,
  status: "ACTIVE",
}
let profile = { ...owner }
standIn("hooks/use-auth", { useAuthContext: () => ({ profile }) })
const target: ServiceManualMessageTarget = {
  kind: "service_manual_message",
  jobId: "job",
  intentId: "intent",
  shareId: "share",
}
const original = {
  actorUserId: "actor",
  tenantId: "tenant",
  storeId: "store",
  job: { id: "job", revision: 4 },
  order: { id: "order", number: "ORD-1" },
  intent: {
    id: "intent",
    channel: "MANUAL",
    status: "COMPLETED",
    purpose: "assistant_manual_share",
    message: "PRIVATE_SAVED_MESSAGE".repeat(40),
    recipient: { phone: "PRIVATE_SAVED_PHONE", email: "PRIVATE_SAVED_EMAIL" },
    createdAt: "2026-10-15T14:00:00.000Z",
    completedAt: "2026-10-15T14:01:00.000Z",
  },
  share: {
    id: "share",
    channel: "SMS",
    sharedAt: "2026-10-15T14:01:00.000Z",
    note: "Saved note",
    sharedByUserId: "recorded-staff",
  },
  currentOrderRecipientName: "Current label, not a historical name",
  asOf: "2026-10-15T14:02:00.000Z",
  kind: "staff_reported_share",
  sending: "none",
  delivery: "unverified",
}
let data: unknown = original
let flags: Record<string, boolean> = {}
let onOrder: (() => void) | undefined
let shown: unknown
standIn("components/mobile/assistant/native-service-message-content", {
  NativeServiceMessageContent: ({
    record,
    onOpenOrder,
  }: { record: typeof original; onOpenOrder: () => void }) => {
    shown = record
    onOrder = onOpenOrder
    return <div>{record.intent.message}</div>
  },
})
for (const [file, name] of [
  ["native-service-request-screen", "NativeServiceRequestScreen"],
  ["native-booking-original-screen", "NativeBookingOriginalScreen"],
  ["native-quote-original-screen", "NativeQuoteOriginalScreen"],
  ["native-service-job-screen", "NativeServiceJobScreen"],
])
  standIn(`components/mobile/assistant/${file}`, {
    [name]: () => {
      throw Error("Wrong original reader")
    },
  })
const queries: { input: unknown; key?: unknown }[] = []
standIn("trpc/client", {
  useTRPC: () => ({
    serviceCommunications: {
      manualMessageOriginal: {
        queryOptions: (input: unknown, options: unknown) => {
          queries.push({ input })
          return {
            ...(options as object),
            queryKey: ["manual-message-original", input],
          }
        },
      },
    },
  }),
})
mock.module("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: unknown }) => {
    const query = queries.at(-1)
    if (query) query.key = options.queryKey
    return {
      data,
      isError: false,
      isSuccess: true,
      isPending: false,
      isFetching: false,
      isPaused: false,
      isFetchedAfterMount: true,
      ...flags,
    }
  },
}))
const { NativeServiceMessageScreen } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/native-service-message-screen"
)
const { NativeServiceOriginalScreen } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/native-service-original-screen"
)
const { generalReceiptRoute, generalAnswerRoute } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/general-model"
)
function reset() {
  profile = { ...owner }
  data = original
  flags = {}
  queries.length = 0
  buttons.clear()
  routes.length = 0
  onOrder = undefined
  shown = undefined
}
const render = () =>
  renderToStaticMarkup(<NativeServiceMessageScreen target={target} />)
test("saved receipt and answer dispatch exact Job/intent/share into actual original read", () => {
  reset()
  const receipt = {
    kind: "service_manual_message" as const,
    recordId: "intent",
    jobId: "job",
    shareId: "share",
    orderId: "order",
    title: "Recorded",
    detail: "Staff reported; nothing sent",
  }
  const route = generalReceiptRoute(receipt)
  expect(route?.pathname).toBe("/service-jobs-modal")
  expect(
    route && "target" in route.params && JSON.parse(route.params.target),
  ).toEqual(target)
  expect(generalAnswerRoute(target)).toEqual(route)
  expect(
    renderToStaticMarkup(
      <NativeServiceOriginalScreen raw={JSON.stringify(target)} />,
    ),
  ).toContain(original.intent.message)
  expect(queries.at(-1)?.input).toEqual({
    jobId: "job",
    intentId: "intent",
    shareId: "share",
  })
  expect(shown).toEqual(original)
  onOrder?.()
  expect(routes).toEqual([
    { pathname: "/order/[orderId]", params: { orderId: "order" } },
  ])
  expect(
    generalReceiptRoute({
      kind: "order",
      recordId: "legacy-intent",
      orderId: "related-order",
      title: "Old",
      detail: "Old",
    }),
  ).toEqual({
    pathname: "/order/[orderId]",
    params: { orderId: "related-order" },
  })
  for (const bad of [
    { ...target, shareId: "" },
    { ...target, shareId: "x".repeat(129) },
    { ...target, tenantId: "other" },
  ])
    expect(generalAnswerRoute(bad as typeof target)).toBeNull()
})
test("freshness, exact identity and truthful manual semantics hide unauthorized or mismatched facts", () => {
  for (const state of [
    { isError: true },
    { isPaused: true },
    { isFetching: true },
    { isFetchedAfterMount: false },
  ]) {
    reset()
    flags = state
    expect(render()).not.toContain("PRIVATE_")
    expect(shown).toBeUndefined()
  }
  for (const changed of [
    { ...original, actorUserId: "other" },
    { ...original, tenantId: "other" },
    { ...original, storeId: "other" },
    { ...original, job: { ...original.job, id: "other" } },
    { ...original, intent: { ...original.intent, id: "other" } },
    { ...original, share: { ...original.share, id: "other" } },
    { ...original, intent: { ...original.intent, channel: "WHATSAPP" } },
    { ...original, intent: { ...original.intent, status: "READY" } },
    { ...original, sending: "provider" },
    { ...original, delivery: "delivered" },
  ]) {
    reset()
    data = changed
    expect(render()).not.toContain("PRIVATE_")
    expect(shown).toBeUndefined()
  }
  for (const changed of [
    { ...owner, role: "CASHIER" },
    { ...owner, role: "MANAGER", staffAccessMode: "SCOPED" },
    { ...owner, status: "SUSPENDED" },
  ]) {
    reset()
    profile = changed
    expect(render()).not.toContain("PRIVATE_")
    expect(queries).toEqual([])
  }
})

async function mountedFixture() {
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
  const host = document.createElement("div")
  document.documentElement?.appendChild(host)
  const { createRoot } = await import("react-dom/client")
  const mounted = createRoot(host as unknown as HTMLElement)
  return {
    render: async () => {
      shown = undefined
      buttons.clear()
      await act(async () =>
        mounted.render(<NativeServiceMessageScreen target={target} />),
      )
      return host.toString()
    },
    close: async () => {
      await act(async () => mounted.unmount())
    },
  }
}
test("retained original callback cannot revive after checking even with the same cached object", async () => {
  reset()
  const fixture = await mountedFixture()
  try {
    await fixture.render()
    const old = onOrder
    flags = { isFetching: true }
    await fixture.render()
    flags = {}
    await fixture.render()
    old?.()
    expect(routes).toEqual([])
    onOrder?.()
    expect(routes).toHaveLength(1)
    routes.length = 0
    const beforeScope = onOrder
    profile = { ...owner, storeId: "other" }
    await fixture.render()
    beforeScope?.()
    expect(routes).toEqual([])
    profile = { ...owner }
    await fixture.render()
    const beforeUnmount = onOrder
    await fixture.close()
    beforeUnmount?.()
    expect(routes).toEqual([])
  } finally {
    await fixture.close()
  }
})
test("retry retires old controller and remounts an independently fresh read", async () => {
  reset()
  const fixture = await mountedFixture()
  try {
    await fixture.render()
    const old = onOrder
    const before = queries.at(-1)?.key
    await act(async () => buttons.get("Refresh original")?.())
    expect(queries.at(-1)?.key).not.toEqual(before)
    old?.()
    expect(routes).toEqual([])
    onOrder?.()
    expect(routes).toHaveLength(1)
  } finally {
    await fixture.close()
  }
})
