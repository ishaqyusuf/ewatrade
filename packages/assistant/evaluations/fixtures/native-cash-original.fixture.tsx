import { expect, mock, test } from "bun:test"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
// Actual read-only count consumer/freshness; native primitives, query transport
// and the Finance gate stand in. Root verifies the actual gate independently.
const root = new URL("../../../../", import.meta.url)
function standIn(path: string, value: Record<string, unknown>) {
  mock.module(new URL(`apps/mobile/src/${path}`, root).pathname, () => value)
}
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
  }: { children: ReactNode; onPress: () => void }) => {
    buttons.set(String(children), onPress)
    return <button type="button">{children}</button>
  },
})
let profile = {
  id: "actor",
  businessId: "business",
  storeId: "store",
  role: "OWNER",
  staffAccessMode: "LEGACY",
  status: "ACTIVE" as string | undefined,
}
standIn("hooks/use-auth", { useAuthContext: () => ({ profile }) })
const gateInputs: { expectedBookId?: string; requireOnline?: boolean }[] = []
let offline = false
let workspace = {
  actorUserId: "actor",
  tenantId: "business",
  book: { id: "book", currencyCode: "NGN" },
}
standIn("components/mobile/finance/finance-workspace-gate", {
  FinanceWorkspaceGate: ({
    children,
    expectedBookId,
    requireOnline,
  }: {
    children: (value: typeof workspace) => ReactNode
    expectedBookId?: string
    requireOnline?: boolean
  }) => {
    gateInputs.push({ expectedBookId, requireOnline })
    return offline || !["OWNER", "ADMIN"].includes(profile.role) ? (
      <div>Finance gate unavailable</div>
    ) : (
      <div>{children(workspace)}</div>
    )
  },
})
const inputs: unknown[] = []
const keys: unknown[] = []
standIn("trpc/client", {
  useTRPC: () => ({
    finance: {
      cashCount: {
        queryOptions: (input: unknown, options: object) => {
          inputs.push(input)
          return {
            queryKey: ["cashCount", input],
            queryFn: async () => {
              throw Error("No network permitted")
            },
            ...options,
          }
        },
      },
    },
  }),
})
const original = {
  id: "count",
  bookId: "book",
  currencyCode: "NGN",
  accountId: "private-account",
  accountName: "Shop cash now",
  asOf: new Date("2026-10-15T10:00:00.123Z"),
  recordedAt: new Date("2026-10-15T10:01:00.000Z"),
  actorUserId: "recorded-actor",
  reference: "Evening count",
  snapshotSequence: "10",
  currentSnapshotSequence: "18",
  expectedBalanceMinor: "510000",
  observedBalanceMinor: "500000",
  differenceMinor: "-10000",
  status: "REVIEW_REQUIRED",
  reviewRequired: true,
  adjustment: {
    id: "private-adjustment",
    description: "Separate till correction",
    recordedAt: new Date("2026-10-15T11:00:00.000Z"),
    reversal: {
      id: "recorded-reversal",
      recordedAt: new Date("2026-10-15T12:00:00.000Z"),
    },
  },
  rawJson: { secret: "NEVER_RENDER" },
  token: "NEVER_RENDER",
}
function ready(data: unknown = original) {
  return {
    isError: false,
    isSuccess: true,
    isFetching: false,
    isPaused: false,
    isFetchedAfterMount: true,
    data,
  }
}
let query = ready()
mock.module("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: unknown }) => {
    keys.push(options.queryKey)
    return query
  },
}))
const { NativeCashOriginalScreen } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/native-cash-original-screen"
)
function render(bookId = "book", countId = "count") {
  buttons.clear()
  return renderToStaticMarkup(
    createElement(NativeCashOriginalScreen, { bookId, countId }),
  )
}
function reset() {
  profile = {
    id: "actor",
    businessId: "business",
    storeId: "store",
    role: "OWNER",
    staffAccessMode: "LEGACY",
    status: "ACTIVE",
  }
  workspace = {
    actorUserId: "actor",
    tenantId: "business",
    book: { id: "book", currencyCode: "NGN" },
  }
  offline = false
  query = ready()
  gateInputs.length = 0
  inputs.length = 0
}
test("requires online original Book gate and reads only exact cash-count identity", () => {
  reset()
  const html = render()
  expect(gateInputs).toEqual([{ expectedBookId: "book", requireOnline: true }])
  expect(inputs).toEqual([{ bookId: "book", countId: "count" }])
  expect(html).toContain("Original cash observation")
  expect([...buttons.keys()]).toEqual(["Refresh original count"])
})
test("immutable physical/posting/difference facts remain distinct from current labels and review", () => {
  reset()
  const html = render()
  for (const text of [
    "₦5,000.00",
    "₦5,100.00",
    "-₦100.00",
    "Evening count",
    "2026-10-15T10:00:00.123Z",
    "Original ledger snapshot",
    "Current ledger snapshot",
    "Shop cash now",
    "current account label, not an original historical name snapshot",
    "later postings changed account history",
    "Current cash balance",
    "Unavailable in this original count read",
  ])
    expect(html).toContain(text)
  expect(html).not.toContain("NEVER_RENDER")
  expect(html).not.toContain("private-account")
})
test("separate adjustment/reversal history remains read-only and retains the original count", () => {
  reset()
  const html = render()
  for (const text of [
    "Separate adjustment history",
    "Separate till correction",
    "recorded-reversal",
    "2026-10-15T12:00:00.000Z",
    "does not replace or edit the original count",
    "performs no adjustment, reversal, stock closeout",
  ])
    expect(html).toContain(text)
  expect([...buttons.keys()]).toEqual(["Refresh original count"])
})
test("zero count and matched basis never certify complete reconciliation or fabricate an adjustment", () => {
  reset()
  query = ready({
    ...original,
    observedBalanceMinor: "0",
    expectedBalanceMinor: "0",
    differenceMinor: "0",
    status: "MATCHED",
    reviewRequired: false,
    adjustment: null,
  })
  const html = render()
  expect(html).toContain("₦0.00")
  expect(html).toContain("does not certify complete operational reconciliation")
  expect(html).toContain("No adjustment is recorded")
  expect(html).not.toContain("Separate till correction")
})
test("stale/refetching/paused/denied or not-fetched-after-mount original facts are withheld", () => {
  for (const state of [
    { isFetching: true },
    { isPaused: true },
    { isError: true },
    { isFetchedAfterMount: false },
  ]) {
    reset()
    query = { ...ready(), ...state }
    const html = render()
    expect(html).not.toContain("Evening count")
    expect(html).not.toContain("Shop cash now")
    expect(html).not.toContain("₦5,000.00")
    expect(html).not.toContain("Separate till correction")
  }
})
test("foreign count/Book/currency and changed workspace actor or business refuse facts", () => {
  for (const patch of [
    { id: "foreign" },
    { bookId: "foreign" },
    { currencyCode: "USD" },
  ]) {
    reset()
    query = ready({ ...original, ...patch })
    expect(render()).toContain("exact original count is unavailable")
    expect(render()).not.toContain("Evening count")
  }
  for (const patch of [
    { actorUserId: "foreign" },
    { tenantId: "foreign" },
    { book: { id: "foreign", currencyCode: "NGN" } },
  ]) {
    reset()
    workspace = { ...workspace, ...patch }
    const html = render()
    expect(html).toContain("actor, business or original Finance Book changed")
    expect(inputs).toEqual([])
  }
})
test("offline/restricted simulated gate and invalid current profile never issue a count read", () => {
  reset()
  offline = true
  expect(render()).toContain("Finance gate unavailable")
  expect(inputs).toEqual([])
  reset()
  profile.role = "CASHIER"
  render()
  expect(inputs).toEqual([])
  for (const patch of [
    { id: "" },
    { businessId: "" },
    { status: "SUSPENDED" },
  ]) {
    reset()
    profile = { ...profile, ...patch }
    render()
    expect(inputs).toEqual([])
  }
  reset()
  profile.status = undefined
  expect(render()).toContain("Evening count")
})
test("exact big integer strings preserve cents while malformed money stays unavailable", () => {
  reset()
  query = ready({ ...original, observedBalanceMinor: "9223372036854775807" })
  expect(render()).toContain("₦92,233,720,368,547,758.07")
  for (const value of [
    null,
    "1.5",
    "bad",
    Number.MAX_SAFE_INTEGER + 1,
    Number.POSITIVE_INFINITY,
  ]) {
    reset()
    query = ready({
      ...original,
      observedBalanceMinor: value,
      expectedBalanceMinor: value,
      differenceMinor: value,
    })
    const html = render()
    expect(html).toContain("Amount unavailable")
    expect(html).not.toContain("₦NaN")
    expect(html).not.toContain("₦∞")
  }
})
test("reopen owns a new query cache identity; malformed original target never reads", () => {
  reset()
  render()
  const before = keys.at(-1)
  render()
  expect(keys.at(-1)).not.toEqual(before)
  reset()
  expect(render("", "")).toContain("original cash-count link")
  expect(inputs).toEqual([])
})
