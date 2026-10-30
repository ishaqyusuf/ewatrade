import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { DOMImplementation } from "@xmldom/xmldom"
import dynamic from "next/dist/shared/lib/app-dynamic"
import * as nuqs from "nuqs"
import { createLoader } from "nuqs/server"
import {
  Component,
  type ComponentProps,
  type ReactNode,
  Suspense,
  act,
} from "react"

// Actual optional-code call sites under the installed Next16 App loader, which
// keeps one React.lazy per declaration. A lost chunk is reproduced inside each
// literal loader. Bodies, frames, transport and observability stay inert.
const document = new DOMImplementation().createDocument(
  "http://www.w3.org/1999/xhtml",
  "html",
  null,
)
const window = {
  document,
  HTMLIFrameElement: class {},
  HTMLElement: document.documentElement.constructor,
  addEventListener() {},
  removeEventListener() {},
}
Object.assign(globalThis, {
  window,
  document,
  HTMLElement: window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
})
try {
  Object.defineProperty(globalThis.navigator, "onLine", {
    configurable: true,
    value: true,
  })
} catch {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { onLine: true },
  })
}
if (typeof globalThis.requestAnimationFrame !== "function")
  Object.assign(globalThis, {
    requestAnimationFrame: (callback: (time: number) => void) =>
      setTimeout(() => callback(Date.now()), 0),
  })
// The Quick Assistant frame owns a document Escape listener while open.
const keyListeners = new Set<(event: KeyboardEvent) => void>()
Object.assign(document, {
  defaultView: window,
  activeElement: null,
  addEventListener(type: string, listener: (event: KeyboardEvent) => void) {
    if (type === "keydown") keyListeners.add(listener)
  },
  removeEventListener(type: string, listener: (event: KeyboardEvent) => void) {
    if (type === "keydown") keyListeners.delete(listener)
  },
  // No nested overlay is open in these inert fixtures.
  querySelector: () => null,
})
const createElement = document.createElement.bind(document)
document.createElement = (name: string) => {
  const element = Object.assign(createElement(name), {
    style: {},
    focus() {
      Object.assign(document, { activeElement: element })
    },
    contains(node: Node | null) {
      let current = node
      while (current) {
        if (current === element) return true
        current = current.parentNode
      }
      return false
    },
    addEventListener() {},
    removeEventListener() {},
  })
  Object.defineProperty(element, "isConnected", {
    get: () => Boolean(element.parentNode),
  })
  return element
}
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

const operations: string[] = []
mock.module("@/observability/sentry", () => ({
  captureDashboardError: (_error: unknown, operation: string) => {
    operations.push(operation)
  },
}))
let params = new URLSearchParams()
mock.module("nuqs", () => ({
  ...nuqs,
  useQueryStates: (parsers: Parameters<typeof createLoader>[0]) => [
    createLoader(parsers)(params),
    async (values: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(values)) {
        if (value === undefined) continue
        if (value === null) params.delete(key)
        else params.set(key, String(value))
      }
    },
  ],
}))
mock.module("next/dynamic", () => ({ default: dynamic }))

type OpenChange = (open: boolean, details: { cancel: () => void }) => void
type RootProps = {
  open: boolean
  onOpenChange: OpenChange
  children?: ReactNode
}
let changeOpen: OpenChange | undefined
function Sheet({ open, onOpenChange, children }: RootProps) {
  changeOpen = onOpenChange
  return open ? children : null
}
function Dialog(props: RootProps) {
  return Sheet(props)
}
function Slot({ children }: { children?: ReactNode }) {
  return <div>{children}</div>
}
function Pass({ children }: { children?: ReactNode }) {
  return children
}
mock.module("@ewatrade/ui", () => ({
  Button: (props: ComponentProps<"button">) => <button {...props} />,
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
  Dialog,
  DialogContent: Slot,
  DialogDescription: Slot,
  DialogTitle: Slot,
  Sheet,
}))
mock.module("@hugeicons/react", () => ({ HugeiconsIcon: () => null }))
mock.module("@hugeicons/core-free-icons", () => ({
  BubbleChatIcon: {},
  MinusSignIcon: {},
  SparklesIcon: {},
  TaskDone01Icon: {},
}))
mock.module("next/navigation", () => ({ usePathname: () => "/" }))
mock.module("@/components/page-fab/fab-slot", () => ({
  usePageFabSlotMode: () => null,
  useQuickAssistantRequests: () => undefined,
}))
const chatChanges: (string | null)[] = []
mock.module("@/hooks/use-quick-chat-param", () => ({
  useQuickChatParam: () => [
    null,
    async (value: string | null) => {
      chatChanges.push(value)
    },
  ],
}))
function Frame({
  kind,
  title,
  children,
}: { kind: string; title: string; children?: ReactNode }) {
  return (
    <section data-frame={kind}>
      <h2>{title}</h2>
      {children}
    </section>
  )
}
mock.module("@/components/sheets/sheet-frame", () => ({
  SheetBodyLoading: () => <output aria-live="polite">Loading…</output>,
  SheetFrame: (props: { title: string; children?: ReactNode }) => (
    <Frame kind="sheet" {...props} />
  ),
}))
mock.module("@/components/modals/finance-dialog-frame", () => ({
  FinanceDialogFrame: (props: { title: string; children?: ReactNode }) => (
    <Frame kind="dialog" {...props} />
  ),
}))
mock.module("@/components/finance/form-context", () => ({
  FinanceFormProvider: Pass,
}))
mock.module("@/components/catalog-item/form-context", () => ({
  CatalogItemFormProvider: Pass,
}))
mock.module("@/components/catalog-item/catalog-appearance", () => ({
  CatalogAppearance: Pass,
  useCatalogThemeClass: () => "catalog-theme",
}))
mock.module("@/components/catalog-item/catalog-item-skeleton", () => ({
  CatalogItemSkeleton: () => <output>item-skeleton</output>,
}))

const commands: string[] = []
mock.module("@/trpc/client", () => ({
  getDataCacheGeneration: () => 0,
  useTRPC: () => ({
    catalog: { getItem: { queryOptions: () => ({ kind: "item" }) } },
    orders: {
      prepareReceipts: {
        queryOptions: (_input: unknown, options: object) => ({
          kind: "receipt",
          ...options,
        }),
      },
    },
    setupAssistant: {
      state: {
        queryOptions: () => ({ kind: "setup" }),
        pathKey: () => ["setup"],
      },
      start: { mutationOptions: () => ({ name: "start" }) },
      begin: { mutationOptions: () => ({ name: "begin" }) },
      skip: { mutationOptions: () => ({ name: "skip" }) },
      finish: { mutationOptions: () => ({ name: "finish" }) },
      visit: { mutationOptions: () => ({ name: "visit" }) },
    },
  }),
}))
const setupState = {
  data: {
    enabled: true,
    conversation: { id: "setup-inert", status: "ACTIVE" },
    messages: [],
    draft: { entities: [] },
    attachments: [],
    currencyCode: "NGN",
    mediaEnabled: false,
  },
  dataUpdatedAt: Date.now(),
  isError: false,
  isFetchedAfterMount: true,
  isFetching: false,
  isPaused: false,
  isPending: false,
  isSuccess: true,
  refetch: async () => undefined,
}
const receiptState = {
  data: {
    orderNumbers: ["ORD-INERT"],
    pdfBase64: "inert",
    settingsSource: "store",
  },
  isError: false,
  isFetching: false,
  refetch: async () => undefined,
}
const mutationOwners = new Map<
  string,
  { isPending: boolean; mutate: () => void }
>()
mock.module("@tanstack/react-query", () => ({
  useQuery: (options: { kind?: string }) =>
    options.kind === "setup"
      ? setupState
      : options.kind === "receipt"
        ? receiptState
        : { data: undefined, isPending: true },
  useMutation: ({ name }: { name: string }) => {
    const owner = mutationOwners.get(name) ?? {
      isPending: false,
      mutate: () => {
        commands.push(name)
      },
    }
    mutationOwners.set(name, owner)
    return owner
  },
  useQueryClient: () => ({ invalidateQueries: async () => undefined }),
}))
mock.module("@/hooks/use-receipt-download", () => ({
  useReceiptDownload: () => ({
    download: async () => undefined,
    error: null,
    message: "",
    pending: false,
    url: "blob:inert-receipt",
  }),
}))

const failures = new Map<string, number>()
const imports: string[] = []
const mounted = new Map<string, object>()
function lostChunk(name: string) {
  function Body(props: object) {
    mounted.set(name, props)
    return <output>{name}</output>
  }
  // `.then((module) => module.X)` adopts this thenable inside the literal
  // loader, so an armed failure rejects exactly where a lost chunk would.
  return {
    // biome-ignore lint/suspicious/noThenProperty: reproduces a lost chunk inside the call site's own loader.
    then(
      resolve: (value: typeof Body) => void,
      reject: (error: Error) => void,
    ) {
      imports.push(name)
      const remaining = failures.get(name) ?? 0
      failures.set(name, Math.max(remaining - 1, 0))
      if (remaining > 0) reject(new Error("inert chunk failure"))
      else resolve(Body)
    },
  }
}
mock.module("@/components/finance/finance-sheet-content", () => ({
  FinanceSheetContent: lostChunk("finance"),
}))
mock.module("@/components/catalog-item/catalog-item-content", () => ({
  CatalogItemContent: lostChunk("item"),
}))
mock.module("@/components/setup-assistant/setup-chat", () => ({
  SetupChat: lostChunk("chat"),
}))
mock.module("@/components/setup-assistant/setup-draft-panel", () => ({
  SetupDraftPanel: lostChunk("list"),
}))
mock.module("@/components/receipts/pdf-preview", () => ({
  default: lostChunk("preview"),
}))
mock.module("@/components/sheets/order-create-sheet", () => ({
  OrderCreateSheet: lostChunk("order"),
}))
mock.module("@/components/sheets/inventory-operation-sheet", () => ({
  InventoryOperationSheet: lostChunk("stock"),
}))
mock.module("@/components/quick-assistant/quick-assistant-panel", () => ({
  QuickAssistantPanel: lostChunk("quick"),
}))

const { createRoot } = await import("react-dom/client")
const { FinanceSheet } = await import("./finance-sheet")
const { CatalogItemSheet } = await import(
  "@/components/catalog-item/catalog-item-sheet"
)
const { SetupAssistant } = await import(
  "@/components/setup-assistant/setup-assistant"
)
const { ReceiptContent } = await import("@/components/receipts/receipt-content")
const { OverviewSheets } = await import(
  "@/components/dashboard/overview-sheets"
)
const { QuickAssistant } = await import(
  "@/components/quick-assistant/quick-assistant"
)
const container = document.createElement("div")
document.documentElement.appendChild(container)
const opener = document.createElement("button")
document.documentElement.appendChild(opener)
// Portal target for the actual Quick Assistant frame.
const body = document.createElement("body")
document.documentElement.appendChild(body)
Object.defineProperty(document, "body", { configurable: true, value: body })
let root = createRoot(container as unknown as HTMLElement)
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <output>page-error</output> : this.props.children
  }
}
async function render(content: ReactNode) {
  await act(async () => {
    root.render(
      <Boundary>
        <Suspense fallback={<output>opening</output>}>{content}</Suspense>
      </Boundary>,
    )
    await new Promise((resolve) => setTimeout(resolve, 8))
  })
}
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 8))
  })
}
function text() {
  return container.textContent ?? ""
}
function frame() {
  return container
    .getElementsByTagName("section")[0]
    ?.getAttribute("data-frame")
}
function retryCount() {
  return text().split("Try again").length - 1
}
function button(label: string) {
  const buttons = document.documentElement.getElementsByTagName("button")
  for (let index = 0; index < buttons.length; index++) {
    const candidate = buttons[index]
    if (
      candidate?.textContent === label ||
      candidate?.getAttribute("aria-label") === label
    )
      return candidate
  }
  throw new Error(`Missing ${label} button`)
}
function press(label: string) {
  const target = button(label)
  const key = Object.keys(target).find((name) =>
    name.startsWith("__reactProps$"),
  )
  if (!key) throw new Error("Missing React button event owner")
  const props = (target as unknown as Record<string, { onClick: () => void }>)[
    key
  ]
  if (!props) throw new Error(`Missing ${label} button props`)
  Object.assign(document, { activeElement: target })
  props.onClick()
}
function retry() {
  press("Try again")
}
function dialog() {
  return body.getElementsByTagName("dialog")[0]
}
function focused() {
  return (document as unknown as { activeElement: unknown }).activeElement
}
async function pressEscape() {
  await act(async () => {
    for (const listener of [...keyListeners])
      listener({
        key: "Escape",
        defaultPrevented: false,
        preventDefault() {},
      } as unknown as KeyboardEvent)
    await new Promise((resolve) => setTimeout(resolve, 8))
  })
}
async function requestClose() {
  await act(async () => {
    changeOpen?.(false, { cancel() {} })
    await new Promise((resolve) => setTimeout(resolve, 8))
  })
}
beforeEach(() => {
  params = new URLSearchParams()
  failures.clear()
  imports.length = 0
  mounted.clear()
  operations.length = 0
  commands.length = 0
  chatChanges.length = 0
  changeOpen = undefined
  Object.assign(document, { activeElement: opener })
})
afterEach(async () => {
  await act(async () => root.unmount())
  root = createRoot(container as unknown as HTMLElement)
})

test("Finance content code failure stays in its selected frame, closes, and retries with current props", async () => {
  // A fresh element per render: mocked URL state has no React subscription.
  const sheet = () => (
    <FinanceSheet actorUserId="actor" storeId="store" tenantId="tenant" />
  )
  failures.set("finance", 1)
  params = new URLSearchParams({ financeSheet: "bank-import" })
  await render(sheet())
  expect(frame()).toBe("dialog")
  expect(text()).toContain("Upload statement")
  expect(text()).toContain("Couldn’t open this panel.")
  expect(text()).not.toContain("page-error")
  expect(mounted.has("finance")).toBe(false)

  params = new URLSearchParams({ financeSheet: "expense" })
  await render(sheet())
  expect(frame()).toBe("sheet")
  expect(text()).toContain("Add expense")
  expect(retryCount()).toBe(1)

  await requestClose()
  expect(params.has("financeSheet")).toBe(false)
  await render(sheet())
  expect(text()).toBe("")

  params = new URLSearchParams({ financeSheet: "expense" })
  await render(sheet())
  expect(retryCount()).toBe(1)
  await act(async () => retry())
  await settle()
  expect(text()).toBe("finance")
  expect(mounted.get("finance")).toMatchObject({
    storeId: "store",
    closeError: null,
  })
  expect(imports).toEqual(["finance", "finance"])
  expect(operations).toEqual(["sheet.code.load"])
})

test("route-owned Catalog item content recovers inside its own frame without an activation owner", async () => {
  // A fresh element per render: mocked URL state has no React subscription.
  const sheet = () => (
    <CatalogItemSheet
      currencyCode="NGN"
      storeId="store"
      onCreated={() => undefined}
    />
  )
  failures.set("item", 1)
  params = new URLSearchParams({ catalogItem: "create" })
  await render(sheet())
  expect(frame()).toBe("sheet")
  expect(text()).toContain("Item")
  expect(text()).toContain("Couldn’t open this panel.")
  expect(text()).not.toContain("item-skeleton")
  expect(text()).not.toContain("page-error")

  await requestClose()
  expect(params.has("catalogItem")).toBe(false)
  await render(sheet())
  expect(text()).toBe("")

  params = new URLSearchParams({ catalogItem: "create" })
  await render(sheet())
  await act(async () => retry())
  await settle()
  expect(text()).toBe("item")
  expect(mounted.get("item")).toMatchObject({
    storeId: "store",
    currencyCode: "NGN",
    closeError: null,
  })
  expect(imports).toEqual(["item", "item"])
  expect(operations).toEqual(["sheet.code.load"])
})

test("Setup chat and list code failures stay inside the open Setup dialog without repeating commands", async () => {
  failures.set("chat", 1)
  failures.set("list", 1)
  params = new URLSearchParams({ setup: "assistant" })
  const setup = (
    <SetupAssistant
      hasCatalogItems
      offerSetup={false}
      fallback={<output>launchpad</output>}
    />
  )
  await render(setup)
  expect(text()).toContain("launchpad")
  expect(text()).toContain("Set up your business")
  expect(text()).toContain("Skip for now")
  expect(retryCount()).toBe(2)
  expect(text()).not.toContain("page-error")
  expect(commands).toEqual(["visit"])

  await act(async () => retry())
  await settle()
  expect(mounted.get("chat")).toMatchObject({
    conversationId: "setup-inert",
    status: "ACTIVE",
    initialMessages: [],
    mediaEnabled: false,
  })
  expect(retryCount()).toBe(1)
  await act(async () => retry())
  await settle()
  expect(mounted.get("list")).toMatchObject({
    conversationId: "setup-inert",
    entities: [],
    currencyCode: "NGN",
  })
  expect(retryCount()).toBe(0)
  expect(text()).toContain("Set up your business")
  expect(commands).toEqual(["visit"])
  expect(operations).toEqual(["sheet.code.load", "sheet.code.load"])
})

test("receipt PDF preview code failure keeps downloads and retries only the preview", async () => {
  failures.set("preview", 1)
  await render(<ReceiptContent storeId="store" orderIds={["order-inert"]} />)
  expect(text()).toContain("ORD-INERT")
  expect(text()).toContain("Download PDF")
  expect(text()).toContain("Couldn’t open this panel.")
  expect(text()).not.toContain("page-error")

  await act(async () => retry())
  await settle()
  expect(mounted.get("preview")).toEqual({ url: "blob:inert-receipt" })
  expect(text()).toContain("Download PDF")
  expect(retryCount()).toBe(0)
  expect(imports).toEqual(["preview", "preview"])
  expect(operations).toEqual(["sheet.code.load"])
})

test("Overview order and stock controller code failures stay local, keep URL/access lifetime and retry with current props", async () => {
  const store = { id: "store", name: "Inert Store", currencyCode: "NGN" }
  // A fresh element per render: mocked URL state has no React subscription.
  const overview = (access = true) => (
    <OverviewSheets
      store={store}
      orders={access}
      inventory={access}
      customerDirectory={false}
    />
  )
  failures.set("order", 1)
  failures.set("stock", 1)
  params = new URLSearchParams({ orderSheet: "create" })
  await render(overview())
  expect(text()).toContain("Couldn’t open this panel.")
  expect(text()).not.toContain("page-error")
  expect(imports).toEqual(["order"])

  params = new URLSearchParams()
  await render(overview())
  expect(text()).toBe("")

  params = new URLSearchParams({ orderSheet: "create" })
  await render(overview(false))
  expect(text()).toBe("")

  await render(overview())
  expect(retryCount()).toBe(1)
  await act(async () => retry())
  await settle()
  expect(text()).toBe("order")
  expect(mounted.get("order")).toEqual({ store, customerDirectory: false })

  // Revoked access removes even recovered code; restored access reuses code only.
  mounted.clear()
  await render(overview(false))
  expect(text()).toBe("")
  expect(mounted.size).toBe(0)
  await render(overview())
  expect(text()).toBe("order")
  expect(mounted.get("order")).toEqual({ store, customerDirectory: false })

  params = new URLSearchParams({ inventoryOperation: "receipt" })
  await render(overview())
  expect(retryCount()).toBe(1)
  expect(text()).not.toContain("page-error")
  await act(async () => retry())
  await settle()
  expect(text()).toBe("stock")
  expect(mounted.get("stock")).toEqual({ store })
  expect(imports).toEqual(["order", "order", "stock", "stock"])
  expect(operations).toEqual(["sheet.code.load", "sheet.code.load"])
})

test("Quick Assistant panel code failure recovers in its own dialog, minimizes by Escape and control, and retries with current props", async () => {
  failures.set("quick", 1)
  await render(<QuickAssistant />)
  expect(imports).toEqual([])
  expect(dialog()).toBeUndefined()
  const trigger = button("Open quick assistant")

  await act(async () => press("Open quick assistant"))
  await settle()
  const frame = dialog()
  expect(frame?.getAttribute("id")).toBe("quick-assistant-panel")
  expect(frame?.getAttribute("aria-label")).toBe("Quick assistant")
  expect(frame?.hasAttribute("hidden")).toBe(false)
  expect(trigger.getAttribute("aria-controls")).toBe("quick-assistant-panel")
  expect(focused()).toBe(frame)
  expect(body.textContent).toContain("Couldn’t open this panel.")
  expect(text()).not.toContain("page-error")
  expect(keyListeners.size).toBe(1)
  expect(imports).toEqual(["quick"])

  await pressEscape()
  expect(dialog()).toBe(frame)
  expect(frame?.hasAttribute("hidden")).toBe(true)
  expect(keyListeners.size).toBe(0)
  expect(chatChanges).toEqual([null])
  expect(focused()).toBe(trigger)

  await act(async () => press("Open quick assistant"))
  await settle()
  expect(dialog()).toBe(frame)
  expect(frame?.hasAttribute("hidden")).toBe(false)
  expect(focused()).toBe(frame)
  await act(async () => press("Minimize quick assistant"))
  await settle()
  expect(frame?.hasAttribute("hidden")).toBe(true)
  expect(keyListeners.size).toBe(0)
  expect(chatChanges).toEqual([null, null])
  expect(focused()).toBe(trigger)

  await act(async () => press("Open quick assistant"))
  await settle()
  await act(async () => retry())
  await settle()
  expect(dialog()).toBeUndefined()
  expect(keyListeners.size).toBe(0)
  expect(mounted.get("quick")).toMatchObject({ opened: true })

  await act(async () => press("Open quick assistant"))
  await settle()
  expect(mounted.get("quick")).toMatchObject({ opened: false })
  expect(chatChanges).toEqual([null, null, null])
  expect(imports).toEqual(["quick", "quick"])
  expect(operations).toEqual(["sheet.code.load"])
})
