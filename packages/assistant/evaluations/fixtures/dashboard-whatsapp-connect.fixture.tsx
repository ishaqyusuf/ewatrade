import { expect, mock, spyOn, test } from "bun:test"
import { type ReactNode, act } from "react"

// Isolated React DOM/XMLDOM lifecycle journey. Real dashboard owners and real
// TanStack queries/mutations; only tRPC, primitive UI, QR and Next navigation are
// stood in. No browser, server, Session, channel flags, Meta or database exists.
const repo = new URL("../../../../", import.meta.url)
const at = (path: string) =>
  new URL(`apps/dashboard/src/${path}`, repo).pathname
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
  queryKey: () => ["rpc", name],
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
const generation = 0
const trpc = {
  assistantChannels: {
    availability: query("availability"),
    whatsAppLink: query("status"),
    whatsAppConnections: query("connections"),
    createWhatsAppLink: mutation("create"),
    confirmWhatsAppLink: mutation("confirm"),
    revokeWhatsApp: mutation("revoke"),
  },
}
mock.module(at("trpc/client.tsx"), () => ({
  getDataCacheGeneration: () => generation,
  useTRPC: () => trpc,
  useTRPCClient: () => ({
    tenant: { current: { query: rpc("context") } },
    assistantChannels: { whatsAppConnections: { query: rpc("connections") } },
  }),
}))
const handlers = new Map<string, () => unknown>()
mock.module("@ewatrade/ui", () => ({
  buttonVariants: () => "button",
  Button: ({
    children,
    onClick,
    disabled,
  }: { children?: ReactNode; onClick?: () => unknown; disabled?: boolean }) => {
    const label = typeof children === "string" ? children : ""
    if (label && onClick) handlers.set(label, onClick)
    return (
      <button type="button" data-action={label} disabled={disabled}>
        {children}
      </button>
    )
  },
}))
mock.module("next/link", () => ({
  default: ({ children, href }: { children?: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))
mock.module("qrcode", () => ({
  default: { toDataURL: async () => "data:image/png;base64,c3ludGhldGlj" },
}))
const { QueryClient, QueryClientProvider, onlineManager } = await import(
  "@tanstack/react-query"
)
const { ConnectWhatsApp } = await import(
  "../../../../apps/dashboard/src/components/assistant-whatsapp/connect-whatsapp"
)
const { WhatsAppConnections } = await import(
  "../../../../apps/dashboard/src/components/assistant-whatsapp/whatsapp-connections"
)
const scope = {
  actorUserId: "actor",
  tenantId: "tenant",
  storeId: "store",
  businessName: "Synthetic business",
  storeName: "Synthetic Store",
}
const current = {
  actorUserId: "actor",
  tenant: { id: "tenant" },
  activeStore: { id: "store" },
}
const privateUrl =
  "https://wa.me/2348000000000?text=Link%20synthetic-private-challenge"
const link = {
  id: "synthetic-link",
  revision: 1,
  expiresAt: new Date(Date.now() + 60_000),
  url: privateUrl,
}
const status = (state: string, revision: number) => ({
  id: link.id,
  state,
  revision,
  expiresAt: link.expiresAt,
  maskedSender:
    state === "awaiting_confirmation" || state === "confirmed"
      ? "+234••••1234"
      : null,
})
const settle = async () => {
  for (let index = 0; index < 3; index++) {
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
    if (reject) call.reject(new Error("Synthetic RPC unavailable"))
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
  return async (node: ReactNode) => {
    const host = document.createElement("div")
    document.documentElement?.appendChild(host)
    const root = createRoot(host as unknown as HTMLElement)
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>{node}</QueryClientProvider>,
      )
      await settle()
    })
    const button = (label: string) =>
      Array.from(host.getElementsByTagName("button")).find(
        (node) => node.getAttribute("data-action") === label,
      )
    return {
      client,
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

test("actual dashboard connect and personal management owners render and recover through explicit confirmation, expiry and revoke", async () => {
  let networkCalls = 0
  const refuse = () => {
    networkCalls++
    throw Error("Network forbidden in isolated WhatsApp dashboard journey")
  }
  const fetchTrap = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(async () => refuse(), { preconnect: refuse }),
  )
  const views: Array<{ close(): Promise<void> }> = []
  try {
    const mount = await dom()
    const connect = await mount(<ConnectWhatsApp scope={scope} />)
    views.push(connect)
    expect(connect.html()).toContain("Checking availability")
    await answer("context", current)
    await answer("availability", null, true)
    expect(connect.html()).toContain("Could not check availability")
    await connect.click("Try again")
    await answer("context", current)
    await answer("availability", { enabled: true })
    await connect.click("Connect WhatsApp")
    expect(connect.html()).toContain("Creating link")
    await answer("create", null, true)
    expect(connect.html()).toContain("Could not create a link")
    await connect.click("Connect WhatsApp")
    await answer("create", link)
    await answer("status", status("awaiting_whatsapp", 1))
    expect(connect.html()).toContain("Waiting for your message")
    expect(connect.html()).toContain(privateUrl.replaceAll("&", "&amp;"))
    await connect.click("Copy link")
    expect(connect.html()).toContain("Could not copy. Use Open WhatsApp")
    await connect.refresh("status")
    await answer("status", status("awaiting_confirmation", 2))
    expect(connect.html()).toContain("+234••••1234")
    expect(calls.filter((call) => call.name === "confirm")).toHaveLength(0)
    // A real paused refetch may retain successful cached data. It must never
    // leave the confirmation enabled on that stale claimed revision.
    await act(async () => {
      onlineManager.setOnline(false)
      await settle()
    })
    await connect.refresh("status")
    expect(connect.disabled("Confirm this number")).toBe(true)
    expect(connect.html()).toContain("paused while offline")
    await act(async () => {
      handlers.get("Confirm this number")?.()
      await settle()
    })
    expect(calls.filter((call) => call.name === "confirm")).toHaveLength(0)
    await act(async () => {
      onlineManager.setOnline(true)
      await settle()
    })
    await answer("status", status("awaiting_confirmation", 3))
    await answer("context", current)
    await answer("availability", { enabled: true })
    await connect.click("Confirm this number")
    const firstConfirm = await answer("confirm", null, true)
    expect(firstConfirm.input).toEqual({ linkId: link.id, expectedRevision: 3 })
    expect(connect.html()).toContain("The link could not be confirmed")
    await answer("status", status("awaiting_confirmation", 4))
    await connect.click("Confirm this number")
    const approved = await answer("confirm", { id: "grant" })
    expect(approved.input).toEqual({ linkId: link.id, expectedRevision: 4 })
    await answer("status", status("confirmed", 5))
    expect(connect.html()).toContain("Connected")
    expect(connect.html()).not.toContain(privateUrl)
    expect(connect.html()).not.toContain("Copy link")
    await connect.click("Create a fresh connection")
    await answer("create", link)
    await answer("status", status("expired", 6))
    expect(connect.html()).toContain("This link expired or was cancelled")
    expect(connect.html()).not.toContain(privateUrl)
    expect(connect.html()).not.toContain("data:image/png")
    await connect.close()
    views.pop()
    const contextCalls = calls.filter((call) => call.name === "context").length
    const manage = await mount(<WhatsAppConnections actorUserId="actor" />)
    views.push(manage)
    expect(manage.html()).toContain("Loading connections")
    await answer("connections", null, true)
    expect(manage.html()).toContain("Could not load your connections")
    await manage.click("Try again")
    await answer("connections", [])
    expect(manage.html()).toContain(
      "You have no WhatsApp assistant connections",
    )
    const grant = {
      id: "grant",
      tenantId: "tenant",
      storeId: "store",
      identityId: "identity",
      generation: 1,
      identityGeneration: 1,
      selectionGeneration: 1,
      maskedSender: "+234••••1234",
      businessName: scope.businessName,
      storeName: scope.storeName,
      consentedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      idleExpiresAt: new Date(Date.now() + 60_000),
      active: true,
    }
    await manage.refresh("connections")
    await answer("connections", [grant])
    expect(manage.html()).toContain("Connected")
    await manage.refresh("connections")
    await answer("connections", [
      { ...grant, expiresAt: new Date(Date.now() - 1000) },
    ])
    expect(manage.html()).toContain("Inactive or expired")
    await manage.click("Remove business access")
    expect(calls.filter((call) => call.name === "revoke")).toHaveLength(0)
    await manage.click("Keep access")
    expect(manage.html()).not.toContain("Pending assistant work")
    await manage.click("Remove business access")
    await manage.click("Remove access")
    expect(manage.html()).toContain("Removing")
    await answer("revoke", null, true)
    expect(manage.html()).toContain("Could not remove access")
    await manage.click("Remove access")
    const revoked = await answer("revoke", { revoked: true })
    expect(revoked.input).toEqual({ grantId: "grant" })
    await answer("connections", [])
    expect(manage.html()).toContain("WhatsApp access removed for this business")
    expect(manage.html()).not.toContain("+234••••1234")
    expect(calls.filter((call) => call.name === "context")).toHaveLength(
      contextCalls,
    )
  } finally {
    onlineManager.setOnline(true)
    for (const view of views.reverse()) await view.close()
    fetchTrap.mockRestore()
    expect(networkCalls).toBe(0)
  }
}, 20_000)
