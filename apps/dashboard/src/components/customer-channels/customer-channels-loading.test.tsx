import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { DOMImplementation } from "@xmldom/xmldom"
import { type ComponentProps, act } from "react"

// Real workspace/sections and useQuery observers; only RPC and heavy presentation
// are inert. The existing mounted-fixture DOM adapter sends no external requests.
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
Object.assign(globalThis, { window, document, IS_REACT_ACT_ENVIRONMENT: true })
Object.assign(document, {
  defaultView: window,
  addEventListener() {},
  removeEventListener() {},
})
const createElement = document.createElement.bind(document)
document.createElement = (name: string) =>
  Object.assign(createElement(name), {
    style: {},
    addEventListener() {},
    removeEventListener() {},
  })
const createText = document.createTextNode.bind(document)
document.createTextNode = (value: string) => {
  const node = createText(value)
  Object.defineProperty(node, "nodeValue", {
    get: () => node.data,
    set: (next: string) => {
      node.data = next
    },
  })
  return node
}
const { QueryClient, QueryClientProvider } = await import(
  "@tanstack/react-query"
)
const { createRoot } = await import("react-dom/client")
const actions = new Map<string, () => unknown>()
const urlChanges: unknown[] = []
mock.module("@ewatrade/ui", () => ({
  Button: ({ children, onClick, ...props }: ComponentProps<"button">) => {
    if (onClick)
      actions.set(props["aria-label"] ?? String(children), () =>
        onClick({} as never),
      )
    return (
      <button
        type="button"
        aria-label={props["aria-label"]}
        disabled={props.disabled}
      >
        {children}
      </button>
    )
  },
}))
mock.module("@/utils", () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
}))
mock.module("@hugeicons/react", () => ({ HugeiconsIcon: () => null }))
mock.module("./connections-list", () => ({
  ConnectionsList: () => (
    <section>
      <h2>WhatsApp numbers</h2>
    </section>
  ),
}))
mock.module("./channel-recommendation-note", () => ({
  ChannelRecommendationNote: () => null,
}))
mock.module("./conversation-mode-choice", () => ({
  ConversationModeChoice: ({ storeId }: { storeId: string }) => (
    <div>Mode controls {storeId}</div>
  ),
}))
mock.module("./channels-header", () => ({
  ChannelsHeader: ({
    canManage,
    selectedStoreId,
  }: { canManage: boolean; selectedStoreId: string }) => (
    <header>
      <h1>Customer channels</h1>
      <span>{selectedStoreId}</span>
      <button type="button" disabled={!canManage}>
        Connect WhatsApp
      </button>
    </header>
  ),
}))
let selectedStore = "store-a"
mock.module("@/hooks/use-service-commerce-params", () => ({
  useServiceCommerceParams: () => ({
    storeId: selectedStore,
    setParams: (values: unknown) => {
      urlChanges.push(values)
    },
  }),
}))
const workspace = "channelWorkspace"
const approvals = "pendingQuoteApprovals"
const availability = "storeConversationAvailabilitySettings"
const release = "quoteReleaseSettings"
const mode = "storeConversationChannelModeSettings"
const settings = [availability, release, mode]
const labels = [
  [availability, "chat hours"],
  [release, "quote approval settings"],
  [mode, "customer contact settings"],
  [approvals, "quotes waiting for approval"],
] as const
const reads: { path: string; storeId: string }[] = []
const behavior = new Map<
  string,
  (storeId: string) => unknown | Promise<unknown>
>()
const defaults: Record<string, unknown> = {
  [workspace]: {
    access: { canManage: true },
    connections: [],
    team: [{ status: "active" }],
    entryPoint: null,
    recommendation: null,
  },
  [approvals]: [],
  [availability]: { manualPaused: true, weeklyHours: [] },
  [release]: {
    policy: {
      mode: "approval_required",
      selectedApproverMembershipIds: ["manager"],
    },
  },
  [mode]: { desiredMode: "both", effectiveMode: "both", revision: 1 },
}
mock.module("@/trpc/client", () => ({
  useTRPC: () => ({
    serviceCommerce: Object.fromEntries(
      [workspace, approvals, ...settings].map((path) => [
        path,
        {
          queryOptions: (
            { storeId }: { storeId: string },
            options?: object,
          ) => ({
            ...options,
            queryKey: [path, storeId],
            queryFn: async () => {
              reads.push({ path, storeId })
              return behavior.has(path)
                ? behavior.get(path)?.(storeId)
                : defaults[path]
            },
          }),
        },
      ]),
    ),
  }),
}))
const { CustomerChannelsWorkspace } = await import(
  "./customer-channels-workspace"
)
const cleanups: (() => Promise<void>)[] = []
const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 10))
beforeEach(() => {
  behavior.clear()
  reads.length = 0
  actions.clear()
  urlChanges.length = 0
  selectedStore = "store-a"
})
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.()
})
async function mount(
  prepare?: (client: InstanceType<typeof QueryClient>) => void,
) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
      },
    },
  })
  prepare?.(client)
  const host = document.createElement("div")
  document.documentElement?.appendChild(host)
  const root = createRoot(host as unknown as HTMLElement)
  const render = async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <CustomerChannelsWorkspace
            initialStoreId="store-a"
            stores={[
              { id: "store-a", name: "A" },
              { id: "store-b", name: "B" },
            ]}
          />
        </QueryClientProvider>,
      )
      await wait()
    })
    await act(wait)
  }
  cleanups.push(async () => {
    await act(async () => root.unmount())
    client.clear()
    document.documentElement?.removeChild(host)
  })
  await render()
  const flush = async () => {
    await act(wait)
    await act(wait)
  }
  const click = async (label: string) => {
    const action = actions.get(label)
    expect(action).toBeDefined()
    await act(async () => {
      action?.()
      await wait()
    })
    await flush()
  }
  return { client, render, flush, click, text: () => host.textContent ?? "" }
}
const count = (path: string) =>
  reads.filter((read) => read.path === path).length

for (const [path, label] of labels) {
  test(`pending ${label} does not hide ready workspace content or invent an empty result`, async () => {
    const gate = Promise.withResolvers<unknown>()
    behavior.set(path, () => gate.promise)
    const ui = await mount()
    try {
      await ui.flush()
      expect(ui.text()).toContain("WhatsApp numbers")
      expect(ui.text()).toContain("Team members replying")
      expect(ui.text()).toContain(`Loading ${label}`)
      if (path === approvals)
        expect(ui.text()).not.toContain("No quotes waiting for approval.")
      expect(reads).toHaveLength(5)
      expect(reads.every((read) => read.storeId === "store-a")).toBe(true)
    } finally {
      await act(async () => {
        gate.resolve(defaults[path])
        await wait()
      })
    }
    await ui.flush()
    expect(ui.text()).not.toContain(`Loading ${label}`)
  })

  test(`failed ${label} retries only its owner while ready content stays mounted`, async () => {
    behavior.set(path, () => {
      throw new Error("inert read failure")
    })
    const ui = await mount()
    await ui.flush()
    expect(ui.text()).toContain("WhatsApp numbers")
    expect(ui.text()).toContain("Team members replying")
    expect(ui.text()).toContain(`Couldn't load ${label}.`)
    if (path === approvals)
      expect(ui.text()).not.toContain("No quotes waiting for approval.")
    const prior = Object.fromEntries(
      [workspace, approvals, ...settings].map((key) => [key, count(key)]),
    )
    behavior.delete(path)
    await ui.click(`Retry ${label}`)
    expect(ui.text()).not.toContain(`Couldn't load ${label}.`)
    for (const key of [workspace, approvals, ...settings])
      expect(count(key)).toBe(prior[key] + Number(key === path))
  })
}

test("a nonmanager neither reads nor renders retained manager settings", async () => {
  behavior.set(workspace, () => ({
    ...(defaults[workspace] as object),
    access: { canManage: false },
  }))
  const ui = await mount((client) => {
    for (const path of settings)
      client.setQueryData([path, "store-a"], defaults[path])
  })
  await ui.flush()
  for (const path of settings)
    expect(ui.client.getQueryData([path, "store-a"])).toEqual(defaults[path])
  expect(ui.text()).toContain("WhatsApp numbers")
  expect(ui.text()).not.toContain("Mode controls")
  expect(ui.text()).not.toContain("Chat hours")
  expect(ui.text()).not.toContain("Quotes need approval")
  for (const path of settings) expect(count(path)).toBe(0)
})

test("a workspace refusal hides current controls and its retry does not refetch optional owners", async () => {
  const ui = await mount()
  await ui.flush()
  expect(ui.text()).toContain("Mode controls store-a")
  behavior.set(workspace, () => {
    throw new Error("inert workspace refusal")
  })
  await act(async () => {
    await ui.client.refetchQueries({ queryKey: [workspace, "store-a"] })
    await wait()
  })
  await ui.flush()
  expect(ui.text()).not.toContain("Mode controls")
  expect(ui.text()).not.toContain("WhatsApp numbers")
  const prior = reads.length
  behavior.set(workspace, () => ({
    ...(defaults[workspace] as object),
    access: { canManage: false },
  }))
  await ui.click("Try again")
  expect(reads.slice(prior)).toEqual([{ path: workspace, storeId: "store-a" }])
  expect(ui.text()).toContain("WhatsApp numbers")
  expect(ui.text()).not.toContain("Mode controls")
})

test("a Store change refuses old content while new workspace access is pending", async () => {
  const gate = Promise.withResolvers<unknown>()
  const ui = await mount()
  await ui.flush()
  expect(ui.text()).toContain("Mode controls store-a")
  behavior.set(workspace, (storeId) =>
    storeId === "store-b" ? gate.promise : defaults[workspace],
  )
  selectedStore = "store-b"
  await ui.render()
  try {
    expect(ui.text()).not.toContain("Mode controls store-a")
    expect(
      reads
        .filter((read) => read.storeId === "store-b")
        .map((read) => read.path)
        .sort(),
    ).toEqual([workspace, approvals].sort())
  } finally {
    await act(async () => {
      gate.resolve({
        ...(defaults[workspace] as object),
        access: { canManage: false },
      })
      await wait()
    })
  }
  await ui.flush()
  expect(ui.text()).toContain("store-b")
  expect(ui.text()).not.toContain("Mode controls")
  expect(reads.filter((read) => read.storeId === "store-b")).toHaveLength(2)
})

for (const [path, label] of labels) {
  test(`fresh failure for ${label} hides its retained payload without hiding siblings`, async () => {
    const ui = await mount()
    await ui.flush()
    behavior.set(path, () => {
      throw new Error("inert fresh refusal")
    })
    await act(async () => {
      await ui.client.refetchQueries({ queryKey: [path, "store-a"] })
      await wait()
    })
    await ui.flush()
    expect(ui.client.getQueryData([path, "store-a"])).toEqual(defaults[path])
    expect(ui.text()).toContain("WhatsApp numbers")
    expect(ui.text()).toContain(`Couldn't load ${label}.`)
    const old = {
      [availability]: "Paused",
      [release]: "On · 1 approver",
      [mode]: "Mode controls",
      [approvals]: "No quotes waiting for approval.",
    }
    expect(ui.text()).not.toContain(old[path])
  })
}

test("an admitted approval retains its amount/decision labels and exact review URL", async () => {
  behavior.set(approvals, () => [
    {
      id: "approval-a",
      quoteId: "quote-a",
      version: 2,
      sourceKind: "service",
      totalMinor: 12500,
      currencyCode: "NGN",
      canApprove: true,
      canReject: false,
    },
  ])
  const ui = await mount()
  await ui.flush()
  expect(ui.text()).toContain("Service request · ₦125.00")
  expect(ui.text()).toContain("Quote 2. You can approve this quote.")
  await ui.click("Review quote")
  expect(urlChanges).toEqual([
    {
      quoteApprovalId: "approval-a",
      quoteId: "quote-a",
      serviceCommerceSheet: "quote_approval",
      storeId: "store-a",
    },
  ])
})
