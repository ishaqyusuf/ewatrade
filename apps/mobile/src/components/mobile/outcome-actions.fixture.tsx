import { beforeEach, expect, mock, test } from "bun:test"
import { DOMParser } from "@xmldom/xmldom"
import { type ReactNode, act, createElement } from "react"

// The actual Sales recorded sheet and the actual WhatsApp follow-up, under
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
const builder = new Proxy({}, { get: () => () => builder }) as Record<
  string,
  unknown
>
mock.module("react-native-reanimated", () => ({
  default: { View: box },
  FadeIn: builder,
  FadeInDown: builder,
  SlideInDown: builder,
  Easing: { out: () => () => 0, cubic: () => 0 },
  ReduceMotion: { System: 0 },
}))
mock.module("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
mock.module("react-native-svg", () => ({
  default: box,
  Defs: box,
  RadialGradient: box,
  Rect: () => null,
  Stop: () => null,
}))
const dispatched: Array<{ type: string; payload: { routes: unknown[] } }> = []
mock.module("expo-router", () => ({
  useNavigation: () => ({
    dispatch: (action: never) => dispatched.push(action),
  }),
}))
mock.module("@react-navigation/native", () => ({
  useRoute: () => ({
    key: "create-sale-1",
    name: "create-sale-modal",
    params: {},
  }),
}))
standIn("components/ui/icon", { Icon: () => null })
standIn("components/ui/pressable", { Pressable: pressable })
standIn("components/ui/text", { Text: text })
standIn("components/ui/view", { View: box })
standIn("components/mobile/action-button", { ActionButton: pressable })
standIn("components/mobile/brand", { BrandMark: () => null })
let role = "OWNER"
standIn("hooks/use-auth", { useAuthContext: () => ({ profile: { role } }) })
standIn("hooks/use-color", {
  useColorScheme: () => ({ colorScheme: "light" }),
  useColors: () => ({}),
})
type MessageState =
  | {
      kind:
        | "hidden"
        | "loading"
        | "ready"
        | "error"
        | "compose"
        | "invalid_phone"
        | "disabled"
    }
  | { kind: "blocked"; reason: string }
let messageState: MessageState = { kind: "ready" }
const opened: unknown[] = []
const retried: unknown[] = []
standIn("components/mobile/customer-messages/use-order-message", {
  useOrderMessageAction: () => ({
    state: messageState,
    open: () => opened.push(true),
    retry: () => retried.push(true),
  }),
})
const { ClassicSaleSuccessSheet } = await import(
  "./appearances/classic/sale-success-sheet"
)
const { WhatsAppFollowUp } = await import("./customer-messages/whatsapp-action")

beforeEach(() => {
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

test("every Sales recorded action leaves only Home plus its destination", async () => {
  const ui = await render(
    createElement(ClassicSaleSuccessSheet, { params: recorded }),
  )
  try {
    // Mounting rebases the outcome on Home.
    expect(lastRoutes()).toEqual([
      home,
      { key: "create-sale-1", name: "create-sale-modal", params: {} },
    ])
    await ui.press("New sale")
    expect(lastRoutes()).toEqual([home, { name: "create-sale-modal" }])
    await ui.press("Receipt")
    expect((lastRoutes() as Array<{ name: string }>)[1]?.name).toBe(
      "order-receipts-modal",
    )
    await ui.press("View order")
    expect(lastRoutes()).toEqual([
      home,
      { name: "order/[orderId]", params: { orderId: "order-a" } },
    ])
    await ui.press("Go to home")
    expect(lastRoutes()).toEqual([home])
  } finally {
    await ui.close()
  }
})

test("WhatsApp: ready leaves to Home → composer; error only retries; loading and hidden do nothing", async () => {
  const ui = await render(
    createElement(ClassicSaleSuccessSheet, { params: recorded }),
  )
  try {
    await ui.press("WhatsApp")
    expect(lastRoutes()).toEqual([
      home,
      {
        name: "customer-message-modal",
        params: { orderId: "order-a", eventKey: "order.recorded" },
      },
    ])
    expect(opened).toEqual([])
  } finally {
    await ui.close()
  }
  for (const kind of ["error", "loading"] as const) {
    messageState = { kind }
    presses.length = 0
    dispatched.length = 0
    const again = await render(
      createElement(ClassicSaleSuccessSheet, { params: recorded }),
    )
    try {
      const before = dispatched.length
      await again.press("WhatsApp")
      expect(dispatched.length).toBe(before)
      expect(retried.length).toBe(kind === "error" ? 1 : 0)
    } finally {
      await again.close()
    }
    retried.length = 0
  }
  messageState = { kind: "hidden" }
  presses.length = 0
  const hidden = await render(
    createElement(ClassicSaleSuccessSheet, { params: recorded }),
  )
  try {
    expect(hidden.find("WhatsApp")).toBeUndefined()
  } finally {
    await hidden.close()
  }
})

test("Into shows the chosen account; queued says once synced; pending shows none", async () => {
  const ui = await render(
    createElement(ClassicSaleSuccessSheet, { params: recorded }),
  )
  try {
    expect(ui.text).toContain("Into")
    expect(ui.text).toContain("Till B")
    expect(ui.text).not.toContain("once synced")
  } finally {
    await ui.close()
  }
  const queued = await render(
    createElement(ClassicSaleSuccessSheet, {
      params: { ...recorded, status: "queued", orderId: undefined },
    }),
  )
  try {
    expect(queued.text).toContain("Into, once synced")
    // No receipt or Order before it syncs.
    expect(queued.find("Receipt available after sync")?.disabled).toBe(true)
    await queued.press("Sync status")
    expect(lastRoutes()).toEqual([home, { name: "sync-status-modal" }])
  } finally {
    await queued.close()
  }
  const pending = await render(
    createElement(ClassicSaleSuccessSheet, {
      params: {
        ...recorded,
        paymentState: "pending",
        paymentMethod: undefined,
      },
    }),
  )
  try {
    expect(pending.text).not.toContain("Into")
  } finally {
    await pending.close()
  }
  const unknown = await render(
    createElement(ClassicSaleSuccessSheet, {
      params: { ...recorded, moneyAccount: undefined },
    }),
  )
  try {
    expect(unknown.text).not.toContain("Into")
  } finally {
    await unknown.close()
  }
})

test("New sale after a Service order opens a fresh Service order", async () => {
  role = "CASHIER"
  const ui = await render(
    createElement(ClassicSaleSuccessSheet, {
      params: { ...recorded, saleKind: "service" },
    }),
  )
  try {
    await ui.press("New sale")
    expect((lastRoutes() as unknown[])[1]).toEqual({
      name: "create-sale-modal",
      params: { kind: "service" },
    })
  } finally {
    await ui.close()
  }
})

test("WhatsAppFollowUp: override replaces the ordinary open; default and error unchanged", async () => {
  const props = {
    done: "Sale recorded.",
    hasPhone: true,
    target: { orderId: "order-a" },
  }
  let overridden = 0
  const custom = await render(
    createElement(WhatsAppFollowUp, { ...props, onOpen: () => overridden++ }),
  )
  try {
    await custom.press("WhatsApp")
    expect(overridden).toBe(1)
    expect(opened).toEqual([])
  } finally {
    await custom.close()
  }
  const plain = await render(createElement(WhatsAppFollowUp, props))
  try {
    await plain.press("WhatsApp")
    expect(opened).toEqual([true])
  } finally {
    await plain.close()
  }
  messageState = { kind: "error" }
  const failing = await render(
    createElement(WhatsAppFollowUp, { ...props, onOpen: () => overridden++ }),
  )
  try {
    await failing.press("WhatsApp")
    expect(retried).toEqual([true])
    expect(overridden).toBe(1)
  } finally {
    await failing.close()
  }
  messageState = { kind: "loading" }
  const loading = await render(
    createElement(WhatsAppFollowUp, { ...props, onOpen: () => overridden++ }),
  )
  try {
    await loading.press("WhatsApp")
    expect(overridden).toBe(1)
  } finally {
    await loading.close()
  }
  messageState = { kind: "hidden" }
  presses.length = 0
  const hidden = await render(createElement(WhatsAppFollowUp, props))
  try {
    expect(hidden.find("WhatsApp")).toBeUndefined()
  } finally {
    await hidden.close()
  }
})

test("every visible message state except error and loading leaves Sales recorded for the composer", async () => {
  const states: MessageState[] = [
    { kind: "ready" },
    { kind: "compose" },
    { kind: "invalid_phone" },
    { kind: "disabled" },
    { kind: "blocked", reason: "opted_out" },
  ]
  for (const state of states) {
    messageState = state
    presses.length = 0
    dispatched.length = 0
    opened.length = 0
    const ui = await render(
      createElement(ClassicSaleSuccessSheet, { params: recorded }),
    )
    try {
      await ui.press("WhatsApp")
      expect(lastRoutes()).toEqual([
        home,
        {
          name: "customer-message-modal",
          params: { orderId: "order-a", eventKey: "order.recorded" },
        },
      ])
      // Never the ordinary open over the outcome, never an automatic send.
      expect(opened).toEqual([])
    } finally {
      await ui.close()
    }
  }
})
