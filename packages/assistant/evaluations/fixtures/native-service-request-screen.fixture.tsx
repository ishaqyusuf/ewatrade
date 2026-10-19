import { expect, mock, test } from "bun:test"
import type {
  ServiceRequestPageTarget,
  ServiceRequestTarget,
} from "@ewatrade/assistant/general/service-request-read"
import { type ReactNode, act, useEffect } from "react"
import { renderToStaticMarkup } from "react-dom/server"

// Actual controller/state/shared schemas/route dispatch. Native presentation and
// query transport stand in; mounted React verifies callback/focus ownership.
// This fixture proves no device, HTTP, canonical SQL, provider or real authority.
const root = new URL("../../../../apps/mobile/src/", import.meta.url)
const standIn = (path: string, exports: Record<string, unknown>) =>
  mock.module(new URL(path, root).pathname, () => exports)
const children = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
)
standIn("components/ui/text", { Text: children })
standIn("components/ui/view", { View: children })
standIn("components/mobile/green-till/kit", { ListCard: children })
mock.module("react-native", () => ({ ScrollView: children }))
const buttons = new Map<string, () => void>()
standIn("components/mobile/action-button", {
  ActionButton: ({
    children,
    onPress,
  }: { children: string; onPress: () => void }) => {
    buttons.set(children, onPress)
    return <button type="button">{children}</button>
  },
})
const origin = { tenantId: "business", storeId: "store" }
const owner = {
  id: "actor",
  businessId: "business",
  storeId: "store",
  role: "OWNER",
  staffAccessMode: "LEGACY",
  catalogEditor: false,
  status: "ACTIVE",
}
let profile: Omit<typeof owner, "status"> & { status?: string } = { ...owner }
standIn("hooks/use-auth", { useAuthContext: () => ({ profile }) })
type FocusEntry = { start: () => void; blur: () => void }
const focusEntries = new Set<FocusEntry>()
const routes: unknown[] = []
mock.module("expo-router", () => ({
  useRouter: () => ({
    push: (route: unknown) => routes.push(route),
    back: () => {},
  }),
  useFocusEffect: (callback: () => undefined | (() => void)) => {
    useEffect(() => {
      let cleanup: undefined | (() => void)
      const entry = {
        start: () => {
          cleanup = callback()
        },
        blur: () => {
          cleanup?.()
          cleanup = undefined
        },
      }
      focusEntries.add(entry)
      entry.start()
      return () => {
        entry.blur()
        focusEntries.delete(entry)
      }
    }, [callback])
  },
}))
const at = "2026-10-15T16:00:00.000Z"
const exactTarget: ServiceRequestTarget = {
  kind: "service_request",
  requestId: "request",
  origin,
}
const pageTarget: ServiceRequestPageTarget = {
  kind: "service_request_page",
  origin,
  filters: { status: "submitted", query: "Amina", limit: 10 },
}
const row = {
  id: "request",
  revision: 2,
  status: "SUBMITTED",
  customerName: "PRIVATE_PAGE_CONTACT",
  requestedAt: null,
  createdAt: at,
  form: { id: "form", label: "Saved form" },
  lineCount: 1,
  originalTarget: exactTarget,
}
const page = {
  actorUserId: "actor",
  tenantId: "business",
  storeId: "store",
  asOf: at,
  coverage: "service_requests_only",
  totalMatching: "20",
  nextCursor: "next-fixed-cursor",
  items: [row],
}
const original = {
  actorUserId: "actor",
  tenantId: "business",
  storeId: "store",
  asOf: at,
  request: {
    id: "request",
    revision: 2,
    status: "SUBMITTED",
    createdAt: at,
    updatedAt: at,
    requestedAt: null,
    details: "PRIVATE_ORIGINAL_DETAIL",
    staffResponse: null,
    customer: {
      name: "PRIVATE_CUSTOMER",
      phone: "PRIVATE_PHONE",
      email: "PRIVATE_EMAIL",
    },
    channelOrigin: "WEB",
    contactOptIn: true,
    consentVersion: "terms-v1",
  },
  form: { id: "form", label: "Original form" },
  lines: [
    {
      id: "line",
      offeringId: "offering",
      offeringName: "Original service",
      variantName: "Original variant",
      optionSelections: [{ group: "Size", value: "Original large" }],
      quantity: "0.125",
      details: "Original line detail",
    },
  ],
  currentQuote: null,
}
type PageCallbacks = {
  onOpen: (id: string) => void
  onNext?: () => void
  onRestart?: () => void
}
let callbacks: PageCallbacks | undefined
let shownPage: unknown
let shownOriginal: unknown
type Page = typeof page
standIn("components/mobile/assistant/native-service-request-page-content", {
  NativeServiceRequestPageContent: ({
    page,
    filterLabels,
    ...actions
  }: PageCallbacks & { page: Page; filterLabels: string[] }) => {
    callbacks = actions
    shownPage = page
    return (
      <div>
        {page.items.map((item) => item.customerName).join(" / ")}
        <span>{filterLabels.join(" · ")}</span>
        <span>{page.totalMatching} exact matching requests</span>
      </div>
    )
  },
})
standIn("components/mobile/assistant/native-service-request-content", {
  NativeServiceRequestContent: ({ record }: { record: typeof original }) => {
    shownOriginal = record
    return (
      <div>
        {record.request.details} · {record.request.customer.phone} ·{" "}
        {record.request.customer.email}
      </div>
    )
  },
})
for (const [file, name] of [
  ["native-booking-original-screen", "NativeBookingOriginalScreen"],
  ["native-quote-original-screen", "NativeQuoteOriginalScreen"],
  ["native-service-job-screen", "NativeServiceJobScreen"],
  ["native-service-message-screen", "NativeServiceMessageScreen"],
])
  standIn(`components/mobile/assistant/${file}`, {
    [name]: () => {
      throw Error("Wrong original consumer")
    },
  })
const queries: Array<{
  name: string
  input: unknown
  key: unknown
  options: object
}> = []
let flags: Record<string, boolean> = {}
let pageData: unknown = page
let originalData: unknown = original
function queryOptions(name: string, input: unknown, options: object) {
  return {
    queryKey: [name, input],
    fixtureName: name,
    fixtureInput: input,
    queryFn: async () => {
      throw Error("No network allowed")
    },
    ...options,
  }
}
standIn("trpc/client", {
  useTRPC: () => ({
    serviceAssistantRequests: {
      listPage: {
        queryOptions: (input: unknown, options: object) =>
          queryOptions("listPage", input, options),
      },
      original: {
        queryOptions: (input: unknown, options: object) =>
          queryOptions("original", input, options),
      },
    },
  }),
})
mock.module("@tanstack/react-query", () => ({
  useQuery: (options: {
    queryKey: unknown
    fixtureName: string
    fixtureInput: unknown
  }) => {
    queries.push({
      name: options.fixtureName,
      input: options.fixtureInput,
      key: options.queryKey,
      options,
    })
    return {
      data: options.fixtureName === "listPage" ? pageData : originalData,
      isSuccess: true,
      isError: false,
      isPending: false,
      isFetching: false,
      isPaused: false,
      isFetchedAfterMount: true,
      ...flags,
    }
  },
}))
const { NativeServiceRequestScreen } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/native-service-request-screen"
)
const { NativeServiceOriginalScreen } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/native-service-original-screen"
)
const { generalAnswerRoute } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/general-model"
)
const { readNativeServiceOriginalTarget } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/native-service-target"
)
const { generalAnswerSchema } = await import("../../src/general/contracts")
function reset() {
  profile = { ...owner }
  flags = {}
  pageData = page
  originalData = original
  callbacks = undefined
  shownPage = undefined
  shownOriginal = undefined
  queries.length = 0
  buttons.clear()
  routes.length = 0
}
const render = (target: unknown = pageTarget) =>
  renderToStaticMarkup(<NativeServiceRequestScreen target={target} />)
test("exact protected inputs preserve page filters or original ID without origin/authority override", () => {
  reset()
  expect(render()).toContain("PRIVATE_PAGE_CONTACT")
  expect(queries.at(-1)?.input).toEqual(pageTarget.filters)
  expect(queries.at(-1)?.options).toMatchObject({
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    trpc: { abortOnUnmount: true },
  })
  expect(shownPage).toEqual(page)
  render(exactTarget)
  expect(queries.at(-1)?.input).toEqual({ requestId: "request" })
  expect(shownOriginal).toEqual(original)
})
test("current origin/role/status/identity refusals issue no query and show no private facts", () => {
  for (const patch of [
    { id: "" },
    { businessId: "other" },
    { storeId: "other" },
    { status: "SUSPENDED" },
    { role: "CASHIER" },
    { role: "OPERATOR" },
    { role: "MANAGER", staffAccessMode: "SCOPED" },
  ]) {
    for (const target of [pageTarget, exactTarget]) {
      reset()
      profile = { ...owner, ...patch }
      expect(render(target)).not.toContain("PRIVATE_")
      expect(queries).toEqual([])
    }
  }
  for (const role of ["OWNER", "ADMIN", "MANAGER"]) {
    reset()
    profile.role = role
    expect(render()).toContain("PRIVATE_PAGE_CONTACT")
  }
})
test("malformed targets never read and all cached/fetching/paused/error states withhold contacts and detail", () => {
  for (const target of [
    { ...pageTarget, origin: { tenantId: "foreign", storeId: "store" } },
    { ...pageTarget, filters: { ...pageTarget.filters, limit: 11 } },
    { ...exactTarget, requestId: "r".repeat(129) },
    { ...exactTarget, publicToken: "private" },
    { ...pageTarget, sourceType: "PRESCRIPTION_REQUEST" },
    null,
  ]) {
    reset()
    expect(render(target)).not.toContain("PRIVATE_")
    expect(queries).toEqual([])
  }
  for (const target of [pageTarget, exactTarget])
    for (const flag of [
      { isFetching: true },
      { isPaused: true },
      { isError: true },
      { isFetchedAfterMount: false },
      { isSuccess: false },
      { isPending: true, isSuccess: false },
    ]) {
      reset()
      flags = flag
      expect(render(target)).not.toContain("PRIVATE_")
      expect(shownPage).toBeUndefined()
      expect(shownOriginal).toBeUndefined()
    }
})
test("foreign malformed unsupported partial or duplicate pages do not reach content or imply empty results", () => {
  for (const bad of [
    { ...page, actorUserId: "foreign" },
    { ...page, tenantId: "foreign" },
    { ...page, storeId: "foreign" },
    { ...page, coverage: "product_inquiries" },
    { ...page, totalMatching: "0" },
    { ...page, totalMatching: "unknown" },
    { ...page, nextCursor: "x".repeat(4097) },
    { ...page, items: [row, row] },
    {
      ...page,
      items: Array.from({ length: 11 }, (_, index) => ({
        ...row,
        id: `row-${index}`,
      })),
    },
    { ...page, items: [{ ...row, status: "APPROVED" }] },
    { ...page, items: [{ ...row, status: "QUOTED" }] },
    {
      ...page,
      items: [
        { ...row, originalTarget: { ...exactTarget, requestId: "different" } },
      ],
    },
    {
      ...page,
      items: [
        {
          ...row,
          originalTarget: {
            ...exactTarget,
            origin: { tenantId: "business", storeId: "foreign" },
          },
        },
      ],
    },
    { ...page, items: [{ ...row, secret: "PRIVATE_TOKEN" }] },
  ]) {
    reset()
    pageData = bad
    const html = render()
    expect(html).not.toContain("PRIVATE_")
    expect(html).toContain(
      "No empty result, zero total or different source is inferred",
    )
    expect(shownPage).toBeUndefined()
  }
})
test("foreign malformed unsupported originals withhold full saved contacts and unknown related records", () => {
  for (const bad of [
    { ...original, actorUserId: "foreign" },
    { ...original, storeId: "foreign" },
    { ...original, tenantId: "foreign" },
    { ...original, request: { ...original.request, id: "different" } },
    { ...original, request: { ...original.request, status: "APPROVED" } },
    {
      ...original,
      request: { ...original.request, channelOrigin: "PUBLIC_TOKEN" },
    },
    {
      ...original,
      request: { ...original.request, publicToken: "PRIVATE_TOKEN" },
    },
    { ...original, lines: [{ ...original.lines[0], quantity: "0" }] },
    {
      ...original,
      lines: Array.from({ length: 101 }, () => original.lines[0]),
    },
    {
      ...original,
      currentQuote: {
        quoteId: "quote",
        versionId: "version",
        version: 1,
        status: "UNKNOWN",
        currencyCode: "NGN",
        totalMinor: 100,
        expiresAt: null,
        acceptedOrderId: null,
      },
    },
  ]) {
    reset()
    originalData = bad
    const html = render(exactTarget)
    expect(html).not.toContain("PRIVATE_")
    expect(shownOriginal).toBeUndefined()
    expect(html).toContain(
      "No empty result, zero total or different source is inferred",
    )
  }
})

async function mount(initial: unknown = pageTarget) {
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
  let closed = false
  let target = initial
  return {
    render: async (next: unknown = target) => {
      target = next
      shownPage = undefined
      shownOriginal = undefined
      callbacks = undefined
      buttons.clear()
      await act(async () =>
        mounted.render(<NativeServiceRequestScreen target={target} />),
      )
      return host.toString()
    },
    blur: async (during?: () => void) => {
      await act(async () => {
        for (const entry of focusEntries) entry.blur()
        during?.()
      })
    },
    focus: async () => {
      await act(async () => {
        for (const entry of focusEntries) entry.start()
      })
    },
    cycleFocusBeforeCommit: async (during: () => void) => {
      await act(async () => {
        const entries = [...focusEntries]
        for (const entry of entries) entry.blur()
        for (const entry of entries) entry.start()
        during()
      })
    },
    close: async () => {
      if (closed) return
      closed = true
      await act(async () => mounted.unmount())
    },
  }
}
test("Next preserves exact filters and limit; First removes only cursor; each page and Refresh owns a fresh key", async () => {
  reset()
  const fixture = await mount()
  try {
    await fixture.render()
    const initialKey = queries.at(-1)?.key
    const old = callbacks
    const oldRefresh = buttons.get("Refresh requests")
    await act(async () => callbacks?.onNext?.())
    expect(queries.at(-1)?.input).toEqual({
      ...pageTarget.filters,
      cursor: page.nextCursor,
    })
    expect(queries.at(-1)?.key).not.toEqual(initialKey)
    const afterNext = queries.length
    old?.onOpen("request")
    old?.onNext?.()
    oldRefresh?.()
    expect(routes).toEqual([])
    expect(queries).toHaveLength(afterNext)
    await act(async () => callbacks?.onRestart?.())
    expect(queries.at(-1)?.input).toEqual(pageTarget.filters)
    expect(queries.at(-1)?.input).not.toHaveProperty("cursor")
    const beforeRefresh = queries.at(-1)?.key
    await act(async () => buttons.get("Refresh requests")?.())
    expect(queries.at(-1)?.key).not.toEqual(beforeRefresh)
    expect(queries.at(-1)?.input).toEqual(pageTarget.filters)
  } finally {
    await fixture.close()
  }
})
test("retained row Next and Refresh callbacks stay inert after checking then same object returns", async () => {
  reset()
  const fixture = await mount()
  try {
    await fixture.render()
    const old = callbacks
    const refresh = buttons.get("Refresh requests")
    flags = { isFetching: true }
    expect(await fixture.render()).not.toContain("PRIVATE_")
    flags = {}
    await fixture.render()
    const before = queries.length
    old?.onOpen("request")
    old?.onNext?.()
    refresh?.()
    expect(routes).toEqual([])
    expect(queries).toHaveLength(before)
    callbacks?.onOpen("unknown")
    expect(routes).toEqual([])
    callbacks?.onOpen("request")
    expect(routes).toEqual([
      {
        pathname: "/service-jobs-modal",
        params: { target: JSON.stringify(exactTarget) },
      },
    ])
  } finally {
    await fixture.close()
  }
})
test("scope change unmount and new target permanently fence retained row/paging/refresh callbacks", async () => {
  reset()
  const fixture = await mount()
  try {
    await fixture.render()
    const old = callbacks
    const refresh = buttons.get("Refresh requests")
    profile = { ...owner, storeId: "foreign" }
    await fixture.render()
    const before = queries.length
    old?.onOpen("request")
    old?.onNext?.()
    refresh?.()
    expect(routes).toEqual([])
    expect(queries).toHaveLength(before)
    profile = { ...owner }
    await fixture.render({
      ...pageTarget,
      filters: { ...pageTarget.filters, query: "Different customer" },
    })
    old?.onOpen("request")
    old?.onNext?.()
    refresh?.()
    expect(routes).toEqual([])
    const beforeClose = callbacks
    const lastRefresh = buttons.get("Refresh requests")
    await fixture.close()
    beforeClose?.onOpen("request")
    beforeClose?.onNext?.()
    lastRefresh?.()
    expect(routes).toEqual([])
  } finally {
    await fixture.close()
  }
})
test("blur immediately retires callbacks; focus reentry hides previous facts and owns a new mount", async () => {
  for (const target of [pageTarget, exactTarget]) {
    reset()
    const fixture = await mount(target)
    try {
      await fixture.render()
      const beforeKey = queries.at(-1)?.key
      const old = callbacks
      const refresh = buttons.get(
        target.kind === "service_request_page"
          ? "Refresh requests"
          : "Refresh original",
      )
      const before = queries.length
      await fixture.blur(() => {
        old?.onOpen("request")
        old?.onNext?.()
        refresh?.()
      })
      expect(routes).toEqual([])
      expect(queries).toHaveLength(before)
      expect(await fixture.render()).not.toContain("PRIVATE_")
      flags = { isFetchedAfterMount: false }
      await fixture.focus()
      expect(queries.at(-1)?.key).not.toEqual(beforeKey)
      expect(await fixture.render()).not.toContain("PRIVATE_")
      const afterFocus = queries.length
      old?.onOpen("request")
      old?.onNext?.()
      refresh?.()
      expect(routes).toEqual([])
      expect(queries).toHaveLength(afterFocus)
      flags = {}
      expect(await fixture.render()).toContain("PRIVATE_")
    } finally {
      await fixture.close()
    }
  }
})
test("Next then original and Back preserves the advanced page filters with a fresh focused read", async () => {
  reset()
  const saved = {
    ...pageTarget,
    filters: { ...pageTarget.filters, limit: 4, cursor: "saved-cursor-A" },
  }
  pageData = { ...page, nextCursor: "advanced-cursor-B" }
  const fixture = await mount(saved)
  try {
    await fixture.render()
    expect(queries.at(-1)?.input).toEqual(saved.filters)
    await act(async () => callbacks?.onNext?.())
    const advancedFilters = { ...saved.filters, cursor: "advanced-cursor-B" }
    expect(queries.at(-1)?.input).toEqual(advancedFilters)
    const advancedMount = queries.at(-1)?.key
    callbacks?.onOpen("request")
    expect(routes).toEqual([
      {
        pathname: "/service-jobs-modal",
        params: { target: JSON.stringify(exactTarget) },
      },
    ])
    routes.length = 0
    const old = callbacks
    const oldRefresh = buttons.get("Refresh requests")
    const beforeBlur = queries.length
    await fixture.blur(() => {
      old?.onOpen("request")
      old?.onNext?.()
      old?.onRestart?.()
      oldRefresh?.()
    })
    expect(queries).toHaveLength(beforeBlur)
    expect(routes).toEqual([])
    expect(await fixture.render()).not.toContain("PRIVATE_")
    flags = { isFetchedAfterMount: false }
    await fixture.focus()
    expect(queries.at(-1)?.input).toEqual(advancedFilters)
    expect(queries.at(-1)?.key).not.toEqual(advancedMount)
    expect(await fixture.render()).not.toContain("PRIVATE_")
    const beforeOld = queries.length
    await act(async () => {
      old?.onOpen("request")
      old?.onNext?.()
      old?.onRestart?.()
      oldRefresh?.()
    })
    expect(queries).toHaveLength(beforeOld)
    expect(routes).toEqual([])
    flags = {}
    pageData = { ...page, nextCursor: "continued-cursor-C" }
    await fixture.render()
    await act(async () => callbacks?.onNext?.())
    expect(queries.at(-1)?.input).toEqual({
      ...saved.filters,
      cursor: "continued-cursor-C",
    })
    await act(async () => callbacks?.onRestart?.())
    const { cursor: _cursor, ...firstFilters } = saved.filters
    expect(queries.at(-1)?.input).toEqual(firstFilters)
    expect(queries.at(-1)?.input).not.toHaveProperty("cursor")
  } finally {
    await fixture.close()
  }
})
test("batched blur and focus cannot revive retained page callbacks before the fresh read commits", async () => {
  for (const action of ["row", "next", "restart", "refresh"] as const) {
    reset()
    const saved = {
      ...pageTarget,
      filters: { ...pageTarget.filters, cursor: "saved-cursor-A" },
    }
    const fixture = await mount(saved)
    try {
      await fixture.render()
      const old = callbacks
      const oldRefresh = buttons.get("Refresh requests")
      const beforeKey = queries.at(-1)?.key
      const beforeQueries = queries.length
      await fixture.cycleFocusBeforeCommit(() => {
        if (action === "row") old?.onOpen("request")
        if (action === "next") old?.onNext?.()
        if (action === "restart") old?.onRestart?.()
        if (action === "refresh") oldRefresh?.()
        expect(routes).toEqual([])
        expect(queries).toHaveLength(beforeQueries)
      })
      expect(routes).toEqual([])
      expect(queries.at(-1)?.input).toEqual(saved.filters)
      expect(queries.at(-1)?.key).not.toEqual(beforeKey)
    } finally {
      await fixture.close()
    }
  }
})
test("original Refresh callback cannot revive after checking then same object, and current Refresh remounts", async () => {
  reset()
  const fixture = await mount(exactTarget)
  try {
    await fixture.render()
    const oldRefresh = buttons.get("Refresh original")
    flags = { isFetching: true }
    await fixture.render()
    flags = {}
    await fixture.render()
    const before = queries.length
    await act(async () => oldRefresh?.())
    expect(queries).toHaveLength(before)
    const key = queries.at(-1)?.key
    await act(async () => buttons.get("Refresh original")?.())
    expect(queries.at(-1)?.key).not.toEqual(key)
  } finally {
    await fixture.close()
  }
})
test("batched original blur and focus keeps private facts withheld until the fresh mount and old Refresh stays retired", async () => {
  reset()
  const fixture = await mount(exactTarget)
  try {
    await fixture.render()
    const old = buttons.get("Refresh original")
    const before = queries.length
    const previousKey = queries.at(-1)?.key
    flags = { isFetchedAfterMount: false }
    await fixture.cycleFocusBeforeCommit(() => {
      old?.()
      expect(queries).toHaveLength(before)
    })
    expect(queries.at(-1)?.key).not.toEqual(previousKey)
    expect(await fixture.render()).not.toContain("PRIVATE_")
    const checkingReads = queries.length
    await act(async () => old?.())
    expect(queries).toHaveLength(checkingReads)
    flags = {}
    expect(await fixture.render()).toContain("PRIVATE_ORIGINAL_DETAIL")
    const freshKey = queries.at(-1)?.key
    await act(async () => buttons.get("Refresh original")?.())
    expect(queries.at(-1)?.key).not.toEqual(freshKey)
  } finally {
    await fixture.close()
  }
})
test("retained original Refresh is inert after scope loss, replacement target and unmount", async () => {
  reset()
  const fixture = await mount(exactTarget)
  try {
    await fixture.render()
    const old = buttons.get("Refresh original")
    profile = { ...owner, role: "CASHIER" }
    await fixture.render()
    const before = queries.length
    await act(async () => old?.())
    expect(queries).toHaveLength(before)
    profile = { ...owner }
    originalData = {
      ...original,
      request: { ...original.request, id: "new-request" },
    }
    await fixture.render({ ...exactTarget, requestId: "new-request" })
    const afterReplacement = queries.length
    await act(async () => old?.())
    expect(queries).toHaveLength(afterReplacement)
    expect(queries.at(-1)?.input).toEqual({ requestId: "new-request" })
    const last = buttons.get("Refresh original")
    await fixture.close()
    await act(async () => last?.())
    expect(queries).toHaveLength(afterReplacement)
  } finally {
    await fixture.close()
  }
})
test("refused-state Retry does not revive after checking and re-refusal, while current Retry remains usable", async () => {
  for (const target of [pageTarget, exactTarget]) {
    reset()
    flags = { isError: true }
    const fixture = await mount(target)
    try {
      await fixture.render()
      const oldRetry = buttons.get("Try again")
      flags = { isFetching: true }
      await fixture.render()
      flags = { isError: true }
      await fixture.render()
      const before = queries.length
      await act(async () => oldRetry?.())
      expect(queries).toHaveLength(before)
      const key = queries.at(-1)?.key
      await act(async () => buttons.get("Try again")?.())
      expect(queries.at(-1)?.key).not.toEqual(key)
      expect(shownPage).toBeUndefined()
      expect(shownOriginal).toBeUndefined()
    } finally {
      await fixture.close()
    }
  }
})
test("an authorized empty later page retains exact matching count without inventing zero; optional missing status follows protected authority", () => {
  reset()
  profile.status = undefined
  pageData = { ...page, items: [] }
  render({
    ...pageTarget,
    filters: { ...pageTarget.filters, cursor: "later-page" },
  })
  expect(shownPage).toEqual({ ...page, items: [] })
  expect(shownPage).toHaveProperty("totalMatching", "20")
  expect(queries.at(-1)?.input).toEqual({
    ...pageTarget.filters,
    cursor: "later-page",
  })
})
test("a refused saved cursor can recover to a fresh first page; retained recovery callbacks cannot revive", async () => {
  reset()
  const saved = {
    ...pageTarget,
    filters: {
      ...pageTarget.filters,
      limit: 3,
      cursor: "refused-saved-cursor",
    },
  }
  flags = { isError: true }
  const fixture = await mount(saved)
  try {
    expect(await fixture.render()).not.toContain("PRIVATE_")
    expect(queries.at(-1)?.input).toEqual(saved.filters)
    const beforeChecking = buttons.get("Back to first page")
    expect(beforeChecking).toBeDefined()
    flags = { isPaused: true }
    expect(await fixture.render()).toContain(
      "Connect to check current request access",
    )
    flags = { isError: true }
    await fixture.render()
    const beforeOld = queries.length
    await act(async () => beforeChecking?.())
    expect(queries).toHaveLength(beforeOld)
    const beforeRestartKey = queries.at(-1)?.key
    const first = buttons.get("Back to first page")
    flags = { isFetchedAfterMount: false }
    await act(async () => first?.())
    const { cursor: _cursor, ...firstFilters } = saved.filters
    expect(queries.at(-1)?.input).toEqual(firstFilters)
    expect(queries.at(-1)?.input).not.toHaveProperty("cursor")
    expect(queries.at(-1)?.key).not.toEqual(beforeRestartKey)
    expect(await fixture.render()).not.toContain("PRIVATE_")
    flags = {}
    expect(await fixture.render()).toContain("PRIVATE_PAGE_CONTACT")
    expect(queries.at(-1)?.input).toEqual(firstFilters)
    const firstPageReads = queries.length
    await act(async () => first?.())
    expect(queries).toHaveLength(firstPageReads)
    expect(buttons.has("Back to first page")).toBe(false)

    // A new refused saved page supplies a distinct recovery callback, which
    // must not mutate the visible workspace after authority is lost/unmounted.
    flags = { isError: true }
    await fixture.render({
      ...saved,
      filters: { ...saved.filters, cursor: "another-refused-cursor" },
    })
    const beforeScope = buttons.get("Back to first page")
    expect(beforeScope).toBeDefined()
    profile = { ...owner, storeId: "foreign" }
    await fixture.render()
    const foreignReads = queries.length
    await act(async () => beforeScope?.())
    expect(queries).toHaveLength(foreignReads)
    profile = { ...owner }
    await fixture.render()
    const beforeUnmount = buttons.get("Back to first page")
    expect(beforeUnmount).toBeDefined()
    await fixture.close()
    const unmountedReads = queries.length
    await act(async () => beforeUnmount?.())
    expect(queries).toHaveLength(unmountedReads)
    expect(routes).toEqual([])
  } finally {
    await fixture.close()
  }
  reset()
  flags = { isError: true }
  render(exactTarget)
  expect(buttons.has("Back to first page")).toBe(false)
})
test("saved page and exact answer targets route into actual protected request dispatch including a4096 cursor", () => {
  for (const target of [
    exactTarget,
    {
      ...pageTarget,
      filters: { ...pageTarget.filters, cursor: "c".repeat(4096) },
    },
  ]) {
    reset()
    const answer = generalAnswerSchema.parse({
      id: "saved-answer",
      title: "Saved request",
      value: "Canonical source",
      detail: "Open exact source",
      scope: "Original Store",
      asOf: at,
      target,
    })
    expect(generalAnswerRoute(answer.target)).toBeNull()
    expect(
      generalAnswerRoute(answer.target, {
        tenantId: "foreign",
        storeId: "store",
      }),
    ).toBeNull()
    const route = generalAnswerRoute(answer.target, origin)
    expect(route?.pathname).toBe("/service-jobs-modal")
    if (!route || !("target" in route.params))
      throw Error("Exact target route missing")
    const raw = route.params.target
    expect(raw.length).toBeLessThanOrEqual(8192)
    expect(readNativeServiceOriginalTarget(raw)).toEqual(target)
    const html = renderToStaticMarkup(<NativeServiceOriginalScreen raw={raw} />)
    expect(html).toContain(
      target.kind === "service_request"
        ? "PRIVATE_ORIGINAL_DETAIL"
        : "PRIVATE_PAGE_CONTACT",
    )
    expect(queries.at(-1)?.input).toEqual(
      target.kind === "service_request"
        ? { requestId: "request" }
        : target.filters,
    )
  }
})
