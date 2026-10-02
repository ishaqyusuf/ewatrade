import { expect, mock, test } from "bun:test"
import React from "react"

const supplier = { id: "supplier-1", code: "NSF-014", name: "Northside Foods" }
const book = { id: "book-1", currencyCode: "NGN" } as never
const statement = {
  supplier,
  currencyCode: "NGN",
  snapshotSequence: "248",
  payableMinor: "248000000",
  advanceMinor: "35000000",
  data: [
    {
      id: "entry-1",
      kind: "OPENING",
      side: "CREDIT",
      amountMinor: "210000000",
      description: "Opening payable",
      effectiveAt: new Date("2026-04-01T00:00:00.000Z"),
      recordedAt: new Date("2026-04-01T00:00:00.000Z"),
      actorUserId: "actor-1",
      journalEntryId: "journal-1",
      sequence: "208",
      moneyAccountId: null,
      reversalOfId: null,
      reversal: null,
    },
  ],
  nextCursor: null,
}
const aging = {
  supplier,
  currencyCode: "NGN",
  asOfDate: "2026-10-02",
  snapshotSequence: "248",
  dateBasis: "UTC",
  controlScope: "SUPPLIER_ALL_STORES",
  payableMinor: "248000000",
  advanceMinor: "35000000",
  buckets: [
    { bucket: "NOT_DUE", amountMinor: "110000000", sourceCount: 1 },
    { bucket: "DUE_TODAY", amountMinor: "18000000", sourceCount: 1 },
    { bucket: "OVERDUE_1_30", amountMinor: "76000000", sourceCount: 1 },
    { bucket: "OVERDUE_31_60", amountMinor: "44000000", sourceCount: 1 },
    { bucket: "OVERDUE_61_90", amountMinor: "0", sourceCount: 0 },
    { bucket: "OVERDUE_91_PLUS", amountMinor: "0", sourceCount: 0 },
    { bucket: "UNDATED", amountMinor: "0", sourceCount: 0 },
  ],
  sourceLimit: 1000,
  sourcesRead: 4,
  outstandingSourceCount: 4,
  data: [
    {
      sourceEntryId: "entry-1",
      sequence: "241",
      billId: "bill-1",
      kind: "PURCHASE",
      storeId: null,
      reference: "PO-8821",
      description: "Produce",
      incurredAt: new Date("2026-09-10T00:00:00.000Z"),
      dueAt: new Date("2026-09-14T00:00:00.000Z"),
      bucket: "OVERDUE_1_30",
      daysOverdue: 18,
      originalMinor: "76000000",
      outstandingMinor: "76000000",
    },
  ],
  nextCursor: null,
}

const fakeTrpc = {
  finance: {
    suppliers: { infiniteQueryOptions: () => ({ kind: "directory" }) },
    supplierStatement: { queryOptions: () => ({ kind: "statement" }) },
    supplierPayableAging: { queryOptions: () => ({ kind: "aging" }) },
  },
}
let scenario = {
  offline: false,
  fetching: false,
  fetchStatus: "idle" as "idle" | "fetching" | "paused",
  denied: false,
  hasNextPage: false,
  agingDate: "2026-10-02",
}
const view = ({ children }: { children?: React.ReactNode }) =>
  React.createElement("div", null, children)
const button = ({ children }: { children?: React.ReactNode }) =>
  React.createElement("button", { type: "button" }, children)

mock.module("@/trpc/client", () => ({ useTRPC: () => fakeTrpc }))
mock.module("@/store/operationalModeStore", () => ({
  useOperationalModeStore: () => scenario.offline,
}))
mock.module("@/components/mobile/action-button", () => ({
  ActionButton: button,
}))
mock.module("@/components/mobile/form-field", () => ({
  FormField: ({ label, value }: { label: string; value: string }) =>
    React.createElement(
      "label",
      null,
      label,
      React.createElement("input", { value, readOnly: true }),
    ),
}))
mock.module("@/components/mobile/status-banner", () => ({
  StatusBanner: ({ title, message }: { title?: string; message: string }) =>
    React.createElement("aside", null, title, message),
}))
mock.module("@/components/ui/pressable", () => ({ Pressable: button }))
mock.module("@/components/ui/text", () => ({ Text: view }))
mock.module("react-native", () => ({
  View: view,
  FlatList: ({
    data = [],
    renderItem,
    ListHeaderComponent,
    ListFooterComponent,
  }: {
    data?: unknown[]
    renderItem: (args: { item: never; index: number }) => React.ReactNode
    ListHeaderComponent?: React.ReactNode
    ListFooterComponent?: React.ReactNode
  }) =>
    React.createElement(
      "div",
      null,
      ListHeaderComponent,
      ...data.map((item, index) => renderItem({ item: item as never, index })),
      ListFooterComponent,
    ),
}))
mock.module("@tanstack/react-query", () => ({
  useQuery: (options: { kind: string }) => ({
    data:
      options.kind === "aging"
        ? { ...aging, asOfDate: scenario.agingDate }
        : statement,
    dataUpdatedAt: Date.now() + 60_000,
    isFetchedAfterMount: true,
    isSuccess: !scenario.denied,
    isFetching: scenario.fetching,
    fetchStatus: scenario.fetchStatus,
    isError: scenario.denied,
    error: { message: "Access was revoked." },
    isPending: false,
    isRefetching: scenario.fetching,
    refetch: () =>
      Promise.resolve({
        isSuccess: !scenario.denied,
        fetchStatus: scenario.fetchStatus,
      }),
  }),
  useQueryClient: () => ({
    fetchQuery: () => Promise.resolve(statement),
    setQueryData: () => undefined,
    removeQueries: () => undefined,
  }),
  useInfiniteQuery: () => ({
    data: { pages: [{ data: [supplier], nextCursor: null }] },
    dataUpdatedAt: Date.now() + 60_000,
    isFetchedAfterMount: true,
    isSuccess: !scenario.denied,
    isFetching: scenario.fetching,
    fetchStatus: scenario.fetchStatus,
    isError: scenario.denied,
    error: { message: "Access was revoked." },
    isPending: false,
    isRefetching: scenario.fetching,
    isFetchingNextPage: scenario.fetching,
    hasNextPage: scenario.hasNextPage,
    refetch: () =>
      Promise.resolve({
        isSuccess: !scenario.denied,
        fetchStatus: scenario.fetchStatus,
      }),
    fetchNextPage: () =>
      Promise.resolve({ isSuccess: true, fetchStatus: "idle" }),
  }),
}))

test("renders the real supplier statement and aging component trees with scoped read data", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server")
  const {
    SupplierFinanceDetail,
    SupplierFinancePageControls,
    SupplierFinanceScreen,
  } = await import("./supplier-finance-screen")
  const render = (initialView: "statement" | "aging") =>
    renderToStaticMarkup(
      React.createElement(SupplierFinanceDetail, {
        book,
        actorUserId: "actor-1",
        tenantId: "tenant-1",
        supplier,
        onBack: () => undefined,
        initialView,
      }),
    )

  scenario = { ...scenario, hasNextPage: true }
  const directoryMarkup = renderToStaticMarkup(
    React.createElement(SupplierFinanceScreen, {
      book,
      actorUserId: "actor-1",
      tenantId: "tenant-1",
      supplier,
      onBack: () => undefined,
    }),
  )
  expect(directoryMarkup).toContain("Suppliers")
  // Effects do not run in this static renderer, so cached query data remains
  // concealed until the protected-read transition tests authorize it.
  expect(directoryMarkup).not.toContain("Northside Foods")
  expect(directoryMarkup).not.toContain("Load more suppliers")

  const statementMarkup = render("statement")
  expect(statementMarkup).not.toContain("Opening payable")
  expect(statementMarkup).not.toContain("2,480,000.00")

  const agingMarkup = render("aging")
  expect(agingMarkup).toContain("Payable aging")
  expect(agingMarkup).not.toContain("1–30 days overdue")
  expect(agingMarkup).not.toContain("PO-8821")
  expect(agingMarkup).not.toContain("2,480,000.00")

  for (const blocked of [
    { ...scenario, offline: true },
    { ...scenario, offline: false, fetchStatus: "paused" as const },
    {
      ...scenario,
      offline: false,
      fetching: true,
      fetchStatus: "fetching" as const,
    },
    { ...scenario, offline: false, denied: true },
  ]) {
    scenario = blocked
    const cachedStatement = render("statement")
    expect(cachedStatement).not.toContain("Opening payable")
    expect(cachedStatement).not.toContain("2,480,000.00")
    const cachedAging = render("aging")
    expect(cachedAging).not.toContain("PO-8821")
    expect(cachedAging).not.toContain("2,480,000.00")
    const blockedDirectory = renderToStaticMarkup(
      React.createElement(SupplierFinanceScreen, {
        book,
        actorUserId: "actor-1",
        tenantId: "tenant-1",
        supplier,
        onBack: () => undefined,
      }),
    )
    expect(blockedDirectory).not.toContain("Load more suppliers")
  }

  scenario = {
    ...scenario,
    offline: false,
    denied: false,
    fetching: false,
    fetchStatus: "idle",
    agingDate: "2026-10-01",
  }
  const changedCutoff = render("aging")
  expect(changedCutoff).not.toContain("PO-8821")
  expect(changedCutoff).not.toContain("2,480,000.00")

  const previousOnly = renderToStaticMarkup(
    React.createElement(SupplierFinancePageControls, {
      visible: true,
      hasNext: false,
      hasPrevious: true,
      nextLabel: "Next entries",
      previousLabel: "Previous entries",
      onNext: () => undefined,
      onPrevious: () => undefined,
    }),
  )
  expect(previousOnly).toContain("Previous entries")
  const hiddenPrevious = renderToStaticMarkup(
    React.createElement(SupplierFinancePageControls, {
      visible: false,
      hasNext: false,
      hasPrevious: true,
      nextLabel: "Next entries",
      previousLabel: "Previous entries",
      onNext: () => undefined,
      onPrevious: () => undefined,
    }),
  )
  expect(hiddenPrevious).not.toContain("Previous entries")

  scenario = {
    ...scenario,
    offline: false,
    fetching: false,
    fetchStatus: "idle",
    denied: false,
    agingDate: "2026-10-02",
  }
  const retainedStatement = render("statement")
  expect(retainedStatement).not.toContain("Opening payable")
  expect(retainedStatement).not.toContain("2,480,000.00")
  const retainedAging = render("aging")
  expect(retainedAging).not.toContain("PO-8821")
  expect(retainedAging).not.toContain("2,480,000.00")
})
