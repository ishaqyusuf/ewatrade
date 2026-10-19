import { beforeEach, expect, mock, test } from "bun:test"
import { DOMParser } from "@xmldom/xmldom"
import { type ReactNode, act, createElement } from "react"
import type { WhatsAppActionState } from "./customer-messages/message-model"

// The actual generic Order outcome and its actual WhatsApp follow-up, under
// real React. Native views, navigation and the message preview are ports;
// every press goes through the real handlers and history builders.
const source = new URL("../../", import.meta.url)
function standIn(path: string, exports: Record<string, unknown>) {
  mock.module(new URL(path, source).pathname, () => exports)
}
type Press = { label: string; onPress?: () => unknown; disabled?: boolean }
const presses: Press[] = []
const box = ({ children }: { children?: ReactNode }) =>
  createElement("div", null, children)
const text = ({ children }: { children?: ReactNode }) =>
  createElement("span", null, children)
function labelOf(props: { accessibilityLabel?: string; children?: ReactNode }) {
  if (props.accessibilityLabel) return props.accessibilityLabel
  const flat = (node: ReactNode): string =>
    typeof node === "string"
      ? node
      : Array.isArray(node)
        ? node.map(flat).join("")
        : ""
  return flat(props.children)
}
const pressable = (
  props: Press & { accessibilityLabel?: string; children?: ReactNode },
) => {
  presses.push({
    label: labelOf(props),
    onPress: props.onPress,
    disabled: props.disabled,
  })
  return createElement("button", { type: "button" }, props.children)
}
mock.module("react-native", () => ({
  Text: text,
  View: box,
  StyleSheet: { create: <T,>(styles: T) => styles, absoluteFill: {} },
  ActivityIndicator: () => null,
}))
mock.module("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
const dispatched: Array<{ type: string; payload: { routes: unknown[] } }> = []
let routeRef = {
  key: "generic-outcome-1",
  name: "operation-success",
  params: {},
}
mock.module("expo-router", () => ({
  useRouter: () => ({
    replace: () => {
      throw Error("Unexpected non-Order route replacement")
    },
  }),
  useNavigation: () => ({
    dispatch: (action: never) => dispatched.push(action),
  }),
}))
mock.module("@react-navigation/native", () => ({
  useRoute: () => routeRef,
}))
standIn("components/ui/icon", { Icon: () => null })
standIn("components/ui/pressable", { Pressable: pressable })
standIn("components/ui/text", { Text: text })
standIn("components/ui/view", { View: box })
standIn("components/mobile/action-button", { ActionButton: pressable })
let role = "OWNER"
standIn("hooks/use-auth", { useAuthContext: () => ({ profile: { role } }) })
standIn("hooks/use-color", {
  useColorScheme: () => ({ colorScheme: "light" }),
  useColors: () => ({}),
})
type MessageState = WhatsAppActionState
let messageState: MessageState = { kind: "ready" }
const opened: unknown[] = []
const retried: unknown[] = []
const messageTargets: unknown[] = []
standIn("components/mobile/customer-messages/use-order-message", {
  useOrderMessageAction: (input: unknown) => {
    messageTargets.push(input)
    return {
      state: messageState,
      open: () => opened.push(true),
      retry: () => retried.push(true),
    }
  },
})
// Native/rendering leaves, auth/navigation and message-preview ports are inert.
// The generic outcome, inner SaleSuccess, shared WhatsAppFollowUp and history
// builders are actual source; no server authorization or native proof is claimed.
standIn("components/mobile/green-till/hero-card", {
  HeroCard: ({ label, amount }: { label?: string; amount?: string }) =>
    createElement("div", null, label, amount),
})
standIn("components/mobile/green-till/kit", {
  GhostPreview: () => null,
  QuickActionRow: () => null,
  StatusPill: ({ label }: { label: string }) =>
    createElement("span", null, label),
})
standIn("components/mobile/screen", { MobileScreen: box })
const { OperationSuccessScreen } = await import("./operation-success-screen")

beforeEach(() => {
  routeRef = { key: "generic-outcome-1", name: "operation-success", params: {} }
  messageTargets.length = 0
  presses.length = 0
  dispatched.length = 0
  opened.length = 0
  retried.length = 0
  messageState = { kind: "ready" }
  role = "OWNER"
})

async function render(element: ReturnType<typeof createElement>) {
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
  await act(async () => root.render(element))
  return {
    get text() {
      return host.textContent ?? ""
    },
    press: async (label: string) => {
      const target = [...presses]
        .reverse()
        .find((entry) => entry.label.startsWith(label))
      if (!target) throw Error(`No button ${label}`)
      await act(async () => {
        if (!target.disabled) await target.onPress?.()
      })
    },
    find: (label: string) =>
      [...presses].reverse().find((entry) => entry.label.startsWith(label)),
    close: async () => act(async () => root.unmount()),
  }
}
const recorded = {
  kind: "order" as const,
  status: "created" as const,
  orderId: "order-a",
  amount: "₦18,000",
  paymentState: "paid" as const,
  paymentMethod: "cash",
  moneyAccount: "Till B",
  itemCount: "2",
}
const lastRoutes = () => dispatched.at(-1)?.payload.routes
const home = { name: "(admin-tabs)", params: { screen: "admin-home" } }

// Independent generic Order-outcome mounting. Query/auth/native/nav are ports;
// no server authorization, message send, device, browser or installed-router
// acceptance is claimed by these dispatch observations.
function genericRoute() {
  routeRef = { key: "generic-outcome-1", name: "operation-success", params: {} }
}
const composer = {
  name: "customer-message-modal",
  params: { orderId: "order-a", eventKey: "order.recorded" },
}
test("GENERIC actual Order outcome rebases and every ordinary CTA removes completed route for Owner and rep", async () => {
  for (const actorRole of ["OWNER", "CASHIER"]) {
    role = actorRole
    genericRoute()
    presses.length = 0
    dispatched.length = 0
    messageTargets.length = 0
    const expectedHome =
      actorRole === "OWNER" ? home : { name: "sales-rep-home" }
    const ui = await render(
      createElement(OperationSuccessScreen, { params: recorded }),
    )
    try {
      expect(lastRoutes()).toEqual([
        expectedHome,
        { key: "generic-outcome-1", name: "operation-success", params: {} },
      ])
      expect(dispatched).toHaveLength(1)
      expect(messageTargets).toEqual([
        {
          hasPhone: true,
          target: { orderId: "order-a", eventKey: "order.recorded" },
        },
      ])
      const retainedNewSale = ui.find("New sale")?.onPress
      if (!retainedNewSale) throw Error("Missing real New sale handler")
      await ui.press("Receipt")
      expect(lastRoutes()).toEqual([
        expectedHome,
        { name: "order-receipts-modal", params: { orderIds: "order-a" } },
      ])
      await ui.press("View order")
      expect(lastRoutes()).toEqual([
        expectedHome,
        { name: "order/[orderId]", params: { orderId: "order-a" } },
      ])
      await act(async () => {
        await retainedNewSale()
      })
      expect(lastRoutes()).toEqual([
        expectedHome,
        { name: "create-sale-modal" },
      ])
      await ui.press("Go to home")
      expect(lastRoutes()).toEqual([expectedHome])
      expect(opened).toEqual([])
    } finally {
      await ui.close()
    }
  }
})
test("GENERIC actual shared WhatsAppFollowUp opens composer/explanation for every visible non-error state", async () => {
  const states: MessageState[] = [
    { kind: "ready" },
    { kind: "compose" },
    { kind: "invalid_phone" },
    { kind: "disabled" },
    { kind: "blocked", reason: "Choose which record" },
  ]
  for (const state of states) {
    messageState = state
    genericRoute()
    presses.length = 0
    dispatched.length = 0
    opened.length = 0
    const ui = await render(
      createElement(OperationSuccessScreen, { params: recorded }),
    )
    try {
      expect(dispatched).toHaveLength(1)
      expect(ui.find("WhatsApp")?.disabled).toBe(false)
      await ui.press("WhatsApp")
      expect(lastRoutes()).toEqual([home, composer])
      expect(opened).toEqual([])
      expect(retried).toEqual([])
    } finally {
      await ui.close()
    }
  }
})
test("GENERIC shared WhatsApp error retries only; loading disabled; hidden absent", async () => {
  for (const state of [
    { kind: "error" },
    { kind: "loading" },
    { kind: "hidden" },
  ] satisfies MessageState[]) {
    messageState = state
    genericRoute()
    presses.length = 0
    dispatched.length = 0
    retried.length = 0
    opened.length = 0
    const ui = await render(
      createElement(OperationSuccessScreen, { params: recorded }),
    )
    try {
      if (state.kind === "hidden") expect(ui.find("WhatsApp")).toBeUndefined()
      else await ui.press("WhatsApp")
      expect(dispatched).toHaveLength(1)
      expect(retried.length).toBe(state.kind === "error" ? 1 : 0)
      expect(opened).toEqual([])
    } finally {
      await ui.close()
    }
  }
})
test("GENERIC queued known account is once-synced context, has no message/Order access, receipt handler inert", async () => {
  genericRoute()
  const ui = await render(
    createElement(OperationSuccessScreen, {
      params: { ...recorded, status: "queued", orderId: undefined },
    }),
  )
  try {
    expect(ui.text).toContain("Into, once synced")
    expect(ui.text).toContain("Till B")
    expect(messageTargets).toEqual([])
    expect(ui.find("WhatsApp")).toBeUndefined()
    expect(ui.find("View order")).toBeUndefined()
    const receipt = ui.find("Receipt available after sync")
    expect(receipt?.disabled).toBe(true)
    const before = dispatched.length
    await act(async () => {
      await receipt?.onPress?.()
    })
    expect(dispatched.length).toBe(before)
    await ui.press("View sync status")
    expect(lastRoutes()).toEqual([home, { name: "sync-status-modal" }])
  } finally {
    await ui.close()
  }
})
test("GENERIC created and queued pending or unknown account never invent an Into destination", async () => {
  for (const status of ["created", "queued"] as const)
    for (const pending of [true, false]) {
      genericRoute()
      presses.length = 0
      dispatched.length = 0
      messageTargets.length = 0
      const params = {
        ...recorded,
        status,
        orderId: status === "queued" ? undefined : recorded.orderId,
        paymentState: pending ? ("pending" as const) : recorded.paymentState,
        paymentMethod: pending ? undefined : recorded.paymentMethod,
        moneyAccount: pending ? "Till B" : undefined,
      }
      const ui = await render(createElement(OperationSuccessScreen, { params }))
      try {
        expect(ui.text).not.toContain("Into")
        expect(ui.text).not.toContain("Till B")
        if (status === "queued") expect(messageTargets).toEqual([])
      } finally {
        await ui.close()
      }
    }
})
test("GENERIC Service New sale starts a fresh Service draft over exact rep Home", async () => {
  role = "CASHIER"
  genericRoute()
  const ui = await render(
    createElement(OperationSuccessScreen, {
      params: { ...recorded, saleKind: "service" },
    }),
  )
  try {
    await ui.press("New sale")
    expect(lastRoutes()).toEqual([
      { name: "sales-rep-home" },
      { name: "create-sale-modal", params: { kind: "service" } },
    ])
  } finally {
    await ui.close()
  }
})
