import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { DOMImplementation } from "@xmldom/xmldom"
import { type ReactNode, Suspense, act } from "react"

const doc = new DOMImplementation().createDocument(
  "http://www.w3.org/1999/xhtml",
  "html",
  null,
)
const create = doc.createElement.bind(doc)
doc.createElement = (name: string) =>
  Object.assign(create(name), {
    style: {},
    addEventListener() {},
    removeEventListener() {},
  })
const createText = doc.createTextNode.bind(doc)
doc.createTextNode = (value: string) => {
  const node = createText(value)
  Object.defineProperty(node, "nodeValue", {
    get: () => node.data,
    set: (next: string) => {
      node.data = next
    },
  })
  return node
}
const win = {
  document: doc,
  HTMLElement: class {},
  HTMLIFrameElement: class {},
  addEventListener() {},
  removeEventListener() {},
  location: {
    origin: "https://inert.invalid",
    href: "https://inert.invalid/finance",
    pathname: "/finance",
    search: "",
  },
}
Object.assign(doc, {
  defaultView: win,
  addEventListener() {},
  removeEventListener() {},
})
Object.assign(globalThis, {
  document: doc,
  window: win,
  location: win.location,
  IS_REACT_ACT_ENVIRONMENT: true,
})
const { QueryClientProvider, notifyManager, focusManager } = await import(
  "@tanstack/react-query"
)
const { createRoot } = await import("react-dom/client")
const { NuqsTestingAdapter } = await import("nuqs/adapters/testing")
const { createTRPCClient, TRPCClientError } = await import("@trpc/client")
const { observable } = await import("@trpc/server/observable")
const { createTRPCOptionsProxy } = await import("@trpc/tanstack-react-query")
notifyManager.setScheduler((callback) => queueMicrotask(callback))
focusManager.setFocused(true)
const app = (path: string) =>
  new URL(`../../../../apps/dashboard/src/${path}`, import.meta.url).pathname
mock.module(app("observability/sentry"), () => ({ captureDashboardError() {} }))
const leaf = ({
  children,
  label,
}: { children?: ReactNode; label?: ReactNode }) => (
  <div>
    {label}
    {children}
  </div>
)
const button = ({
  children,
  disabled,
  "aria-pressed": pressed,
}: { children?: ReactNode; disabled?: boolean; "aria-pressed"?: boolean }) => (
  <button type="button" disabled={disabled} aria-pressed={pressed}>
    {children}
  </button>
)
mock.module("@ewatrade/ui", () => ({
  Button: button,
  SubmitButton: button,
  Checkbox: leaf,
  CheckboxField: leaf,
  ControlField: leaf,
  FieldGroup: leaf,
  FieldLegend: leaf,
  FieldSet: leaf,
  FormActions: leaf,
  Input: leaf,
  DateControl: leaf,
  FieldLabel: leaf,
  MoneyInput: leaf,
  SelectControl: leaf,
  Textarea: leaf,
  Field: leaf,
  toast() {
    throw Error("No notifications expected")
  },
  cn: (...classes: Array<string | false | undefined>) =>
    classes.filter(Boolean).join(" "),
}))
mock.module(app("components/forms/form-feedback"), () => ({
  FormFeedback: leaf,
}))
mock.module("@hugeicons/react", () => ({ HugeiconsIcon: () => null }))
mock.module("next/navigation", () => ({
  useRouter: () => ({
    refresh() {
      throw Error("No command expected")
    },
  }),
}))
mock.module(app("components/orders/order-customer-picker"), () => ({
  OrderCustomerPicker: () => null,
}))
mock.module(
  app("components/general-assistant/open-missing-catalog-item"),
  () => ({ OpenMissingCatalogItem: () => null }),
)
mock.module(app("components/qa/qa-quick-fill"), () => ({
  QaDashboardQuickFill: () => null,
}))
mock.module(app("components/qa/fixture-recipes"), () => ({
  createCustomerFixture() {
    throw Error("No business fixtures")
  },
  createServiceFixture() {
    throw Error("No business fixtures")
  },
}))
mock.module(app("components/service-work/service-inline-picker"), () => ({
  ServiceInlinePicker: ({
    offerings,
  }: { offerings: Array<{ id: string; displayName: string }> }) => (
    <div>
      {offerings.map((row) => (
        <p key={row.id}>{row.displayName}</p>
      ))}
    </div>
  ),
}))
const store = {
  id: "selected-store",
  currencyCode: "NGN",
  name: "Selected Store",
}
const offerings = [
  {
    id: "own",
    name: "Available service",
    kind: "service",
    status: "active",
    pricingPolicy: "fixed",
    fixedPriceMinor: 2500,
    currencyCode: "NGN",
    stores: [{ storeId: store.id, isAvailable: true }],
  },
  {
    id: "foreign",
    name: "Foreign service",
    kind: "service",
    status: "active",
    pricingPolicy: "fixed",
    fixedPriceMinor: 2500,
    currencyCode: "NGN",
    stores: [{ storeId: "other-store", isAvailable: true }],
  },
]
const data: Record<string, unknown> = {
  "catalog.listItems": [
    {
      id: "item",
      name: "Services",
      variants: [{ id: "variant", name: "Default", offerings }],
    },
  ],
  "serviceAccess.requestForms": [
    {
      id: "saved-link",
      label: "Existing link",
      offerings: [{ name: "Available service" }],
      requestCount: 2,
      status: "ACTIVE",
    },
  ],
  "services.getSettings": {
    defaultNotificationChannel: "sms",
    expressEnabled: true,
    expressLabel: "Fixture express",
    expressSurchargeType: "fixed",
    expressSurchargeValue: 250,
  },
}
const calls: Array<{ path: string; input: unknown; type: string }> = []
let release = () => {}
let held: Promise<void> | undefined
let heldPath = "catalog.listItems"
const rpc = createTRPCClient<AppRouter>({
  links: [
    () =>
      ({ op }) =>
        observable((observer) => {
          calls.push({ path: op.path, input: op.input, type: op.type })
          if (op.type !== "query" || !(op.path in data))
            throw Error("Unexpected operation")
          void Promise.resolve(op.path === heldPath ? held : undefined).then(
            () => {
              observer.next({ result: { data: data[op.path] } })
              observer.complete()
            },
          )
        }),
  ],
})
const { makeQueryClient } = await import(
  "../../../../apps/dashboard/src/trpc/query-client"
)
let client = makeQueryClient()
let options = createTRPCOptionsProxy<AppRouter>({
  client: rpc,
  queryClient: client,
})
mock.module(app("trpc/client"), () => ({
  useTRPC: () => options,
  getDataCacheGeneration: () => 0,
}))
const { ServiceRequestForm } = await import(
  "../../../../apps/dashboard/src/components/service-work/service-request-form"
)
const { ServiceIntakeForm } = await import(
  "../../../../apps/dashboard/src/components/service-work/service-intake-form"
)
const roots: ReturnType<typeof createRoot>[] = []
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}
async function mount(form: ReactNode) {
  const host = doc.createElement("div")
  const root = createRoot(host)
  roots.push(root)
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <NuqsTestingAdapter searchParams={{}}>
          <Suspense fallback={<p>Loading form</p>}>{form}</Suspense>
        </NuqsTestingAdapter>
      </QueryClientProvider>,
    )
  })
  return { root, html: () => host.toString() }
}

beforeEach(() => {
  calls.length = 0
  held = undefined
  heldPath = "catalog.listItems"
  release = () => {}
  client = makeQueryClient()
  options = createTRPCOptionsProxy<AppRouter>({
    client: rpc,
    queryClient: client,
  })
})
afterEach(async () => {
  release()
  await act(async () => {
    for (const root of roots) root.unmount()
  })
  roots.length = 0
  client.clear()
})

for (const kind of ["request", "intake"] as const) {
  const secondary =
    kind === "request" ? "serviceAccess.requestForms" : "services.getSettings"
  const form = () =>
    kind === "request" ? (
      <ServiceRequestForm store={store} />
    ) : (
      <ServiceIntakeForm store={store} canManage={false} />
    )
  for (const hold of ["catalog.listItems", secondary])
    test(`cold ${kind} starts both reads while ${hold} is held`, async () => {
      heldPath = hold
      held = new Promise<void>((resolve) => {
        release = resolve
      })
      const view = await mount(form())
      try {
        await flush()
        expect(calls).toEqual([
          {
            path: "catalog.listItems",
            input: { kind: "service" },
            type: "query",
          },
          { path: secondary, input: { storeId: store.id }, type: "query" },
        ])
        expect(view.html()).toContain("Loading form")
      } finally {
        await act(async () => {
          release()
        })
        await flush()
      }
      expect(view.html()).toContain("Available service")
      expect(view.html()).not.toContain("Foreign service")
      expect(view.html()).toContain(
        kind === "request" ? "Existing link" : "Fixture express",
      )
      expect(calls).toHaveLength(2)
      await act(async () => view.root.unmount())
      await mount(form())
      expect(calls).toHaveLength(2)
    })
}
