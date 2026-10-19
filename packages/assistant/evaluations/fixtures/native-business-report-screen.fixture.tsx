import { expect, mock, test } from "bun:test"
import type { BusinessReportTarget } from "@ewatrade/assistant/general/business-report-target"
import type { BusinessReport } from "@ewatrade/db/business-reporting"
import { type ReactNode, act, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

// Actual screen/query ownership/navigation with native and transport stand-ins.
// Content presentation has its own fixture; no database, browser or device runs.
const root = new URL("../../../../", import.meta.url)
const standIn = (path: string, value: Record<string, unknown>) =>
  mock.module(new URL(`apps/mobile/src/${path}`, root).pathname, () => value)
const children = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
)
standIn("components/ui/text", { Text: children })
standIn("components/ui/view", { View: children })
mock.module("react-native", () => ({ ScrollView: children }))
const buttons = new Map<string, { disabled?: boolean; press: () => void }>()
standIn("components/mobile/action-button", {
  ActionButton: ({
    children,
    disabled,
    onPress,
  }: {
    children: string
    disabled?: boolean
    onPress: () => void
  }) => {
    buttons.set(children, { disabled, press: onPress })
    return (
      <button type="button" disabled={disabled}>
        {children}
      </button>
    )
  },
})
const owner = {
  id: "actor",
  businessId: "tenant",
  storeId: "store",
  role: "OWNER",
  staffAccessMode: "LEGACY",
  catalogEditor: true,
  status: "ACTIVE",
}
let profile: typeof owner | Omit<typeof owner, "storeId"> = owner
standIn("hooks/use-auth", { useAuthContext: () => ({ profile }) })
let routeParams: { target?: string | string[] } = {}
const routes: unknown[] = []
mock.module("expo-router", () => ({
  useLocalSearchParams: () => routeParams,
  useRouter: () => ({ push: (route: unknown) => routes.push(route) }),
}))
let onOriginal:
  | ((target: NonNullable<BusinessReport["rows"][number]["target"]>) => void)
  | undefined
let canOpen:
  | ((target: NonNullable<BusinessReport["rows"][number]["target"]>) => boolean)
  | undefined
let shown: BusinessReport | undefined
standIn("components/mobile/assistant/native-business-report-content", {
  NativeBusinessReportContent: ({
    report,
    onOpen,
    canOpen: available,
  }: {
    report: BusinessReport
    onOpen: NonNullable<typeof onOriginal>
    canOpen: NonNullable<typeof canOpen>
  }) => {
    shown = report
    onOriginal = onOpen
    canOpen = available
    return (
      <div>
        CANONICAL_REPORT:{report.summary}:{report.asOf}
      </div>
    )
  },
})
const tenant = {
  actorUserId: "actor",
  tenant: { id: "tenant" },
  activeStore: { id: "store", status: "ACTIVE" },
  membership: {
    tenantId: "tenant",
    role: "OWNER",
    staffAccessMode: "LEGACY",
    catalogEditor: true,
  },
  staffAccess: { status: "ACTIVE", mode: "LEGACY", catalogEditor: true },
}
let current: unknown = tenant
const period = {
  from: "2026-10-01T03:00:00.123456+01:00",
  before: "2026-10-02T04:00:00.654321+01:00",
  timezone: "Africa/Lagos",
  currencyCode: "NGN",
}
const targets: BusinessReportTarget[] = [
  {
    kind: "business_report",
    origin: { tenantId: "tenant", storeId: "store" },
    request: {
      report: "item_sales",
      filters: {
        ...period,
        catalogItemId: "catalog-exact",
        cursor: "saved-item-cursor",
      },
    },
  },
  {
    kind: "business_report",
    origin: { tenantId: "tenant", storeId: "store" },
    request: { report: "payment_collections", filters: period },
  },
  {
    kind: "business_report",
    origin: { tenantId: "tenant", storeId: null },
    request: {
      report: "customer_debt",
      filters: {
        currencyCode: "USD",
        query: "Exact person",
        cursor: "saved-debt-cursor",
      },
    },
  },
  {
    kind: "business_report",
    origin: { tenantId: "tenant", storeId: "store" },
    request: { report: "stock", filters: { catalogItemId: "catalog-exact" } },
  },
  {
    kind: "business_report",
    origin: { tenantId: "tenant", storeId: null },
    request: {
      report: "supplier_aging",
      filters: {
        bookId: "exact-book",
        supplierId: "exact-supplier",
        timezone: "UTC",
        asOfDate: "2026-10-12",
        snapshotSequence: "9223372036854775807",
      },
    },
  },
  {
    kind: "business_report",
    origin: { tenantId: "tenant", storeId: null },
    request: {
      report: "posted_profit",
      filters: {
        bookId: "exact-book",
        timezone: "UTC",
        from: "2026-10-01T00:00:00+00:00",
        through: "2026-10-12T23:59:59.123456+00:00",
        snapshotSequence: "22",
      },
    },
  },
]
function reportFor(target: BusinessReportTarget): BusinessReport {
  const request = target.request
  let period: BusinessReport["period"] = null
  if (
    request.report === "item_sales" ||
    request.report === "payment_collections"
  )
    period = {
      from: new Date(request.filters.from).toISOString(),
      to: new Date(request.filters.before).toISOString(),
      end: "exclusive",
      timezone: request.filters.timezone,
    }
  if (request.report === "posted_profit")
    period = {
      from: new Date(request.filters.from).toISOString(),
      to: new Date(request.filters.through).toISOString(),
      end: "inclusive",
      timezone: "UTC",
    }
  return {
    report: request.report,
    asOf: "2026-10-15T08:00:00.987Z",
    complete: true,
    scope: "Canonical source scope",
    dateBasis: "Canonical date basis",
    currencyCode:
      request.report === "stock"
        ? null
        : "currencyCode" in request.filters
          ? request.filters.currencyCode
          : "NGN",
    period,
    summary: `PRIVATE_${request.report}_EXACT_TOTAL`,
    gaps: ["Declared coverage"],
    rows: [
      {
        id: "source-row",
        label: "Original source",
        value: "Exact units",
        detail: "Source only",
        target: {
          kind:
            request.report === "customer_debt" ? "customer" : "catalog_item",
          id: "exact-original",
        },
      },
    ],
    pagination:
      request.report === "item_sales" || request.report === "customer_debt"
        ? { totalRows: "27", nextCursor: "canonical-next-cursor" }
        : undefined,
  }
}
type Flags = {
  isError: boolean
  isSuccess: boolean
  isPending: boolean
  isFetching: boolean
  isPaused: boolean
  isFetchedAfterMount: boolean
}
let flags: Record<string, Partial<Flags>> = {}
let alter: (report: BusinessReport) => BusinessReport = (value) => value
const queries: {
  name: string
  input: unknown
  enabled: boolean
  key?: unknown
}[] = []
function procedure(name: string) {
  return {
    queryOptions: (input: unknown, options: { enabled?: boolean } = {}) => {
      const row = { name, input, enabled: options.enabled ?? true }
      queries.push(row)
      return {
        ...options,
        queryKey: [name, input],
        queryFn: async () => {
          throw Error("No transport")
        },
      }
    },
  }
}
standIn("trpc/client", {
  useTRPC: () => ({
    tenant: { current: procedure("tenant.current") },
    businessReporting: { read: procedure("businessReporting.read") },
  }),
})
mock.module("@tanstack/react-query", () => ({
  useQuery: (options: {
    queryKey: [string, BusinessReportTarget]
    enabled?: boolean
  }) => {
    const name = options.queryKey[0]
    const row = queries.findLast((query) => query.name === name)
    if (row) row.key = options.queryKey
    return {
      isError: false,
      isSuccess: options.enabled !== false,
      isPending: options.enabled === false,
      isFetching: false,
      isPaused: false,
      isFetchedAfterMount: options.enabled !== false,
      data:
        name === "tenant.current"
          ? current
          : alter(reportFor(options.queryKey[1])),
      ...flags[name],
      refetch: () => {
        throw Error("Screen must remount owned reads")
      },
    }
  },
}))
const { NativeBusinessReportScreen } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/native-business-report-screen"
)
standIn("components/mobile/workflow-modal-screen", {
  WorkflowModalScreen: ({
    children,
    back,
    allowSalesRep,
    closeLabel,
  }: {
    children: ReactNode
    back?: boolean
    allowSalesRep?: boolean
    closeLabel: string
  }) => (
    <section
      data-back={String(back)}
      data-sales-rep={String(allowSalesRep)}
      data-close={closeLabel}
    >
      {children}
    </section>
  ),
})
const { default: BusinessReportRoute } = await import(
  "../../../../apps/mobile/src/app/business-report-modal"
)
const { generalAnswerRoute } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/general-model"
)
const serialized = (target = targets[0]) => JSON.stringify(target)
function reset() {
  profile = owner
  current = tenant
  flags = {}
  alter = (value) => value
  queries.length = 0
  buttons.clear()
  routes.length = 0
  shown = undefined
  onOriginal = undefined
  canOpen = undefined
}
function render(...args: [raw?: unknown]) {
  const raw = args.length ? args[0] : serialized()
  shown = undefined
  buttons.clear()
  return renderToStaticMarkup(
    createElement(NativeBusinessReportScreen, { raw }),
  )
}

test("saved report answer routes through the actual modal into the protected six-family reader", () => {
  for (const target of targets) {
    reset()
    const route = generalAnswerRoute(target, {
      tenantId: "tenant",
      storeId: "store",
    })
    expect(route?.pathname).toBe("/business-report-modal")
    expect(route?.params).toEqual({ target: serialized(target) })
    routeParams = route?.params ?? {}
    const html = renderToStaticMarkup(<BusinessReportRoute />)
    expect(html).toContain(`PRIVATE_${target.request.report}_EXACT_TOTAL`)
    expect(html).toContain('data-back="true"')
    expect(html).toContain('data-sales-rep="true"')
    expect(html).toContain('data-close="Back to the assistant"')
    expect(
      queries.findLast((q) => q.name === "businessReporting.read")?.input,
    ).toEqual(target)
    expect(generalAnswerRoute(target)).toBeNull()
    expect(
      generalAnswerRoute(target, { tenantId: "other", storeId: "store" }),
    ).toBeNull()
    const elsewhere = generalAnswerRoute(target, {
      tenantId: "tenant",
      storeId: "other",
    })
    expect(Boolean(elsewhere)).toBe(target.origin.storeId === null)
  }
})
test("direct malformed modal params never prepare protected report reads or infer a report", () => {
  for (const target of [
    undefined,
    [serialized()],
    [serialized(), serialized()],
    "",
    "{",
    "{}",
  ]) {
    reset()
    routeParams = { target }
    const html = renderToStaticMarkup(<BusinessReportRoute />)
    expect(html).toContain("This report link is invalid")
    expect(html).not.toContain("PRIVATE_")
    expect(queries).toEqual([])
    expect(html).toContain('data-back="true"')
  }
})

test("all six report inputs retain exact origin/filter/Book/snapshot/date/currency values behind fresh tenant scope", () => {
  for (const target of targets) {
    reset()
    expect(render(serialized(target))).toContain(
      `PRIVATE_${target.request.report}_EXACT_TOTAL`,
    )
    expect(
      queries.map((query) => [query.name, query.input, query.enabled]),
    ).toEqual([
      ["tenant.current", undefined, true],
      ["businessReporting.read", target, true],
    ])
    expect(shown?.asOf).toBe("2026-10-15T08:00:00.987Z")
    expect(buttons.has("First page")).toBe(
      target.request.report === "item_sales" ||
        target.request.report === "customer_debt",
    )
  }
})
test("malformed target and known inactive native profile prepare no reads", () => {
  for (const raw of [
    undefined,
    targets[0],
    "{}",
    "{bad",
    serialized({ ...targets[0], extra: true } as BusinessReportTarget),
  ]) {
    reset()
    expect(render(raw)).not.toContain("CANONICAL_REPORT")
    expect(queries).toEqual([])
  }
  reset()
  profile = { ...owner, status: "SUSPENDED" }
  expect(render()).not.toContain("CANONICAL_REPORT")
  expect(queries).toEqual([])
})
test("cached, paused, fetching and denied tenant reads never enable the reporting read", () => {
  for (const state of [
    { isError: true },
    { isPaused: true },
    { isFetching: true },
    { isFetchedAfterMount: false },
  ]) {
    reset()
    flags["tenant.current"] = state
    expect(render()).not.toContain("PRIVATE_")
    expect(
      queries.find((query) => query.name === "businessReporting.read")?.enabled,
    ).toBe(false)
  }
})
test("fresh current actor/business/Store/role/access/catalog and known active status must match", () => {
  for (const changed of [
    { ...tenant, actorUserId: "other" },
    { ...tenant, tenant: { id: "other" } },
    { ...tenant, membership: { ...tenant.membership, tenantId: "other" } },
    { ...tenant, membership: { ...tenant.membership, role: "ADMIN" } },
    {
      ...tenant,
      membership: { ...tenant.membership, staffAccessMode: "SCOPED" },
    },
    { ...tenant, membership: { ...tenant.membership, catalogEditor: false } },
    { ...tenant, activeStore: { id: "other", status: "ACTIVE" } },
    { ...tenant, activeStore: { id: "store", status: "INACTIVE" } },
    { ...tenant, staffAccess: { ...tenant.staffAccess, status: "SUSPENDED" } },
  ]) {
    reset()
    current = changed
    expect(render()).not.toContain("PRIVATE_")
    expect(
      queries.find((query) => query.name === "businessReporting.read")?.enabled,
    ).toBe(false)
  }
  reset()
  expect(
    render(
      serialized({
        ...targets[2],
        origin: { tenantId: "tenant", storeId: "store" },
      }),
    ),
  ).not.toContain("PRIVATE_")
})

test("business-wide origin stays null and requires no Store while Store reports keep the exact origin", () => {
  reset()
  const { storeId: _storeId, ...withoutStore } = owner
  profile = withoutStore
  current = { ...tenant, activeStore: null }
  expect(render(serialized(targets[2]))).toContain("PRIVATE_customer_debt")
  expect(render(serialized(targets[0]))).not.toContain("PRIVATE_item_sales")
  reset()
  const foreign = {
    ...targets[0],
    origin: { tenantId: "other", storeId: "store" },
  }
  expect(render(serialized(foreign))).not.toContain("PRIVATE_")
  current = { ...tenant, tenant: { id: "other" } }
  expect(render(serialized(foreign))).not.toContain("PRIVATE_")
})
test("report refusal, paused/refetch/cached data and wrong canonical projection hide facts and paging", () => {
  for (const state of [
    { isError: true },
    { isPaused: true },
    { isFetching: true },
    { isFetchedAfterMount: false },
  ]) {
    reset()
    flags["businessReporting.read"] = state
    expect(render()).not.toContain("PRIVATE_")
    expect(buttons.has("Next page")).toBe(false)
  }
  for (const change of [
    (report: BusinessReport): BusinessReport => ({
      ...report,
      report: "customer_debt",
    }),
    (report: BusinessReport): BusinessReport => ({
      ...report,
      currencyCode: "USD",
    }),
    (report: BusinessReport): BusinessReport => ({
      ...report,
      period: report.period ? { ...report.period, end: "inclusive" } : null,
    }),
  ]) {
    reset()
    alter = change
    expect(render()).not.toContain("PRIVATE_")
  }
})
test("Open original uses only an exact current canonical row and the allowlisted native route", () => {
  reset()
  render()
  onOriginal?.({ kind: "catalog_item", id: "exact-original" })
  expect(routes).toEqual([
    {
      pathname: "/catalog-item/[catalogItemId]",
      params: { catalogItemId: "exact-original" },
    },
  ])
  onOriginal?.({ kind: "catalog_item", id: "different" })
  expect(routes).toHaveLength(1)
  reset()
  alter = (report) => ({ ...report, complete: false })
  render()
  onOriginal?.({ kind: "catalog_item", id: "exact-original" })
  expect(routes).toEqual([])
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
    render: async (raw = serialized()) => {
      shown = undefined
      buttons.clear()
      await act(async () =>
        mounted.render(<NativeBusinessReportScreen raw={raw} />),
      )
      return host.toString()
    },
    close: async () => {
      await act(async () => mounted.unmount())
    },
  }
}
test("mounted Next/First change only the cursor and retire old callbacks immediately", async () => {
  reset()
  const fixture = await mountedFixture()
  try {
    await fixture.render()
    const oldOpen = onOriginal
    const next = buttons.get("Next page")?.press
    const firstKey = queries.findLast(
      (query) => query.name === "businessReporting.read",
    )?.key
    await act(async () => {
      next?.()
      next?.()
      oldOpen?.({ kind: "catalog_item", id: "exact-original" })
    })
    expect(routes).toEqual([])
    expect(
      queries.findLast((query) => query.name === "businessReporting.read")
        ?.input,
    ).toEqual({
      ...targets[0],
      request: {
        report: "item_sales",
        filters: {
          ...targets[0].request.filters,
          cursor: "canonical-next-cursor",
        },
      },
    })
    expect(
      queries.findLast((query) => query.name === "businessReporting.read")?.key,
    ).not.toEqual(firstKey)
    await act(async () => buttons.get("First page")?.press())
    const first = queries.findLast(
      (query) => query.name === "businessReporting.read",
    )?.input as BusinessReportTarget
    expect(first.origin).toEqual(targets[0].origin)
    expect(first.request.filters).toEqual({
      ...period,
      catalogItemId: "catalog-exact",
    })
    expect(shown?.rows).toHaveLength(1)
  } finally {
    await fixture.close()
  }
})
test("mounted scope changes block old row/page callbacks and require explicit First instead of old cursor", async () => {
  reset()
  const fixture = await mountedFixture()
  try {
    await fixture.render()
    const oldOpen = onOriginal
    const oldNext = buttons.get("Next page")?.press
    profile = { ...owner, catalogEditor: false }
    current = {
      ...tenant,
      membership: { ...tenant.membership, catalogEditor: false },
      staffAccess: { ...tenant.staffAccess, catalogEditor: false },
    }
    expect(await fixture.render()).toContain("old cursor has not been reused")
    const count = queries.length
    await act(async () => {
      oldNext?.()
      oldOpen?.({ kind: "catalog_item", id: "exact-original" })
    })
    expect(queries).toHaveLength(count)
    expect(routes).toEqual([])
    await act(async () => buttons.get("First page")?.press())
    const input = queries.findLast(
      (query) => query.name === "businessReporting.read",
    )?.input as BusinessReportTarget
    expect(input.request.filters).toEqual({
      ...period,
      catalogItemId: "catalog-exact",
    })
    expect(input.origin).toEqual(targets[0].origin)
  } finally {
    await fixture.close()
  }
})
test("mounted report refetch and actual unmount retire captured original callbacks", async () => {
  reset()
  const fixture = await mountedFixture()
  let old: typeof onOriginal
  try {
    await fixture.render()
    old = onOriginal
    flags["businessReporting.read"] = { isFetching: true }
    expect(await fixture.render()).not.toContain("PRIVATE_")
    old?.({ kind: "catalog_item", id: "exact-original" })
    expect(routes).toEqual([])
    flags = {}
    await fixture.render()
    old = onOriginal
  } finally {
    await fixture.close()
  }
  old?.({ kind: "catalog_item", id: "exact-original" })
  expect(routes).toEqual([])
})

test("a ready A callback never becomes authorized again after checking and a fresh B read", async () => {
  reset()
  const fixture = await mountedFixture()
  try {
    await fixture.render()
    const oldOpen = onOriginal
    const oldNext = buttons.get("Next page")?.press
    flags["businessReporting.read"] = { isFetching: true }
    await fixture.render()
    flags = {}
    alter = (report) => ({
      ...report,
      rows: [
        {
          ...report.rows[0],
          id: "new-row",
          target: { kind: "catalog_item", id: "new-original" },
        },
      ],
      pagination: { totalRows: "28", nextCursor: "new-cursor" },
    })
    await fixture.render()
    const count = queries.length
    await act(async () => {
      oldOpen?.({ kind: "catalog_item", id: "exact-original" })
      oldNext?.()
    })
    expect(routes).toEqual([])
    expect(queries).toHaveLength(count)
    onOriginal?.({ kind: "catalog_item", id: "new-original" })
    expect(routes).toEqual([
      {
        pathname: "/catalog-item/[catalogItemId]",
        params: { catalogItemId: "new-original" },
      },
    ])
    await act(async () => buttons.get("Next page")?.press())
    const input = queries.findLast(
      (query) => query.name === "businessReporting.read",
    )?.input as BusinessReportTarget
    expect(input.request.filters).toEqual({
      ...period,
      catalogItemId: "catalog-exact",
      cursor: "new-cursor",
    })
  } finally {
    await fixture.close()
  }
})

test("report access does not imply access to catalog or customer-ledger originals", () => {
  for (const [role, mode, catalogEditor, allowed] of [
    ["CASHIER", "LEGACY", false, false],
    ["OPERATOR", "SCOPED", false, false],
    ["OPERATOR", "SCOPED", true, true],
    ["MANAGER", "SCOPED", false, true],
    ["OWNER", "LEGACY", false, true],
  ] as const) {
    reset()
    profile = { ...owner, role, staffAccessMode: mode, catalogEditor }
    current = {
      ...tenant,
      membership: {
        ...tenant.membership,
        role,
        staffAccessMode: mode,
        catalogEditor,
      },
      staffAccess: { ...tenant.staffAccess, mode, catalogEditor },
    }
    expect(render()).toContain("PRIVATE_item_sales_EXACT_TOTAL")
    const original = { kind: "catalog_item", id: "exact-original" } as const
    expect(canOpen?.(original)).toBe(allowed)
    onOriginal?.(original)
    expect(routes.length).toBe(allowed ? 1 : 0)
    expect(canOpen?.({ kind: "customer", id: "exact-original" })).toBe(
      role === "OWNER",
    )
  }
})

test("structural sharing cannot revive a callback from before report access was rechecked", async () => {
  reset()
  const shared = reportFor(targets[0])
  alter = () => shared
  const fixture = await mountedFixture()
  try {
    await fixture.render()
    const oldOpen = onOriginal
    const oldNext = buttons.get("Next page")?.press
    flags["businessReporting.read"] = { isFetching: true }
    await fixture.render()
    flags = {}
    await fixture.render()
    const before = queries.length
    await act(async () => {
      oldOpen?.({ kind: "catalog_item", id: "exact-original" })
      oldNext?.()
    })
    expect(routes).toEqual([])
    expect(queries).toHaveLength(before)
    onOriginal?.({ kind: "catalog_item", id: "exact-original" })
    expect(routes).toHaveLength(1)
  } finally {
    await fixture.close()
  }
})
