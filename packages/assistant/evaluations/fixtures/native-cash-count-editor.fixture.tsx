import { expect, mock, test } from "bun:test"
import type {
  GeneralAction,
  GeneralCashCountAction,
} from "@ewatrade/assistant/general/contracts"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

// Actual editor, exact helper and FinanceWorkspaceGate. Native/query/profile
// stand-ins supply isolated source/callback proof, never network/device acceptance.
const root = new URL("../../../../", import.meta.url)
function standIn(path: string, value: Record<string, unknown>) {
  mock.module(new URL(`apps/mobile/src/${path}`, root).pathname, () => value)
}
const children = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
)
for (const [path, name] of [
  ["ui/bottom-sheet-input-context", "BottomSheetInputProvider"],
  [
    "ui/bottom-sheet-keyboard-aware-scroll-view",
    "BottomSheetKeyboardAwareScrollView",
  ],
  ["ui/view", "View"],
  ["ui/text", "Text"],
  ["mobile/green-till/kit", "ListCard"],
])
  standIn(`components/${path}`, { [name]: children })
standIn("components/ui/skeleton", { Skeleton: () => <span>Loading</span> })
standIn("components/mobile/status-banner", {
  StatusBanner: ({ title, message }: { title: string; message: string }) => (
    <div>
      {title} {message}
    </div>
  ),
})
standIn("components/mobile/green-till/hero-card", {
  HeroCard: ({ title, sub }: { title: string; sub: string }) => (
    <div>
      {title} {sub}
    </div>
  ),
})
let buttons: {
  text: ReactNode
  label?: string
  disabled?: boolean
  checked?: boolean
  onPress: () => void
}[] = []
function Button({
  children,
  accessibilityLabel,
  accessibilityState,
  disabled,
  onPress,
}: {
  children: ReactNode
  accessibilityLabel?: string
  accessibilityState?: { checked?: boolean }
  disabled?: boolean
  onPress: () => void
}) {
  buttons.push({
    text: children,
    label: accessibilityLabel,
    disabled,
    checked: accessibilityState?.checked,
    onPress,
  })
  return (
    <button type="button" disabled={disabled}>
      {children}
    </button>
  )
}
standIn("components/mobile/action-button", { ActionButton: Button })
standIn("components/ui/pressable", { Pressable: Button })
const fields = new Map<
  string,
  {
    value: string
    onChangeText: (value: string) => void
    editable?: boolean
    inputClassName?: string
  }
>()
standIn("components/mobile/form-field", {
  FormField: ({
    label,
    value,
    onChangeText,
    editable,
    inputClassName,
  }: {
    label: string
    value: string
    onChangeText: (value: string) => void
    editable?: boolean
    inputClassName?: string
  }) => {
    fields.set(label, { value, onChangeText, editable, inputClassName })
    return (
      <label>
        {label}
        <input readOnly value={value} disabled={editable === false} />
      </label>
    )
  },
})
type Profile = {
  id: string
  businessId?: string
  storeId: string
  role: string
  status?: string
  staffAccessMode?: string
  catalogEditor?: boolean
}
let profile: Profile = {
  id: "actor",
  businessId: "business",
  storeId: "selected-store",
  role: "OWNER",
  status: "ACTIVE",
}
let offline = false
standIn("hooks/use-auth", { useAuthContext: () => ({ profile }) })
standIn("store/operationalModeStore", {
  useOperationalModeStore: (
    selector: (state: { isOfflineMode: boolean }) => unknown,
  ) => selector({ isOfflineMode: offline }),
})
mock.module("expo-router", () => ({ useRouter: () => ({ back: () => {} }) }))
const inputs: { kind: string; input: unknown; flags: unknown }[] = []
const queries: { queryKey: readonly unknown[] }[] = []
function procedure(kind: string) {
  return {
    queryOptions: (input: unknown, flags: object) => {
      inputs.push({ kind, input, flags })
      return {
        queryKey: [kind, input],
        queryFn: () => {
          throw Error("No network request permitted")
        },
        ...flags,
      }
    },
  }
}
standIn("trpc/client", {
  useTRPC: () => ({
    finance: { book: procedure("book"), moneyAccounts: procedure("accounts") },
  }),
})
const originalBook = {
  id: "original-book",
  currencyCode: "NGN",
  tenantId: "business",
  startsAt: "2026-01-01T00:00:00Z",
}
const originalAccount = {
  id: "original-cash",
  name: "Shop cash",
  code: "CASH-01",
  purpose: "CASH",
  availableForPayments: true,
  currentBalanceMinor: "999999999999999999",
  internalMetadata: "private-account-metadata",
}
let refreshes = 0
function ready<T>(data: T) {
  return {
    data,
    isPending: false,
    isError: false,
    isSuccess: true,
    isFetching: false,
    isPaused: false,
    isFetchedAfterMount: true,
    error: { message: "Denied" },
    refetch: async () => {
      refreshes += 1
    },
  }
}
let bookQuery = ready(originalBook)
let accountQuery = ready({
  book: originalBook,
  accounts: [originalAccount],
  coverage: "ACTIVE_MONEY_ACCOUNT_IDENTITIES",
  nextCursor: null as string | null,
})
mock.module("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: readonly unknown[] }) => {
    queries.push(options)
    return options.queryKey[0] === "book" ? bookQuery : accountQuery
  },
}))
const { GeneralCashCountEditor } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/general-cash-count-editor"
)
const initial: GeneralCashCountAction = {
  action: "cash_count_record",
  bookId: "original-book",
  accountId: "original-cash",
  observedBalanceMinor: "1234567890123456789",
  asOf: "2026-10-15T13:00:00.123456Z",
  reference: "Original count reference",
  cashPhysicallyCounted: true,
}
let saved: GeneralAction[] = []
function render(value = initial, disabled = false) {
  buttons = []
  fields.clear()
  saved = []
  return renderToStaticMarkup(
    createElement(GeneralCashCountEditor, {
      initial: value,
      disabled,
      onSave: (payload) => saved.push(payload),
    }),
  )
}
function reset() {
  profile = {
    id: "actor",
    businessId: "business",
    storeId: "selected-store",
    role: "OWNER",
    status: "ACTIVE",
  }
  offline = false
  bookQuery = ready(originalBook)
  accountQuery = ready({
    book: originalBook,
    accounts: [originalAccount],
    coverage: "ACTIVE_MONEY_ACCOUNT_IDENTITIES",
    nextCursor: null as string | null,
  })
  refreshes = 0
}
function save() {
  const button = buttons.find((row) => row.text === "Save and review")
  expect(button).toBeDefined()
  button?.onPress()
  return button
}
function acknowledge() {
  const button = buttons.find(
    (row) => row.label === "I physically counted this cash",
  )
  expect(button).toBeDefined()
  button?.onPress()
  return button
}

test("Amount first source uses fixed fresh Book/account and original physical amount, with all required fields visible", () => {
  reset()
  const html = render()
  expect(html).toContain("Fixed cash account")
  expect(html).toContain("Shop cash")
  expect(html).toContain("NGN · Cash · CASH-01")
  expect(fields.get("Cash physically counted (NGN)")?.value).toBe(
    "12345678901234567.89",
  )
  expect(fields.get("Cash physically counted (NGN)")?.inputClassName).toContain(
    "text-3xl",
  )
  expect(fields.get("Count date and time (UTC)")?.value).toBe(initial.asOf)
  expect(fields.get("Count reference")?.value).toBe(initial.reference)
  expect(
    buttons.find((row) => row.label === "I physically counted this cash")
      ?.checked,
  ).toBe(false)
  expect(html).toContain("separate confirmation")
  expect(html).toContain("does not post an adjustment")
  for (const privateValue of [
    "original-cash",
    "original-book",
    "private-account-metadata",
    "999999999999999999",
  ])
    expect(html).not.toContain(privateValue)
  expect(inputs.filter((row) => row.kind === "accounts").at(-1)?.input).toEqual(
    { bookId: "original-book", limit: 50, afterCode: undefined },
  )
})
test("fresh physical acknowledgement is required every visit and no ledger-derived variance is previewed", () => {
  reset()
  render()
  save()
  expect(saved).toHaveLength(0)
  acknowledge()
  save()
  expect(saved).toEqual([initial])
  render()
  expect(
    buttons.find((row) => row.label === "I physically counted this cash")
      ?.checked,
  ).toBe(false)
  save()
  expect(saved).toHaveLength(0)
})
test("queued amount/time/reference and acknowledgement save the latest exact values before rerender", () => {
  reset()
  render()
  fields
    .get("Cash physically counted (NGN)")
    ?.onChangeText("92233720368547758.07")
  fields
    .get("Count date and time (UTC)")
    ?.onChangeText("2026-10-16T09:30:00.987654321Z")
  fields.get("Count reference")?.onChangeText("Latest physical reference")
  acknowledge()
  save()
  expect(saved).toEqual([
    {
      ...initial,
      observedBalanceMinor: "9223372036854775807",
      asOf: "2026-10-16T09:30:00.987654321Z",
      reference: "Latest physical reference",
    },
  ])
  saved = []
  acknowledge()
  save()
  expect(saved).toHaveLength(0)
})
test("cached, paused, fetching or refused Book/account reads hide private facts and Save", () => {
  for (const patch of [
    { isFetching: true },
    { isPaused: true },
    { isFetchedAfterMount: false },
    { isError: true },
  ]) {
    reset()
    accountQuery = { ...accountQuery, ...patch }
    const html = render()
    expect(html).not.toContain("Shop cash")
    expect(fields.size).toBe(0)
    expect(buttons.some((row) => row.text === "Save and review")).toBe(false)
    reset()
    bookQuery = { ...bookQuery, ...patch }
    const before = inputs.filter((row) => row.kind === "accounts").length
    expect(render()).not.toContain("Shop cash")
    expect(inputs.filter((row) => row.kind === "accounts").length).toBe(before)
  }
})
test("wrong Book/currency, noncash or ambiguous account and missing current identity cannot yield an editable observation", () => {
  for (const page of [
    { ...accountQuery.data, book: { ...originalBook, id: "foreign-book" } },
    { ...accountQuery.data, book: { ...originalBook, currencyCode: "USD" } },
    {
      ...accountQuery.data,
      accounts: [{ ...originalAccount, purpose: "BANK" }],
    },
    { ...accountQuery.data, accounts: [originalAccount, originalAccount] },
    { ...accountQuery.data, coverage: "unknown" },
  ]) {
    reset()
    accountQuery.data = page
    expect(render()).not.toContain("Shop cash")
    expect(fields.size).toBe(0)
  }
  reset()
  bookQuery.data = { ...originalBook, id: "foreign-book" }
  const before = inputs.filter((row) => row.kind === "accounts").length
  expect(render()).not.toContain("Shop cash")
  expect(inputs.filter((row) => row.kind === "accounts").length).toBe(before)
})
test("bounded account-page omission offers continuation without silently selecting another account or inferring zero", () => {
  reset()
  accountQuery.data = {
    ...accountQuery.data,
    accounts: [{ ...originalAccount, id: "other-account" }],
    nextCursor: "EXACT-NEXT-CODE",
  }
  const html = render()
  expect(html).toContain("not found on this bounded choices page")
  expect(html).toContain("another account has not been selected")
  expect(buttons.some((row) => row.text === "Next account page")).toBe(true)
  expect(html).not.toContain("EXACT-NEXT-CODE")
  expect(fields.size).toBe(0)
})
test("offline/nonmanagement/suspended/missing actor or business guard blocks before private reads", () => {
  for (const patch of [
    { id: "" },
    { businessId: undefined },
    { role: "MANAGER" },
    { role: "CASHIER" },
    { status: "SUSPENDED" },
    { status: "" },
  ]) {
    reset()
    profile = { ...profile, ...patch }
    const before = inputs.length
    expect(render()).toContain("Current Owner or Admin access")
    expect(inputs.length).toBe(before)
  }
  reset()
  offline = true
  const before = inputs.length
  expect(render()).toContain("Reconnect to review")
  expect(inputs.length).toBe(before)
})
test("busy fields and Save retain parent lock while independent mounts own fresh cancellable reads", () => {
  reset()
  render(initial, true)
  expect(save()?.disabled).toBe(true)
  expect(fields.get("Cash physically counted (NGN)")?.editable).toBe(false)
  acknowledge()
  expect(saved).toHaveLength(0)
  const first = queries.at(-1)?.queryKey
  render()
  expect(queries.at(-1)?.queryKey).not.toEqual(first)
  expect(inputs.filter((row) => row.kind === "accounts").at(-1)?.flags).toEqual(
    {
      retry: false,
      staleTime: 0,
      gcTime: 0,
      refetchOnMount: "always",
      trpc: { abortOnUnmount: true },
    },
  )
})
