import { expect, mock, test } from "bun:test"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
// Actual day consumer and scope/snapshot/freshness guards; native furniture,
// transport and Finance gate stand in. No connected report or close is run.
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
let offline = false
let workspace = {
  actorUserId: "actor",
  tenantId: "business",
  book: { id: "book", currencyCode: "NGN" },
}
const gateInputs: { expectedBookId?: string; requireOnline?: boolean }[] = []
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
const calls: { name: string; input: unknown; enabled?: boolean }[] = []
const keys: unknown[] = []
function procedure(name: string) {
  return {
    queryOptions: (input: unknown, options: object) => {
      calls.push({ name, input, ...options })
      return {
        queryKey: [name, input],
        queryFn: async () => {
          throw Error("No network permitted")
        },
        ...options,
      }
    },
  }
}
standIn("trpc/client", {
  useTRPC: () => ({
    finance: {
      periodCloseChecklist: procedure("checklist"),
      reports: procedure("report"),
    },
  }),
})
const through = "2026-10-14T23:59:59.999Z"
const snapshotSequence = "9007199254740993"
const trialBalance = {
  debitMinor: "1000",
  creditMinor: "1000",
  differenceMinor: "0",
  balanced: true,
  accounts: [],
}
const balanceSheet = {
  assetsMinor: "1000",
  liabilitiesMinor: "100",
  postedEquityMinor: "500",
  unclosedEarningsMinor: "400",
  totalEquityMinor: "900",
  liabilitiesAndEquityMinor: "1000",
  differenceMinor: "0",
  balanced: true,
  assets: [],
  liabilities: [],
  equity: [],
}
const checklist = {
  bookId: "book",
  currencyCode: "NGN",
  from: new Date("2026-10-01T00:00:00.000Z"),
  through: new Date(through),
  closedThrough: null,
  snapshotSequence,
  coverage: "POSTED_FINANCE_ENTRIES",
  completeness: "INCOMPLETE_SOURCE_COVERAGE",
  coverageGaps: ["OPENING_BALANCE_RECONCILIATION", "INVENTORY_COSTS"],
  dateLockEligible: true,
  operationallyReconciled: false,
  checks: [
    {
      id: "POSTED_TRIAL_BALANCE",
      label: "Balance posted journals",
      status: "PASS",
      explanation: "NEVER_RENDER_RAW_TRIAL",
      accountIds: ["private-account"],
    },
    {
      id: "CASH_RECONCILIATION",
      label: "Review counted cash",
      status: "REVIEW_REQUIRED",
      explanation: "A physical cutoff count is missing.",
      accountIds: ["private-account"],
    },
    {
      id: "YEAR_END_EARNINGS",
      label: "Review retained earnings",
      status: "BLOCKED",
      explanation: "Year-end must be reviewed separately.",
      accountIds: [],
    },
  ],
  cash: [
    {
      accountId: "private-account",
      name: "Shop cash",
      closingBalanceMinor: "20000",
      countId: null,
      observedBalanceMinor: null,
      countSnapshotSequence: null,
      originalExpectedBalanceMinor: null,
      basisVerified: false,
      status: "REVIEW_REQUIRED",
    },
  ],
  cashCountCoverageComplete: false,
  cashCommandCoverageComplete: false,
  cashCountReviewLimit: 200,
  trialBalance,
  balanceSheet,
  privateField: "NEVER_RENDER",
}
const report = {
  bookId: "book",
  currencyCode: "NGN",
  from: new Date("2026-10-14T00:00:00.000Z"),
  through: new Date(through),
  snapshotSequence,
  coverage: "POSTED_FINANCE_ENTRIES",
  completeness: "INCOMPLETE_SOURCE_COVERAGE",
  coverageGaps: ["COMMERCIAL_SALES_AND_CUSTOMER_PAYMENTS"],
  profitAndLoss: {
    revenueMinor: "100000",
    expensesMinor: "10000",
    costOfSalesMinor: "40000",
    grossProfitMinor: "60000",
    netProfitMinor: "50000",
    accounts: [],
  },
  cashFlow: {
    openingMinor: "10000",
    closingMinor: "25000",
    operatingMinor: "10000",
    financingMinor: "5000",
    transfersAndClearingMinor: "0",
    openingAdjustmentsMinor: "0",
    unclassifiedMinor: "0",
    netChangeMinor: "15000",
    differenceMinor: "0",
    reconciled: true,
    classificationComplete: true,
    groups: [],
  },
  trialBalance,
  balanceSheet,
  privateField: "NEVER_RENDER",
}
function ready(data: unknown) {
  return {
    isError: false,
    isSuccess: true,
    isFetching: false,
    isPaused: false,
    isFetchedAfterMount: true,
    data,
  }
}
let checklistQuery = ready(checklist)
let reportQuery = ready(report)
mock.module("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: unknown[] }) => {
    keys.push(options.queryKey)
    return options.queryKey[0] === "checklist" ? checklistQuery : reportQuery
  },
}))
const { NativeDayReviewScreen } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/native-day-review-screen"
)
function render(bookId = "book", cutoff = through) {
  buttons.clear()
  return renderToStaticMarkup(
    createElement(NativeDayReviewScreen, { bookId, through: cutoff }),
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
  checklistQuery = ready(checklist)
  reportQuery = ready(report)
  calls.length = 0
  gateInputs.length = 0
}
test("pinned online Book gate feeds checklist then exact same snapshot/from/cutoff report", () => {
  reset()
  const html = render()
  expect(gateInputs).toEqual([{ expectedBookId: "book", requireOnline: true }])
  expect(
    calls.map(({ name, input, enabled }) => ({
      name,
      input,
      ...(enabled === undefined ? {} : { enabled }),
    })),
  ).toEqual([
    {
      name: "checklist",
      input: { bookId: "book", through: new Date(through) },
    },
    {
      name: "report",
      input: {
        bookId: "book",
        from: new Date("2026-10-14T00:00:00.000Z"),
        through: new Date(through),
        snapshotSequence,
      },
      enabled: true,
    },
  ])
  expect(html).toContain(snapshotSequence)
  expect(html).toContain("Day review")
  expect([...buttons.keys()]).toEqual(["Refresh day review"])
})
test("day start clamps to later checklist start without changing the saved cutoff", () => {
  reset()
  const from = new Date("2026-10-14T11:12:13.123Z")
  checklistQuery = ready({ ...checklist, from })
  reportQuery = ready({ ...report, from })
  expect(render()).toContain("2026-10-14T11:12:13.123Z")
  expect(calls.at(-1)?.input).toEqual({
    bookId: "book",
    from,
    through: new Date(through),
    snapshotSequence,
  })
})
test("all check explanations, cash coverage limits and posted source gaps remain explicit", () => {
  reset()
  const html = render()
  for (const text of [
    "Unresolved checks",
    "Balance posted journals",
    "Review counted cash",
    "A physical cutoff count is missing",
    "Review retained earnings",
    "Year-end must be reviewed separately",
    "Cash-count coverage: incomplete",
    "Command coverage: incomplete",
    "Review limit 200",
    "No verified cutoff count; not zero",
    "original basis not verified",
    "commercial sales and customer payments",
    "opening balance reconciliation",
    "inventory costs",
    "Posted zero does not prove no business activity",
  ])
    expect(html).toContain(text)
  expect(html).not.toContain("NEVER_RENDER")
  expect(html).not.toContain("private-account")
})
test("posted summary is useful yet never authorizes close/reopen/adjustment or claims full reconciliation", () => {
  reset()
  const html = render()
  for (const text of [
    "Posted revenue",
    "₦1,000.00",
    "Posted expenses",
    "₦100.00",
    "Posted cost of sales",
    "₦400.00",
    "Posted net result",
    "₦500.00",
    "Cash and bank net change",
    "₦150.00",
    "Operationally reconciled",
    "does not certify complete reconciliation",
    "Assistant close and reopen are unavailable",
    "date lock would be eligible",
    "does not adjust balances, reverse journals",
  ])
    expect(html).toContain(text)
  expect([...buttons.keys()]).toEqual(["Refresh day review"])
})
test("stale/fetching/paused/denied/earlier-mount checklist or report withholds both read surfaces", () => {
  for (const kind of ["checklist", "report"]) {
    for (const state of [
      { isFetching: true },
      { isPaused: true },
      { isError: true },
      { isFetchedAfterMount: false },
    ]) {
      reset()
      if (kind === "checklist")
        checklistQuery = { ...ready(checklist), ...state }
      else reportQuery = { ...ready(report), ...state }
      const html = render()
      expect(html).not.toContain("Shop cash")
      expect(html).not.toContain("Posted revenue")
      expect(html).not.toContain("Balance posted journals")
      if (kind === "checklist") expect(calls.at(-1)?.enabled).toBe(false)
    }
  }
})
test("wrong checklist Book/currency/cutoff/from/sequence disables the report and refuses facts", () => {
  for (const patch of [
    { bookId: "foreign" },
    { currencyCode: "USD" },
    { through: new Date("2026-10-13T23:59:59.999Z") },
    { from: new Date("2026-10-16T00:00:00.000Z") },
    { from: new Date("bad") },
    { snapshotSequence: "bad" },
  ]) {
    reset()
    checklistQuery = ready({ ...checklist, ...patch })
    const html = render()
    expect(html).toContain("cutoff or snapshot review is unavailable")
    expect(html).not.toContain("Shop cash")
    expect(calls.at(-1)?.enabled).toBe(false)
  }
})
test("wrong report Book/currency/sequence/from/cutoff never joins the checklist", () => {
  for (const patch of [
    { bookId: "foreign" },
    { currencyCode: "USD" },
    { snapshotSequence: "9007199254740992" },
    { from: new Date("2026-10-13T00:00:00.000Z") },
    { through: new Date("2026-10-13T23:59:59.999Z") },
  ]) {
    reset()
    reportQuery = ready({ ...report, ...patch })
    const html = render()
    expect(html).toContain("cutoff or snapshot review is unavailable")
    expect(html).not.toContain("Shop cash")
    expect(html).not.toContain("Posted revenue")
  }
})
test("wrong workspace actor/business/Book or offline/restricted simulated gate makes no financial read", () => {
  for (const patch of [
    { actorUserId: "foreign" },
    { tenantId: "foreign" },
    { book: { id: "foreign", currencyCode: "NGN" } },
  ]) {
    reset()
    workspace = { ...workspace, ...patch }
    expect(render()).toContain("original Finance Book changed")
    expect(calls).toEqual([])
  }
  reset()
  offline = true
  render()
  expect(calls).toEqual([])
  reset()
  profile.role = "MANAGER"
  render()
  expect(calls).toEqual([])
})
test("malformed, incomplete or future UTC cutoff and inactive/empty actor never query", () => {
  for (const cutoff of [
    "2026-10-14",
    "2026-10-14T22:59:59.999Z",
    "2099-10-14T23:59:59.999Z",
  ]) {
    reset()
    render("book", cutoff)
    expect(calls).toEqual([])
  }
  for (const patch of [
    { id: "" },
    { businessId: "" },
    { status: "SUSPENDED" },
  ]) {
    reset()
    profile = { ...profile, ...patch }
    render()
    expect(calls).toEqual([])
  }
  reset()
  profile.status = undefined
  expect(render()).toContain("Posted day summary")
})
test("numeric unknowns stay unavailable and exact large integer strings keep cents", () => {
  reset()
  reportQuery = ready({
    ...report,
    profitAndLoss: {
      ...report.profitAndLoss,
      revenueMinor: "9223372036854775807",
    },
  })
  expect(render()).toContain("₦92,233,720,368,547,758.07")
  for (const value of [
    null,
    "bad",
    "1.5",
    Number.MAX_SAFE_INTEGER + 1,
    Number.POSITIVE_INFINITY,
  ]) {
    reset()
    reportQuery = ready({
      ...report,
      profitAndLoss: { ...report.profitAndLoss, revenueMinor: value },
    })
    const html = render()
    expect(html).toContain("Amount unavailable")
    expect(html).not.toContain("₦NaN")
    expect(html).not.toContain("₦∞")
  }
})
test("every open owns new read cache entries and raw/private query fields are not rendered", () => {
  reset()
  render()
  const previous = keys.at(-1)
  const html = render()
  expect(keys.at(-1)).not.toEqual(previous)
  expect(html).not.toContain("NEVER_RENDER")
  expect(html).not.toContain("accountIds")
  expect(html).not.toContain("private-account")
})
