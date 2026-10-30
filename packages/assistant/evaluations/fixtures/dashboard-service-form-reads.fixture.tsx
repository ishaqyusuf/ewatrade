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
const {
  QueryClientProvider,
  InfiniteQueryObserver,
  QueryObserver,
  notifyManager,
  focusManager,
} = await import("@tanstack/react-query")
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
let routeRefreshes = 0
mock.module("next/navigation", () => ({
  useRouter: () => ({
    refresh() {
      routeRefreshes++
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
  createOrderFixture() {
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
for (const [path, name] of [
  ["order-item-picker", "OrderItemPicker"],
  ["order-item-row", "OrderItemRow"],
  ["order-catalog-free-lines", "OrderCatalogFreeLines"],
] as const)
  mock.module(app(`components/orders/${path}`), () => ({ [name]: () => null }))
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
  "orders.listPage": { items: [], nextCursor: undefined, totalCount: 2 },
  "orders.paymentAccounts": { book: null, accounts: [] },
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
let intakeSuccess: (() => unknown) | undefined
let orderSuccess: (() => unknown) | undefined
mock.module(app("trpc/client"), () => ({
  useTRPC: () =>
    new Proxy(options, {
      get(target, key) {
        if (key === "orders")
          return new Proxy(target.orders, {
            get(orders, name) {
              if (name !== "create") return Reflect.get(orders, name)
              return new Proxy(orders.create, {
                get(create, method) {
                  if (method !== "mutationOptions")
                    return Reflect.get(create, method)
                  return (
                    configuration: Parameters<typeof create.mutationOptions>[0],
                  ) => {
                    const handler = configuration?.onSuccess
                    orderSuccess = handler
                      ? () =>
                          Reflect.apply(handler, undefined, [
                            { id: "created-order" },
                          ])
                      : undefined
                    return create.mutationOptions(configuration)
                  }
                },
              })
            },
          })
        if (key !== "services") return Reflect.get(target, key)
        return new Proxy(target.services, {
          get(services, name) {
            if (name !== "createAndConfirmIntake")
              return Reflect.get(services, name)
            return new Proxy(services.createAndConfirmIntake, {
              get(intake, method) {
                if (method !== "mutationOptions")
                  return Reflect.get(intake, method)
                return (
                  configuration: Parameters<typeof intake.mutationOptions>[0],
                ) => {
                  const handler = configuration?.onSuccess
                  intakeSuccess = handler
                    ? () => Reflect.apply(handler, undefined, [])
                    : undefined
                  return intake.mutationOptions(configuration)
                }
              },
            })
          },
        })
      },
    }),
  getDataCacheGeneration: () => 0,
}))
const { ServiceRequestForm } = await import(
  "../../../../apps/dashboard/src/components/service-work/service-request-form"
)
const { ServiceIntakeForm } = await import(
  "../../../../apps/dashboard/src/components/service-work/service-intake-form"
)
const { OrderForm } = await import(
  "../../../../apps/dashboard/src/components/orders/order-form"
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
  routeRefreshes = 0
  intakeSuccess = undefined
  orderSuccess = undefined
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

test("actual intake success refreshes active infinite Orders variants and marks retained variants stale", async () => {
  await mount(<ServiceIntakeForm store={store} canManage={false} />)
  const inputs = [
    { storeId: store.id, limit: 25 },
    { storeId: store.id, limit: 25, statuses: ["CONFIRMED" as const] },
  ]
  const keys = inputs.map((input) =>
    options.orders.listPage.infiniteQueryKey(input),
  )
  const previousOrders = {
    pages: [{ items: [], nextCursor: undefined, totalCount: 1 }],
    pageParams: [null],
  }
  for (const key of keys) client.setQueryData(key, previousOrders)
  const unrelated = options.catalog.listDirectoryPage.infiniteQueryKey({
    limit: 25,
  })
  const previousCatalog = {
    pages: [{ items: [], nextCursor: undefined }],
    pageParams: [null],
  }
  client.setQueryData(unrelated, previousCatalog)
  const observers = inputs.map(
    (input) =>
      new InfiniteQueryObserver(
        client,
        options.orders.listPage.infiniteQueryOptions(input, {
          getNextPageParam: (page) => page.nextCursor ?? undefined,
          staleTime: Number.POSITIVE_INFINITY,
          retry: false,
        }),
      ),
  )
  const unsubscribes = observers.map((observer) => observer.subscribe(() => {}))
  const inactive = options.orders.listPage.infiniteQueryKey({
    storeId: "other-store",
    limit: 25,
  })
  client.setQueryData(inactive, previousOrders)
  try {
    if (!intakeSuccess) throw Error("Missing mounted intake success callback")
    await act(async () => {
      // Execute the production success callback without submitting a command.
      await intakeSuccess?.()
    })
    expect(calls.filter((call) => call.path === "orders.listPage")).toEqual(
      inputs.map((input) => ({
        path: "orders.listPage",
        input: { ...input, direction: "forward" },
        type: "query",
      })),
    )
    for (const observer of observers)
      expect(observer.getCurrentResult().data?.pages[0]?.totalCount).toBe(2)
    expect(client.getQueryState(inactive)?.isInvalidated).toBe(true)
    expect(client.getQueryData(inactive)).toEqual(previousOrders)
    expect(client.getQueryState(unrelated)?.isInvalidated).toBe(false)
    expect(client.getQueryData(unrelated)).toEqual(previousCatalog)
    expect(routeRefreshes).toBe(1)
    expect(calls.every((call) => call.type === "query")).toBe(true)
  } finally {
    for (const unsubscribe of unsubscribes) unsubscribe()
  }
})

for (const kind of ["intake", "order"] as const)
  test(`actual ${kind} success refreshes live financial reads and invalidates affected retained facts without reloading snapshots`, async () => {
    await mount(
      kind === "intake" ? (
        <ServiceIntakeForm store={store} canManage={false} />
      ) : (
        <OrderForm store={store} />
      ),
    )
    const live = [
      ["balances", options.finance.balances.queryKey({ bookId: "book" })],
      ["owed", options.finance.owedSummary.queryKey({ bookId: "book" })],
      [
        "account",
        options.customerLedger.accountDetail.queryKey({ accountId: "ledger" }),
      ],
      [
        "work queue",
        options.services.queuePage.infiniteQueryKey({
          storeId: store.id,
          limit: 25,
        }),
      ],
      [
        "work counts",
        options.services.queueStageCounts.queryKey({ storeId: store.id }),
      ],
    ] as const
    const lookups = [
      [
        "customer lookup",
        options.customers.listPage.infiniteQueryKey({ limit: 25 }),
      ],
      ["search", options.search.global.queryKey()],
      ...(kind === "order"
        ? [
            [
              "order directory",
              options.orders.listPage.infiniteQueryKey({
                storeId: store.id,
                limit: 25,
              }),
            ] as const,
          ]
        : []),
    ] as const
    const retained = [
      options.finance.customerBalances.queryKey(),
      options.finance.customerBalanceDirectory.infiniteQueryKey({
        limit: 30,
      }),
      options.finance.reports.queryKey(),
      options.finance.periodCloseChecklist.queryKey(),
      options.finance.inventoryReconciliation.queryKey(),
      options.customerLedger.accounts.queryKey({
        customerId: "customer",
        limit: 50,
      }),
      options.customerLedger.receivables.queryKey(),
      options.customers.getById.queryKey({ customerId: "customer" }),
      options.customers.count.queryKey(),
      options.customers.listPage.infiniteQueryKey({ limit: 25 }),
      options.orders.salesReport.queryKey(),
      options.orders.operationalSummary.queryKey(),
      options.serviceReporting.summary.queryKey(),
      options.serviceCommerce.report.queryKey(),
      options.serviceCommerce.reportDrilldown.queryKey(),
      options.search.global.queryKey(),
    ]
    const protectedReads = [
      options.finance.book.queryKey(),
      options.finance.bills.infiniteQueryKey({ bookId: "book", limit: 30 }),
      options.finance.supplierDirectory.infiniteQueryKey({
        bookId: "book",
        limit: 30,
      }),
      options.finance.accountActivity.queryKey({
        bookId: "book",
        accountId: "money",
        from: new Date("2026-10-01Z"),
        through: new Date("2026-10-30Z"),
        snapshotSequence: "7",
        limit: 30,
      }),
      options.finance.accountLedger.infiniteQueryKey({
        bookId: "book",
        accountId: "money",
        from: new Date("2026-10-01Z"),
        through: new Date("2026-10-30Z"),
        snapshotSequence: "7",
        limit: 30,
      }),
      options.customerLedger.statement.queryKey({
        accountId: "ledger",
        snapshotSequence: "7",
        limit: 30,
      }),
    ]
    const refreshed: string[] = []
    const observers = [...live, ...lookups].map(([name, queryKey]) => {
      // The probe owns numeric cache markers, not financial DTOs or commands.
      const observer = new QueryObserver(client, {
        queryKey: [...queryKey],
        queryFn: async () => {
          refreshed.push(name)
          return 2
        },
        staleTime: Number.POSITIVE_INFINITY,
      })
      client.setQueryData([...queryKey], 1)
      return observer
    })
    for (const key of [...retained, ...protectedReads])
      client.setQueryData([...key], 1)
    const stops = observers.map((observer) => observer.subscribe(() => {}))
    try {
      const success = kind === "intake" ? intakeSuccess : orderSuccess
      if (!success) throw Error("Missing actual creation success callback")
      await act(async () => {
        await success()
      })
      expect(refreshed.sort()).toEqual([
        "account",
        "balances",
        "owed",
        "work counts",
        "work queue",
      ])
      for (const observer of observers.slice(0, live.length))
        expect(observer.getCurrentResult().data).toBe(2)
      for (const observer of observers.slice(live.length))
        expect(observer.getCurrentResult().data).toBe(1)
      for (const key of retained) {
        expect(client.getQueryState(key)?.isInvalidated).toBe(true)
        expect(client.getQueryData([...key])).toBe(1)
      }
      for (const key of protectedReads) {
        expect(client.getQueryState(key)?.isInvalidated).toBe(false)
        expect(client.getQueryData([...key])).toBe(1)
      }
      expect(routeRefreshes).toBe(1)
      expect(calls.every((call) => call.type === "query")).toBe(true)
    } finally {
      for (const stop of stops) stop()
    }
  })
