import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { DOMImplementation } from "@xmldom/xmldom"
import * as nuqs from "nuqs"
import { createLoader } from "nuqs/server"
import type { ComponentType, ReactNode } from "react"
import { Suspense, act, lazy, useEffect, useState } from "react"
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
const { createRoot } = await import("react-dom/client")

let params = new URLSearchParams()
let failDismissal = false
let changeOpen: ((open: boolean) => void) | undefined
let storeRows: { id: string; name: string; currencyCode: string }[] | undefined
let storeError = false
const reads: { input: unknown; options: object }[] = []
mock.module("nuqs", () => ({
  ...nuqs,
  useQueryStates: (parsers: Parameters<typeof createLoader>[0]) => [
    createLoader(parsers)(params),
    async (values: Record<string, unknown>) => {
      if (failDismissal) throw new Error("inert URL failure")
      for (const [key, value] of Object.entries(values)) {
        if (value === null) params.delete(key)
        else params.set(key, String(value))
      }
    },
  ],
}))
mock.module("@/hooks/use-assistant-draft-job-handoff", () => ({
  useAssistantDraftJobOverlay: () => null,
  releaseAssistantDraftJobOverlay: () => false,
}))
mock.module("@ewatrade/ui", () => ({
  Sheet: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean
    onOpenChange: (value: boolean) => void
    children: ReactNode
  }) => {
    changeOpen = onOpenChange
    return open ? children : null
  },
}))
function Loading() {
  return <output aria-live="polite">Loading…</output>
}
mock.module("@/components/sheets/sheet-frame", () => ({
  SheetBodyLoading: Loading,
  SheetFrame: ({
    title,
    children,
    closeError,
  }: { title: string; children: ReactNode; closeError?: string }) => (
    <section>
      <h2>{title}</h2>
      {closeError ? <p>{closeError}</p> : null}
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </section>
  ),
}))
mock.module("@/trpc/client", () => ({
  useTRPC: () => ({
    tenant: {
      stores: {
        queryOptions: (input: unknown, options: object) => {
          reads.push({ input, options })
          return { kind: "stores", ...options }
        },
      },
    },
    services: { getJob: { queryOptions: () => ({ kind: "title" }) } },
    retailOps: { staffStoreAccessReview: { queryKey: () => ["staff-review"] } },
  }),
  useTRPCClient: () => ({
    tenant: {
      current: {
        query: () => {
          throw new Error("No network in inert delivery fixture")
        },
      },
    },
  }),
}))
mock.module("@tanstack/react-query", () => ({
  useQuery: (options: { kind?: string }) =>
    options.kind === "stores"
      ? { data: storeRows, isError: storeError }
      : { data: undefined },
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
}))
mock.module("next/dynamic", () => ({
  default: (
    load: () => Promise<ComponentType>,
    options: { loading: ComponentType },
  ) => {
    const Component = lazy(async () => {
      const loaded = await load()
      if (loaded.displayName === heldName)
        await new Promise<void>((resolve) => {
          release = resolve
        })
      return { default: loaded }
    })
    return function Deferred(props: object) {
      return (
        <Suspense fallback={<options.loading />}>
          <Component {...props} />
        </Suspense>
      )
    }
  },
}))
let heldName: string | null = null
let release: (() => void) | undefined
const evaluated: string[] = []
const mounted = new Map<string, { props: object; id: number }>()
let instance = 0
function feature(name: string) {
  evaluated.push(name)
  function Body(props: object) {
    const [id] = useState(() => ++instance)
    mounted.set(name, { props, id })
    useEffect(
      () => () => {
        if (mounted.get(name)?.id === id) mounted.delete(name)
      },
      [id, name],
    )
    return <output>{name}</output>
  }
  return Object.assign(Body, { displayName: name })
}
mock.module("@/components/orders/order-form", () => ({
  OrderForm: feature("order"),
}))
mock.module("@/components/inventory/inventory-operation-form", () => ({
  InventoryOperationForm: feature("stock"),
}))
mock.module("@/components/inventory/stock-count-form", () => ({
  StockCountForm: feature("count"),
}))
mock.module("@/components/service-work/service-request-form", () => ({
  ServiceRequestForm: feature("request"),
}))
mock.module("@/components/service-work/service-settings-form", () => ({
  ServiceSettingsForm: feature("settings"),
}))
mock.module("@/components/service-work/service-job-workspace", () => ({
  ServiceJobWorkspace: feature("job"),
  parseJobStep: (value: string | null) =>
    value
      ? { step: value.split(":")[0], lineId: value.split(":")[1] || null }
      : null,
}))
const { OrderCreateSheet } = await import("./order-create-sheet")
const { InventoryOperationSheet } = await import("./inventory-operation-sheet")
const { ServiceRequestSheet } = await import("./service-request-sheet")
const { ServiceSettingsSheet } = await import("./service-settings-sheet")
const { ServiceJobSheet } = await import("./service-job-sheet")
const store = { id: "store", name: "Inert Store", currencyCode: "NGN" }
type Kind = "order" | "inventory" | "request" | "settings" | "job"
let root: ReturnType<typeof createRoot> | undefined
let container: ReturnType<typeof document.createElement>
async function render(kind: Kind, selectedStore = store) {
  if (!root) {
    container = document.createElement("div")
    root = createRoot(container as unknown as HTMLElement)
  }
  await act(async () => {
    root?.render(
      kind === "order" ? (
        <OrderCreateSheet store={selectedStore} customerDirectory={false} />
      ) : kind === "inventory" ? (
        <InventoryOperationSheet store={selectedStore} />
      ) : kind === "request" ? (
        <ServiceRequestSheet store={selectedStore} />
      ) : kind === "settings" ? (
        <ServiceSettingsSheet
          storeId={selectedStore.id}
          currencyCode={selectedStore.currencyCode}
        />
      ) : (
        <ServiceJobSheet storeId={selectedStore.id} canManage={false} />
      ),
    )
    await new Promise((resolve) => setTimeout(resolve, 8))
  })
}
beforeEach(() => {
  params = new URLSearchParams()
  failDismissal = false
  storeRows = undefined
  storeError = false
  reads.length = 0
  mounted.clear()
  heldName = null
  release = undefined
})
afterEach(async () => {
  release?.()
  await act(async () => root?.unmount())
  root = undefined
})
test("closed route controllers do not evaluate any optional form/workspace module", async () => {
  expect(evaluated).toEqual([])
  for (const kind of [
    "order",
    "inventory",
    "request",
    "settings",
    "job",
  ] as const)
    await render(kind)
  expect(evaluated).toEqual([])
  expect(mounted.size).toBe(0)
})

test("a pending form keeps its header and closes without mounting after the chunk arrives", async () => {
  heldName = "order"
  params = new URLSearchParams({ orderSheet: "create" })
  await render("order")
  expect(container.textContent).toContain("New order")
  expect(container.textContent).toContain("Loading…")
  expect(mounted.size).toBe(0)
  await act(async () => {
    changeOpen?.(false)
    await Promise.resolve()
  })
  await render("order")
  await act(async () => {
    release?.()
    await new Promise((resolve) => setTimeout(resolve, 8))
  })
  expect(mounted.size).toBe(0)
  expect(container.textContent).toBe("")
})
const cases: {
  kind: Kind
  name: string
  url: Record<string, string>
  title: string
}[] = [
  {
    kind: "order",
    name: "order",
    url: { orderSheet: "create" },
    title: "New order",
  },
  {
    kind: "inventory",
    name: "stock",
    url: { inventoryOperation: "receipt" },
    title: "Stock in",
  },
  {
    kind: "inventory",
    name: "count",
    url: { inventoryOperation: "count" },
    title: "Count stock",
  },
  {
    kind: "request",
    name: "request",
    url: { serviceSheet: "request" },
    title: "Request links",
  },
  {
    kind: "settings",
    name: "settings",
    url: { serviceSheet: "settings" },
    title: "Service settings",
  },
  {
    kind: "job",
    name: "job",
    url: { serviceSheet: "job", jobId: "inert-job" },
    title: "Service job",
  },
]
for (const value of cases)
  test(`selected ${value.name} body loads under the existing header and props`, async () => {
    params = new URLSearchParams(value.url)
    await render(value.kind)
    expect([...mounted.keys()]).toEqual([value.name])
    expect(container.textContent).toContain(value.title)
    expect(mounted.get(value.name)?.props).toMatchObject(
      value.name === "order"
        ? { store, customerDirectory: false }
        : value.name === "stock" ||
            value.name === "count" ||
            value.name === "request"
          ? { store }
          : value.name === "settings"
            ? { storeId: store.id, currencyCode: store.currencyCode }
            : { canManage: false, jobId: "inert-job" },
    )
  })
test("unknown modes and incomplete job IDs keep every body closed", async () => {
  params = new URLSearchParams({
    orderSheet: "wrong",
    inventoryOperation: "wrong",
    serviceSheet: "job",
  })
  for (const kind of [
    "order",
    "inventory",
    "request",
    "settings",
    "job",
  ] as const)
    await render(kind)
  expect(mounted.size).toBe(0)
})

test("the Job header consumes the existing pure URL step without importing its body early", async () => {
  params = new URLSearchParams({
    serviceSheet: "job",
    jobId: "inert-job",
    jobStep: "note",
  })
  await render("job")
  expect(container.textContent).toContain("Add a note")
  expect(mounted.get("job")?.props).toMatchObject({
    canManage: false,
    jobId: "inert-job",
  })
})
test("stock entry waits for its requested Store and keeps lookup failure local", async () => {
  params = new URLSearchParams({
    inventoryOperation: "receipt",
    inventoryStore: "selected-store",
  })
  await render("inventory")
  expect(mounted.size).toBe(0)
  expect(container.textContent).toContain("Loading…")
  storeError = true
  await render("inventory")
  expect(container.textContent).toContain("Your stores couldn’t load")
  storeRows = [{ ...store, id: "selected-store" }]
  storeError = false
  await render("inventory")
  expect(mounted.get("stock")?.props).toMatchObject({ store: storeRows[0] })
  expect(reads[0]?.options).toMatchObject({ enabled: true })
})
test("changing the resolved Store preserves the body's existing reset key", async () => {
  params = new URLSearchParams({ orderSheet: "create" })
  await render("order")
  const previous = mounted.get("order")?.id
  await render("order", { ...store, id: "other-store" })
  expect(mounted.get("order")?.id).not.toBe(previous)
  expect(mounted.get("order")?.props).toMatchObject({
    store: { id: "other-store" },
  })
})
test("failed URL close keeps the mounted body and its controller error; successful close unmounts it", async () => {
  params = new URLSearchParams({ orderSheet: "create" })
  failDismissal = true
  await render("order")
  const previous = mounted.get("order")?.id
  await act(async () => {
    changeOpen?.(false)
    await Promise.resolve()
  })
  expect(container.textContent).toContain("inert URL failure")
  expect(mounted.get("order")?.id).toBe(previous)
  failDismissal = false
  await act(async () => {
    changeOpen?.(false)
    await Promise.resolve()
  })
  await render("order")
  expect(mounted.size).toBe(0)
  expect(params.has("orderSheet")).toBe(false)
})
