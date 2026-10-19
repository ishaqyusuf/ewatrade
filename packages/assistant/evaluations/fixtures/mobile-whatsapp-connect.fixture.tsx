import { expect, mock, spyOn, test } from "bun:test"
import { whatsAppConnectUrl } from "@ewatrade/assistant/channels/whatsapp"
import { type ReactNode, act, useEffect } from "react"

// Actual mobile screen + real QueryClient. Native/auth/RPC boundaries only;
// no Session, browser, device, database, environment flag or provider operation.
const repo = new URL("../../../../", import.meta.url)
const at = (name: string) => new URL(`apps/mobile/src/${name}`, repo).pathname
const mobile = (name: string, exports: Record<string, unknown>) =>
  mock.module(at(name), () => exports)
let offline = false
let generation = 1
let session = {
  token: "synthetic-ordinary-session",
  profile: {
    id: "actor",
    businessId: "tenant",
    storeId: "store",
    businessName: "Synthetic business",
    storeName: "Synthetic Store",
  },
}
mobile("hooks/use-auth.tsx", { useAuthContext: () => session })
mobile("lib/session-store.ts", {
  getSession: () => session,
  isLocalSessionToken: (token: string) => token.startsWith("local_"),
})
mobile("lib/onboarding-web-client.ts", {
  onboardingDashboardUrl: () => "https://synthetic.invalid",
})
mobile("store/operationalModeStore.ts", {
  useOperationalModeStore: Object.assign(
    (selector: (state: { isOfflineMode: boolean }) => unknown) =>
      selector({ isOfflineMode: offline }),
    { getState: () => ({ isOfflineMode: offline }) },
  ),
})
type Call = {
  name: string
  input: unknown
  settled: boolean
  resolve(value: unknown): void
  reject(error: Error): void
}
const calls: Call[] = []
const rpc = (name: string) => (input?: unknown) =>
  new Promise<unknown>((resolve, reject) =>
    calls.push({ name, input, settled: false, resolve, reject }),
  )
const query = (name: string) => ({
  queryOptions: (input: unknown, options: Record<string, unknown> = {}) => ({
    queryKey: ["rpc", name, input],
    queryFn: () => rpc(name)(input),
    ...options,
  }),
})
const mutation = (name: string) => ({
  mutationOptions: (options: Record<string, unknown> = {}) => ({
    mutationFn: rpc(name),
    ...options,
  }),
})
mobile("trpc/client.tsx", {
  getDataCacheGeneration: () => generation,
  useTRPC: () => ({
    assistantChannels: {
      availability: query("availability"),
      whatsAppLink: query("status"),
      whatsAppConnections: query("connections"),
      createWhatsAppLink: mutation("create"),
      confirmWhatsAppLink: mutation("confirm"),
      revokeWhatsApp: mutation("revoke"),
    },
  }),
})
const handlers = new Map<string, () => unknown>()
function Button({
  children,
  onPress,
  disabled,
  isLoading,
  loadingLabel,
}: {
  children?: ReactNode
  onPress?: () => unknown
  disabled?: boolean
  isLoading?: boolean
  loadingLabel?: string
}) {
  const label = typeof children === "string" ? children : ""
  if (label && onPress) handlers.set(label, onPress)
  return (
    <button data-action={label} disabled={disabled || isLoading} type="button">
      {isLoading ? loadingLabel : children}
    </button>
  )
}
const Container = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
)
mobile("components/mobile/action-button.tsx", { ActionButton: Button })
mobile("components/ui/view.tsx", { View: Container })
mobile("components/ui/text.tsx", {
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
})
mobile("components/mobile/screen.tsx", { MobileScreen: Container })
mobile("components/mobile/settings-screen.tsx", {
  SettingsScreen: ({ title }: { title: string }) => <h1>{title}</h1>,
})
mobile("components/mobile/green-till/screen-bar.tsx", { ScreenBar: () => null })
mobile("components/mobile/green-till/kit.tsx", {
  ListCard: Container,
  SectionHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
  RecordRow: ({ title, meta }: { title: string; meta: string[] }) => (
    <p>{[title, ...meta].join(" | ")}</p>
  ),
})
mobile("components/mobile/status-banner.tsx", {
  StatusBanner: ({
    title,
    message,
    actionLabel,
    onActionPress,
  }: {
    title?: string
    message?: string
    actionLabel?: string
    onActionPress?: () => unknown
  }) => (
    <section>
      {title}
      {message}
      {actionLabel ? (
        <Button onPress={onActionPress}>{actionLabel}</Button>
      ) : null}
    </section>
  ),
})
mobile("components/mobile/assistant-whatsapp/scope-picker.tsx", {
  WhatsAppScopePicker: () => null,
})
const router = { canGoBack: () => false, back() {}, replace() {}, push() {} }
function useSyntheticFocusEffect(callback: () => (() => void) | undefined) {
  useEffect(() => callback(), [callback])
}
mock.module("expo-router", () => ({
  useRouter: () => router,
  useFocusEffect: useSyntheticFocusEffect,
}))
const alerts: Array<{ text: string; onPress?: () => unknown }[]> = []
const opens: string[] = []
mock.module("react-native", () => ({
  Alert: {
    alert: (
      _title: string,
      _detail: string,
      actions: (typeof alerts)[number],
    ) => alerts.push(actions),
  },
  Linking: { openURL: async (url: string) => void opens.push(url) },
}))
mock.module("expo-clipboard", () => ({ setStringAsync: async () => {} }))
const { QueryClient, QueryClientProvider, onlineManager } = await import(
  "@tanstack/react-query"
)
const { AssistantWhatsAppScreen } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant-whatsapp/screen"
)
const settle = async () => {
  for (let round = 0; round < 3; round++) {
    for (let step = 0; step < 20; step++) await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}
function pending(name: string) {
  const call = calls.find((call) => call.name === name && !call.settled)
  if (!call) throw Error(`Expected pending synthetic ${name}`)
  call.settled = true
  return call
}
async function answer(name: string, value: unknown, reject = false) {
  const call = pending(name)
  await act(async () => {
    if (reject) call.reject(Error("Synthetic RPC unavailable"))
    else call.resolve(value)
    await settle()
  })
  return call
}

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
    setInterval,
    clearInterval,
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
      set: (next: string) => {
        node.data = next
      },
    })
    return node
  }
  const { createRoot } = await import("react-dom/client")
  return async () => {
    const host = document.createElement("div")
    document.documentElement?.appendChild(host)
    const root = createRoot(host as unknown as HTMLElement)
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const render = async () => {
      await act(async () => {
        root.render(
          <QueryClientProvider client={client}>
            <AssistantWhatsAppScreen />
          </QueryClientProvider>,
        )
        await settle()
      })
    }
    await render()
    const button = (label: string) =>
      Array.from(host.getElementsByTagName("button")).find(
        (node) => node.getAttribute("data-action") === label,
      )
    return {
      client,
      render,
      html: () => host.toString(),
      disabled: (label: string) => {
        const node = button(label)
        if (!node) throw Error(`Missing rendered ${label}`)
        return node.hasAttribute("disabled")
      },
      click: async (label: string) => {
        const node = button(label)
        if (!node || node.hasAttribute("disabled"))
          throw Error(`Unavailable rendered ${label}`)
        const handler = handlers.get(label)
        if (!handler) throw Error(`Missing ${label} callback`)
        await act(async () => {
          handler()
          await settle()
        })
      },
      refresh: async (name: string) =>
        act(async () => {
          void client.invalidateQueries({ queryKey: ["rpc", name] })
          await settle()
        }),
      close: async () => {
        await act(async () => root.unmount())
        client.clear()
      },
    }
  }
}

const privateUrl = whatsAppConnectUrl("234800005343", "a".repeat(43))
const link = {
  id: "synthetic-link",
  url: privateUrl,
  expiresAt: new Date(Date.now() + 60_000),
}
const status = (state: string, revision: number) => ({
  id: link.id,
  state,
  revision,
  expiresAt: link.expiresAt,
  maskedSender: state === "awaiting_confirmation" ? "+234••••5343" : null,
})

test("actual mobile WhatsApp screen confirms fresh claims and fences offline/scope changes while managing personal grants", async () => {
  let externalCalls = 0
  const refuse = () => {
    externalCalls++
    throw Error("Network forbidden in isolated mobile WhatsApp journey")
  }
  const trap = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(async () => refuse(), { preconnect: refuse }),
  )
  let view: Awaited<ReturnType<Awaited<ReturnType<typeof dom>>>> | undefined
  try {
    const mount = await dom()
    view = await mount()
    expect(view.html()).toContain("Checking WhatsApp availability")
    expect(view.html()).toContain("Loading your connections")
    await answer("connections", [])
    expect(view.html()).toContain("No WhatsApp business connections")
    await answer("availability", null, true)
    expect(view.html()).toContain("Could not check availability")
    await view.click("Retry")
    await answer("availability", { enabled: true })
    await view.click("Connect this business")
    expect(view.html()).toContain("Preparing link")
    await answer("create", null, true)
    expect(view.html()).toContain("Could not start a link")
    await view.click("Connect this business")
    await answer("create", link)
    await answer("status", status("awaiting_whatsapp", 1))
    expect(view.html()).toContain("Send your connection message")
    await view.click("Open WhatsApp")
    expect(opens).toEqual([privateUrl])
    await view.click("Check connection")
    await answer("status", null, true)
    expect(view.html()).toContain("Could not read this connection")
    await view.click("Check connection")
    await answer("status", status("awaiting_confirmation", 2))
    expect(view.html()).toContain("+234••••5343")
    expect(calls.filter((call) => call.name === "confirm").length).toBe(0)
    await view.click("Confirm my number")
    const rejected = await answer("confirm", null, true)
    expect(rejected.input).toEqual({ linkId: link.id, expectedRevision: 2 })
    expect(view.html()).toContain("Could not confirm this number")
    await answer("status", status("awaiting_confirmation", 3))
    await view.click("Confirm my number")
    const accepted = await answer("confirm", { id: "grant" })
    expect(accepted.input).toEqual({ linkId: link.id, expectedRevision: 3 })
    expect(view.html()).toContain("WhatsApp connected")
    expect(view.html()).not.toContain("Confirm my number")
    await answer("connections", [])

    await view.click("Connect this business")
    await answer("create", link)
    await answer("status", status("expired", 4))
    expect(view.html()).toContain("Link expired or cancelled")
    expect(view.html()).not.toContain("Open WhatsApp")
    await view.click("Start again")
    await answer("connections", [])

    // Actual in-flight create result is rejected when real account scope/cache
    // changes. Personal grant management remains available without a Store.
    await view.click("Connect this business")
    const staleCreate = pending("create")
    session = {
      ...session,
      profile: { ...session.profile, businessId: "", storeId: "" },
    }
    generation++
    await view.render()
    await act(async () => {
      staleCreate.resolve(link)
      await settle()
    })
    expect(view.html()).not.toContain("Open WhatsApp")
    expect(view.html()).toContain("Choose an accessible business and Store")
    const availabilityCalls = calls.filter(
      (call) => call.name === "availability",
    ).length
    const grant = {
      id: "grant",
      tenantId: "tenant",
      storeId: "store",
      identityId: "identity",
      maskedSender: "+234••••5343",
      businessName: "Synthetic business",
      storeName: "Synthetic Store",
      expiresAt: new Date(Date.now() + 60_000),
      idleExpiresAt: new Date(Date.now() + 60_000),
      active: true,
    }
    await view.refresh("connections")
    await answer("connections", [grant])
    expect(view.html()).toContain("Synthetic business")
    await view.click("Disconnect business")
    expect(calls.filter((call) => call.name === "revoke").length).toBe(0)
    const keep = alerts
      .at(-1)
      ?.find((button) => button.text === "Keep connection")
    expect(keep?.onPress).toBeUndefined()
    const disconnect = alerts
      .at(-1)
      ?.find((button) => button.text === "Disconnect")
    if (!disconnect?.onPress)
      throw Error("Missing explicit native disconnect callback")
    await act(async () => {
      disconnect.onPress?.()
      await settle()
    })
    const revoke = await answer("revoke", null, true)
    expect(revoke.input).toEqual({ grantId: "grant" })
    expect(view.html()).toContain("Could not disconnect")
    await view.click("Disconnect business")
    await act(async () => {
      alerts
        .at(-1)
        ?.find((button) => button.text === "Disconnect")
        ?.onPress?.()
      await settle()
    })
    await answer("revoke", { revoked: true })
    await answer("connections", [])
    expect(view.html()).toContain("Business disconnected")
    expect(view.html()).not.toContain("+234••••5343")
    expect(calls.filter((call) => call.name === "availability").length).toBe(
      availabilityCalls,
    )

    session = {
      ...session,
      profile: { ...session.profile, businessId: "tenant", storeId: "store" },
    }
    generation++
    await view.render()
    await answer("availability", { enabled: true })
    await view.click("Connect this business")
    await answer("create", link)
    await answer("status", status("awaiting_confirmation", 5))
    const confirmations = calls.filter((call) => call.name === "confirm").length
    await act(async () => {
      onlineManager.setOnline(false)
      await settle()
    })
    await view.refresh("status")
    expect(view.disabled("Confirm my number")).toBe(true)
    await act(async () => {
      handlers.get("Confirm my number")?.()
      await settle()
    })
    expect(calls.filter((call) => call.name === "confirm").length).toBe(
      confirmations,
    )
    await act(async () => {
      onlineManager.setOnline(true)
      await settle()
    })
    await answer("status", status("awaiting_confirmation", 6))
    expect(view.disabled("Confirm my number")).toBe(false)
    offline = true
    await view.render()
    expect(view.html()).toContain("Return online")
    expect(view.html()).not.toContain("Confirm my number")
    expect(view.html()).not.toContain("+234••••5343")
    expect(calls.filter((call) => call.name === "confirm").length).toBe(
      confirmations,
    )
    offline = false
    await view.render()
    expect(view.html()).not.toContain("Confirm my number")
    expect(view.html()).not.toContain("Open WhatsApp")
  } finally {
    onlineManager.setOnline(true)
    await view?.close()
    trap.mockRestore()
    expect(externalCalls).toBe(0)
  }
}, 20_000)
