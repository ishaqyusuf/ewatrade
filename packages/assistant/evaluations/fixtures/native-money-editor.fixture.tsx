import { expect, mock, test } from "bun:test"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { NativeMoneyAction } from "../../../../apps/mobile/src/components/mobile/assistant/native-money-values"

// Actual native editors and Book gate, isolated from native primitives, tRPC,
// device/network state and other suites. This is static source evidence only.
const root = new URL("../../../../", import.meta.url)
function standIn(path: string, value: Record<string, unknown>) {
  mock.module(new URL(`apps/mobile/src/${path}`, root).pathname, () => value)
}
const children = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
)
const button = ({
  children,
  disabled,
}: { children: ReactNode; disabled?: boolean }) => (
  <button type="button" disabled={disabled}>
    {children}
  </button>
)
const field = ({
  label,
  value,
  editable,
}: { label: string; value: string; editable?: boolean }) => (
  <label>
    {label}
    <input value={value} readOnly disabled={editable === false} />
  </label>
)
for (const [path, value] of [
  [
    "components/ui/bottom-sheet-input-context",
    { BottomSheetInputProvider: children },
  ],
  [
    "components/ui/bottom-sheet-keyboard-aware-scroll-view",
    { BottomSheetKeyboardAwareScrollView: children },
  ],
  ["components/ui/view", { View: children }],
  ["components/ui/text", { Text: children }],
  ["components/ui/pressable", { Pressable: button }],
  ["components/ui/skeleton", { Skeleton: () => <span>Loading</span> }],
  ["components/mobile/action-button", { ActionButton: button }],
  ["components/mobile/form-field", { FormField: field }],
  ["components/mobile/money-field", { MoneyField: field }],
  [
    "components/mobile/assistant/chat-photo",
    { ChatPhotoThumb: () => <span>Photo</span> },
  ],
  [
    "components/mobile/status-banner",
    {
      StatusBanner: ({
        title,
        message,
      }: { title?: string; message?: string }) => (
        <div>
          {title} {message}
        </div>
      ),
    },
  ],
  [
    "components/mobile/green-till/hero-card",
    {
      HeroCard: ({ title, sub }: { title?: string; sub?: string }) => (
        <div>
          {title} {sub}
        </div>
      ),
    },
  ],
] as const)
  standIn(path, value)
let role = "OWNER"
let offline = false
let status: string | undefined
let storeId = "store"
let staffAccessMode: string | undefined
let catalogEditor: boolean | undefined
standIn("hooks/use-auth", {
  useAuthContext: () => ({
    profile: {
      id: "actor",
      businessId: "business",
      storeId,
      role,
      status,
      staffAccessMode,
      catalogEditor,
    },
  }),
})
standIn("store/operationalModeStore", {
  useOperationalModeStore: (
    selector: (state: { isOfflineMode: boolean }) => unknown,
  ) => selector({ isOfflineMode: offline }),
})
mock.module("expo-router", () => ({ useRouter: () => ({ back: () => {} }) }))
const queryCalls: { kind: string; enabled?: boolean }[] = []
function procedure(kind: string) {
  return {
    queryOptions: (_input: unknown, options: Record<string, unknown>) => ({
      queryKey: [kind],
      queryFn: async () => {
        throw Error("No network is permitted")
      },
      ...options,
    }),
  }
}
standIn("trpc/client", {
  useTRPC: () => ({
    assistant: {
      saleOptions: procedure("income"),
      simpleExpenseOptions: procedure("expense"),
      simpleTransferOptions: procedure("transfer"),
    },
    finance: {
      book: procedure("book"),
      moneyMovement: procedure("movement"),
      bill: procedure("bill"),
      reverseMoney: { mutationOptions: () => ({}) },
    },
  }),
})
const choices = {
  book: { id: "book" },
  accounts: [
    { id: "private-cash", name: "Shop cash" },
    { id: "private-bank", name: "Bank account" },
  ],
  categories: [{ id: "private-category", name: "Transport" }],
}
function ready(data: unknown = choices) {
  return {
    isPending: false,
    isError: false,
    isSuccess: true,
    isFetching: false,
    isPaused: false,
    isFetchedAfterMount: true,
    data,
    error: { message: "Denied" },
    refetch: async () => {},
  }
}
let state = ready()
let bookState = ready({ id: "book" })
let originalState = ready()
mock.module("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: string[]; enabled?: boolean }) => {
    const kind = options.queryKey[0] ?? ""
    queryCalls.push({ kind, enabled: options.enabled })
    return kind === "book"
      ? bookState
      : ["movement", "bill"].includes(kind)
        ? originalState
        : state
  },
  useMutation: () => ({
    mutateAsync: async () => {
      throw Error("No mutation is permitted")
    },
  }),
  useQueryClient: () => ({
    fetchQuery: async () => {
      throw Error("No request is permitted")
    },
  }),
}))
const { GeneralMoneyOperationEditor } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/general-money-operation-editor"
)
const { FinanceWorkspaceGate } = await import(
  "../../../../apps/mobile/src/components/mobile/finance/finance-workspace-gate"
)
const transfer: NativeMoneyAction = {
  action: "money_transfer_simple",
  amountMinor: 5025,
  fromAccountName: "Shop cash",
  fromMoneyAccountId: "private-cash",
  toAccountName: "New bank",
  newToAccount: { name: "New bank", kind: "BANK" },
  note: "",
  bookId: "book",
  attachmentIds: [],
}
const income: NativeMoneyAction = {
  action: "money_in_record",
  amountMinor: 5025,
  accountName: "Shop cash",
  createAccount: false,
  description: "",
  attachmentIds: [],
}
const expense: NativeMoneyAction = {
  action: "expense_record_simple",
  amountMinor: 5025,
  description: "Fuel",
  paid: false,
  categoryName: "Transport",
  expenseCategoryId: "private-category",
  bookId: "book",
  attachmentIds: [],
}
function render(initial: NativeMoneyAction, disabled = false) {
  return renderToStaticMarkup(
    createElement(GeneralMoneyOperationEditor, {
      initial,
      currencyCode: "NGN",
      disabled,
      onSave: () => {
        throw Error("Static render cannot Save")
      },
    }),
  )
}
function gate(expectedBookId?: string) {
  return renderToStaticMarkup(
    <FinanceWorkspaceGate expectedBookId={expectedBookId} requireOnline>
      {() => <span>Authorized original</span>}
    </FinanceWorkspaceGate>,
  )
}
const disabledSave =
  /<button(?=[^>]*disabled="")[^>]*>Save and review<\/button>/
test("amount-led transfer uses current named choices, fixed Book and truthful staging", () => {
  role = "OWNER"
  state = ready()
  queryCalls.length = 0
  const html = render(transfer)
  for (const text of [
    "Amount",
    "50.25",
    "From account",
    "To account",
    "Shop cash",
    "New bank",
    "bookkeeping account",
    "no money is sent",
    "Save and review",
  ])
    expect(html).toContain(text)
  expect(html).not.toContain("private-cash")
  expect(
    queryCalls.filter((call) => call.enabled === true).map((call) => call.kind),
  ).toEqual(["transfer"])
})
test("income states Owner funds; unpaid expense never offers a paid-from field", () => {
  state = ready()
  expect(render(income)).toContain("Recorded as Owner funds")
  const html = render(expense)
  expect(html).toContain("Not paid yet")
  expect(html).toContain("Expense category")
  expect(html).not.toContain("Paid from")
})
test("cached, denied, paused and not-yet-fresh choices are hidden with Save disabled", () => {
  for (const flags of [
    { isFetching: true },
    { isError: true },
    { isPaused: true },
    { isFetchedAfterMount: false },
  ]) {
    state = { ...ready(), ...flags }
    const html = render(transfer)
    expect(html).not.toContain("Shop cash")
    expect(html).toMatch(disabledSave)
  }
})
test("another or absent current Book refuses the saved expense instead of rehoming it", () => {
  for (const book of [null, { id: "other-book" }]) {
    state = ready({ ...choices, book })
    const html = render(expense)
    expect(html).toContain("original Finance Book is unavailable")
    expect(html).toMatch(disabledSave)
  }
})
test("busy state disables Save; lost Finance role mounts no choices", () => {
  state = ready()
  expect(render(transfer, true)).toMatch(disabledSave)
  role = "MANAGER"
  queryCalls.length = 0
  expect(render(transfer)).toContain("owner or administrator")
  expect(queryCalls).toHaveLength(0)
  role = "OWNER"
})
test("receipt Book gate permits only a freshly authorized matching original Book", () => {
  bookState = ready({ id: "book" })
  expect(gate("book")).toContain("Authorized original")
  expect(gate("foreign")).not.toContain("Authorized original")
  expect(gate("")).not.toContain("Authorized original")
  expect(gate("foreign")).toContain("Receipt Book unavailable")
  for (const flags of [
    { isFetching: true },
    { isError: true },
    { isPaused: true },
    { isFetchedAfterMount: false },
  ]) {
    bookState = { ...ready({ id: "book" }), ...flags }
    expect(gate("book")).not.toContain("Authorized original")
  }
})
test("receipt Book gate withholds originals offline or after role loss; ordinary current-Book routes remain", () => {
  bookState = ready({ id: "book" })
  offline = true
  expect(gate("book")).not.toContain("Authorized original")
  offline = false
  role = "MANAGER"
  expect(gate("book")).not.toContain("Authorized original")
  role = "OWNER"
  expect(gate()).toContain("Authorized original")
})

// Also exercise the actual screen consumers; only surrounding native furniture
// and command hooks are replaced. No reversal or payment callback is invoked.
mock.module("react-native", () => ({
  View: children,
  ScrollView: children,
  RefreshControl: () => null,
}))
standIn("hooks/use-color", {
  useColors: () => ({ primary: "green", mutedForeground: "grey" }),
})
standIn("components/ui/icon", { Icon: () => null })
standIn("components/mobile/green-till/kit", {
  ListCard: children,
  SectionHeader: () => null,
})
standIn("components/mobile/finance/finance-command-feedback", {
  FinanceCommandFeedback: () => null,
})
standIn("components/mobile/finance/finance-form-body", {
  FinanceFormBody: children,
})
standIn("components/mobile/finance/finance-bank-date-field", {
  FinanceBankDateField: () => null,
})
standIn("components/mobile/finance/finance-ledger-layout", {
  HistoryTimeline: () => null,
  FinanceDetailScaffold: children,
})
standIn("components/mobile/finance/finance-expense-forms", {
  FinanceExpenseCorrectionForm: () => null,
  FinanceExpensePaymentForm: () => null,
})
standIn("components/mobile/finance/use-mobile-finance-command", {
  useMobileFinanceCommand: () => ({
    ready: true,
    pending: false,
    run: async () => {
      throw Error("No command is permitted")
    },
  }),
})
const { FinanceMovementScreen } = await import(
  "../../../../apps/mobile/src/components/mobile/finance/finance-movement-screen"
)
const { FinanceExpenseScreen } = await import(
  "../../../../apps/mobile/src/components/mobile/finance/finance-expense-screen"
)
const original = {
  id: "original",
  bookId: "book",
  description: "Private original facts",
  lines: [],
  payments: [],
  sourceKind: "TRANSFER",
  effectiveAt: "2026-10-15T10:00:00Z",
  recordedAt: "2026-10-15T10:00:00Z",
  incurredAt: "2026-10-15T10:00:00Z",
  totalMinor: "5025",
  paidMinor: "0",
  outstandingMinor: "5025",
  payeeName: "Fuel station",
  reversal: null,
  voidedAt: null,
}
function originalScreen(kind: "movement" | "bill") {
  return renderToStaticMarkup(
    kind === "movement" ? (
      <FinanceMovementScreen entryId="original" expectedBookId="book" />
    ) : (
      <FinanceExpenseScreen billId="original" expectedBookId="book" />
    ),
  )
}
test("actual receipt screens render exact fresh originals and hide cached, denied or wrong-identity facts", () => {
  bookState = ready({ id: "book", currencyCode: "NGN" })
  for (const kind of ["movement", "bill"] as const) {
    originalState = ready(original)
    expect(originalScreen(kind)).toContain("Private original facts")
    for (const flags of [
      { isFetching: true },
      { isError: true },
      { isPaused: true },
      { isFetchedAfterMount: false },
    ]) {
      originalState = { ...ready(original), ...flags }
      expect(originalScreen(kind)).not.toContain("Private original facts")
    }
    for (const changed of [{ id: "other" }, { bookId: "foreign" }]) {
      originalState = ready({ ...original, ...changed })
      expect(originalScreen(kind)).not.toContain("Private original facts")
    }
  }
})

// The pinned assistant original must remount when any known authority changes.
test("pinned Finance Book rejects known suspension and captures the full authorization scope", () => {
  role = "OWNER"
  offline = false
  bookState = ready({ id: "book" })
  status = "SUSPENDED"
  queryCalls.length = 0
  expect(gate("book")).not.toContain("Authorized original")
  expect(queryCalls).toHaveLength(0)
  // Ordinary current-Book routes keep their existing behavior.
  expect(gate()).toContain("Authorized original")
  status = "ACTIVE"
  function pinnedKey() {
    return FinanceWorkspaceGate({
      expectedBookId: "book",
      children: () => null,
    }).key
  }
  const originalKey = pinnedKey()
  storeId = "other-store"
  expect(pinnedKey()).not.toBe(originalKey)
  storeId = "store"
  staffAccessMode = "SCOPED"
  expect(pinnedKey()).not.toBe(originalKey)
  staffAccessMode = undefined
  catalogEditor = true
  expect(pinnedKey()).not.toBe(originalKey)
  catalogEditor = undefined
  role = "ADMIN"
  expect(pinnedKey()).not.toBe(originalKey)
  role = "OWNER"
  status = undefined
})
