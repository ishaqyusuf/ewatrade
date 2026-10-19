import { expect, mock, test } from "bun:test"
import type {
  GeneralAction,
  GeneralAnswer,
} from "@ewatrade/assistant/general/contracts"
import type { QuoteDecisionAction } from "@ewatrade/assistant/general/quote-decision"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
// The actual editors/original consumer and pure guards run; native furniture,
// query transport and scope are inert stand-ins. No device or connected proof.
const root = new URL("../../../../", import.meta.url)
function standIn(path: string, value: Record<string, unknown>) {
  mock.module(new URL(`apps/mobile/src/${path}`, root).pathname, () => value)
}
const children = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
)
for (const [path, name] of [
  ["components/ui/text", "Text"],
  ["components/ui/view", "View"],
  ["components/mobile/green-till/kit", "ListCard"],
  ["components/ui/bottom-sheet-input-context", "BottomSheetInputProvider"],
  [
    "components/ui/bottom-sheet-keyboard-aware-scroll-view",
    "BottomSheetKeyboardAwareScrollView",
  ],
])
  standIn(path as string, { [name as string]: children })
mock.module("react-native", () => ({ ScrollView: children }))
const buttons = new Map<string, { disabled?: boolean; onPress: () => void }>()
standIn("components/mobile/action-button", {
  ActionButton: ({
    children,
    disabled,
    onPress,
  }: { children: ReactNode; disabled?: boolean; onPress: () => void }) => {
    buttons.set(String(children), { disabled, onPress })
    return (
      <button type="button" disabled={disabled}>
        {children}
      </button>
    )
  },
})
let editReason: ((reason: string) => void) | undefined
standIn("components/mobile/form-field", {
  FormField: ({
    label,
    value,
    editable,
    onChangeText,
  }: {
    label: string
    value: string
    editable?: boolean
    onChangeText: (value: string) => void
  }) => {
    editReason = onChangeText
    return (
      <label>
        {label}
        <input value={value} readOnly disabled={editable === false} />
      </label>
    )
  },
})
let profile = {
  id: "actor",
  businessId: "business",
  storeId: "store",
  role: "MANAGER",
  status: "ACTIVE" as string | undefined,
  staffAccessMode: "SCOPED",
  catalogEditor: false,
}
standIn("hooks/use-auth", { useAuthContext: () => ({ profile }) })
const initial: QuoteDecisionAction = {
  action: "commerce_quote_approve",
  approvalId: "private-approval",
  quoteId: "private-quote",
  quoteVersionId: "private-version",
  reason: "Original intended reason",
}
const context = {
  tenant: { id: "business" },
  activeStore: { id: "store" },
  actorUserId: "actor",
}
const review = {
  ...initial,
  tenantId: "business",
  storeId: "store",
  actorUserId: "actor",
  lines: [
    "Original quotation version 2 · NGN10.00.",
    "Commercial release creates the canonical public acceptance capability.",
    "Current Terms and configured native screening remain mandatory at confirmation.",
  ],
  token: "NEVER_RENDER",
}
const detail = {
  id: initial.approvalId,
  quoteId: initial.quoteId,
  quoteVersionId: initial.quoteVersionId,
  version: 2,
  status: "rejected",
  policyRevision: 4,
  currencyCode: "NGN",
  totalMinor: 1000,
  createdByMembershipId: "PRIVATE_MAKER",
  decidedByMembershipId: "recorded-checker",
  reason: "RECORDED ORIGINAL REASON",
  requestedAt: "2026-10-14T09:00:00.000Z",
  decidedAt: "2026-10-15T08:00:00.000Z",
  expiresAt: null,
  sourceId: "PRIVATE_SOURCE",
  sourceKind: "service",
  currentReview: { stale: true, reason: "CURRENT ELIGIBILITY CHANGED" },
  actions: {
    canApprove: false,
    canReject: false,
    canRelease: false,
    canPrepare: false,
    canRequestApproval: false,
  },
  options: [
    {
      id: "PRIVATE_OPTION_A",
      label: "First alternative",
      availabilityOutcome: "full",
      totalMinor: 1000,
      lines: [
        {
          offeringName: "Original Wash",
          catalogItemName: "Laundry",
          variantName: "Express",
          outcome: "quoted",
          quantity: "2",
          unitPriceMinor: 500,
          totalMinor: 1000,
          privateField: "NEVER_RENDER",
        },
      ],
    },
    {
      id: "PRIVATE_OPTION_B",
      label: "Second alternative",
      availabilityOutcome: "partial",
      totalMinor: 2000,
      lines: [
        {
          offeringName: null,
          catalogItemName: "Original service",
          variantName: null,
          outcome: "unavailable",
          quantity: null,
          unitPriceMinor: null,
          totalMinor: null,
        },
      ],
    },
  ],
  privateField: "NEVER_RENDER",
  publicAcceptanceToken: "NEVER_RENDER",
  publicAcceptanceUrl: "https://example.test/NEVER_RENDER",
}
let refreshes = 0
function ready(data: unknown) {
  return {
    isSuccess: true,
    isError: false,
    isFetching: false,
    isPaused: false,
    isFetchedAfterMount: true,
    data,
    refetch: async () => {
      refreshes++
      return { isSuccess: true, data }
    },
  }
}
let contextQuery = ready(context)
let reviewQuery = ready(review)
let detailQuery = ready(detail)
const generated: {
  name: string
  input: unknown
  key: unknown
  enabled?: boolean
}[] = []
const fetched: string[] = []
const responses: Record<string, unknown> = { context, review, detail }
function procedure(name: string) {
  return {
    queryOptions: (input: unknown, options: object) => {
      const queryKey = [name, input]
      generated.push({ name, input, key: queryKey, ...options })
      return { queryKey, queryFn: async () => responses[name], ...options }
    },
  }
}
standIn("trpc/client", {
  useTRPC: () => ({
    tenant: { current: procedure("context") },
    serviceCommerce: {
      assistantQuoteDecisionReview: procedure("review"),
      assistantQuoteApprovalDetail: procedure("detail"),
    },
  }),
})
const mountedKeys: unknown[] = []
mock.module("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: unknown[] }) => {
    mountedKeys.push(options.queryKey)
    return options.queryKey[0] === "context"
      ? contextQuery
      : options.queryKey[0] === "review"
        ? reviewQuery
        : detailQuery
  },
  useQueryClient: () => ({
    fetchQuery: async (options: {
      queryKey: string[]
      queryFn: (context: object) => Promise<unknown>
    }) => {
      fetched.push(options.queryKey[0] as string)
      return options.queryFn({ queryKey: options.queryKey })
    },
  }),
}))
const { GeneralQuoteDecisionEditor } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/general-quote-decision-editor"
)
const { NativeQuoteOriginalScreen } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/native-quote-original-screen"
)
const saved: GeneralAction[] = []
function editor(payload = initial, disabled = false) {
  buttons.clear()
  return renderToStaticMarkup(
    createElement(GeneralQuoteDecisionEditor, {
      initial: payload,
      disabled,
      onSave: (value) => saved.push(value),
    }),
  )
}
type Target = Extract<
  NonNullable<GeneralAnswer["target"]>,
  { kind: "commerce_quote_approval" }
>
const target: Target = {
  kind: "commerce_quote_approval",
  approvalId: initial.approvalId,
  quoteId: initial.quoteId,
  quoteVersionId: initial.quoteVersionId,
}
function original(value = target) {
  buttons.clear()
  return renderToStaticMarkup(
    createElement(NativeQuoteOriginalScreen, { target: value }),
  )
}
function reset() {
  contextQuery = ready(context)
  reviewQuery = ready(review)
  detailQuery = ready(detail)
  profile = {
    id: "actor",
    businessId: "business",
    storeId: "store",
    role: "MANAGER",
    status: "ACTIVE",
    staffAccessMode: "SCOPED",
    catalogEditor: false,
  }
  responses.context = context
  responses.review = review
  responses.detail = detail
  generated.length = 0
  fetched.length = 0
  saved.length = 0
}
const disabledSave =
  /<button(?=[^>]*disabled="")[^>]*>Save and review<\/button>/
test("native editor uses actual current scope and pure exact decision review for a canonical scoped Manager", () => {
  reset()
  const html = editor()
  expect(generated.map((call) => call.name)).toEqual(["context", "review"])
  expect(generated.at(-1)?.input).toEqual(initial)
  expect(html).toContain("Approve and commercially release")
  expect(html).toContain("configured native screening")
  expect(html).toContain("confirm separately")
  expect(html).not.toContain("private-approval")
  expect(html).not.toContain("NEVER_RENDER")
  expect(buttons.get("Save and review")?.disabled).toBe(false)
})
test("reject editor keeps rejection intent and review lines while forbidding command effects", () => {
  reset()
  const rejected = { ...initial, action: "commerce_quote_reject" as const }
  reviewQuery = ready({
    ...review,
    ...rejected,
    lines: ["Rejection keeps this version private."],
  })
  const html = editor(rejected)
  expect(html).toContain("Reject the original version; keep it private")
  expect(generated.at(-1)?.input).toEqual(rejected)
  expect(html).toContain("Rejection keeps this version private")
  expect(html).toContain("clinical release")
})
test("actual Save fetches scope then a unique fresh review and emits only an ordinary proposal edit", async () => {
  reset()
  editor()
  buttons.get("Save and review")?.onPress()
  buttons.get("Save and review")?.onPress()
  for (let i = 0; i < 8; i++) await Promise.resolve()
  expect(fetched).toEqual(["context", "review"])
  expect(saved).toEqual([initial])
  const reviewKeys = generated.filter((call) => call.name === "review")
  expect(reviewKeys).toHaveLength(2)
  expect(mountedKeys.at(-1)).not.toEqual(reviewKeys.at(-1)?.key)
})
test("cached, fetching, paused, denied and earlier-mount context/review facts remain hidden", () => {
  for (const source of ["context", "review"]) {
    for (const state of [
      { isFetching: true },
      { isPaused: true },
      { isError: true },
      { isFetchedAfterMount: false },
    ]) {
      reset()
      if (source === "context") contextQuery = { ...ready(context), ...state }
      else reviewQuery = { ...ready(review), ...state }
      const html = editor()
      expect(html).not.toContain("Original quotation version 2")
      expect(html).toMatch(disabledSave)
      expect(html).not.toContain("NEVER_RENDER")
    }
  }
})
test("wrong actor/business/Store or review tuple/intent blocks editing", () => {
  for (const change of [
    { actorUserId: "foreign" },
    { tenantId: "foreign" },
    { storeId: "foreign" },
    { approvalId: "foreign" },
    { quoteId: "foreign" },
    { quoteVersionId: "foreign" },
    { action: "commerce_quote_reject" },
    { reason: "different" },
  ]) {
    reset()
    reviewQuery = ready({ ...review, ...change })
    expect(editor()).toMatch(disabledSave)
  }
  reset()
  contextQuery = ready({ ...context, actorUserId: "foreign" })
  expect(editor()).toMatch(disabledSave)
  expect(generated.find((call) => call.name === "review")?.enabled).toBe(false)
})
test("missing actor/Store or known inactive profile never creates queries; absent optional status keeps protected authority", () => {
  for (const patch of [
    { id: "" },
    { businessId: "" },
    { storeId: "" },
    { status: "SUSPENDED" },
  ]) {
    reset()
    profile = { ...profile, ...patch }
    editor()
    original()
    expect(generated).toEqual([])
  }
  reset()
  profile.status = undefined
  expect(editor()).toContain("Original quotation version 2")
  expect(original()).toContain("Original quotation version 2")
})
test("busy parent cannot save, and every reopen owns distinct fresh cache keys", () => {
  reset()
  expect(editor(initial, true)).toMatch(disabledSave)
  const before = mountedKeys.at(-1)
  editor()
  expect(mountedKeys.at(-1)).not.toEqual(before)
})
test("original uses only pure approval detail and exact saved tuple, with no approval controls", () => {
  reset()
  const html = original()
  expect(generated.map((call) => call.name)).toEqual(["context", "detail"])
  expect(generated.at(-1)?.input).toEqual({
    approvalId: initial.approvalId,
    quoteId: initial.quoteId,
    quoteVersionId: initial.quoteVersionId,
  })
  expect(html).toContain("Original quotation version 2")
  expect(html).toContain("Stored decision: rejected")
  expect(html).toContain("recorded-checker")
  expect(html).toContain("2026-10-15T08:00:00.000Z")
  expect(html).toContain("RECORDED ORIGINAL REASON")
  expect(html).toContain("CURRENT ELIGIBILITY CHANGED")
  expect(html).toContain("does not change the stored decision")
  expect([...buttons.keys()]).toEqual(["Refresh original quotation"])
})
test("all original options retain independent totals, exact saved lines and unknown provenance without raw private fields", () => {
  reset()
  const html = original()
  for (const text of [
    "First alternative",
    "Second alternative",
    "Original Wash",
    "Express",
    "quantity 2",
    "₦10.00",
    "₦20.00",
    "not added together",
    "quantity Not recorded",
    "Unit price Not recorded",
    "historical name snapshot is not supplied",
  ])
    expect(html).toContain(text)
  for (const text of [
    "NEVER_RENDER",
    "PRIVATE_MAKER",
    "PRIVATE_SOURCE",
    "PRIVATE_OPTION_A",
    "₦30.00",
  ])
    expect(html).not.toContain(text)
})
test("current eligibility changes do not rewrite the recorded original decision/reason", () => {
  reset()
  detailQuery = ready({
    ...detail,
    currentReview: { stale: false, reason: null },
    actions: { ...detail.actions, canApprove: true, canReject: true },
  })
  const html = original()
  expect(html).toContain("Stored decision: rejected")
  expect(html).toContain("RECORDED ORIGINAL REASON")
  expect(html).toContain("eligible for a separate approval review")
  expect(html).not.toContain("Save and review")
})
test("original denied/stale/paused/wrongtuple/currentcrossscope hides historical facts and private fields", () => {
  for (const state of [
    { isFetching: true },
    { isPaused: true },
    { isError: true },
    { isFetchedAfterMount: false },
  ]) {
    reset()
    detailQuery = { ...ready(detail), ...state }
    const html = original()
    expect(html).not.toContain("RECORDED ORIGINAL REASON")
    expect(html).not.toContain("recorded-checker")
  }
  for (const patch of [
    { id: "foreign" },
    { quoteId: "foreign" },
    { quoteVersionId: "foreign" },
  ]) {
    reset()
    detailQuery = ready({ ...detail, ...patch })
    expect(original()).not.toContain("RECORDED ORIGINAL REASON")
  }
  reset()
  contextQuery = ready({ ...context, tenant: { id: "foreign" } })
  expect(original()).not.toContain("RECORDED ORIGINAL REASON")
  expect(generated.find((call) => call.name === "detail")?.enabled).toBe(false)
})
test("unknown saved actor/time/reason and empty options remain explicitly not recorded", () => {
  reset()
  detailQuery = ready({
    ...detail,
    decidedAt: null,
    decidedByMembershipId: null,
    reason: null,
    options: [],
  })
  const html = original()
  expect(html).toContain("Recorded decision actor membership: Not recorded")
  expect(html).toContain("Original reason: Not recorded")
  expect(html).toContain("Recorded decision (UTC): Not recorded")
  expect(html).toContain("No saved offer options recorded")
})
test("target authority injection is refused before any pure query", () => {
  reset()
  expect(original({ ...target, tenantId: "foreign" } as never)).toContain(
    "link or current business",
  )
  expect(generated).toEqual([])
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}
test("a queued local reason edit cancels deferred scope or review; a new Save owns the edited intent", async () => {
  for (const stage of ["context", "review"] as const) {
    reset()
    const old = deferred<unknown>()
    responses[stage] = old.promise
    editor()
    const save = buttons.get("Save and review")?.onPress
    save?.()
    await settle()
    editReason?.("New local reason")
    responses.context = context
    responses.review = { ...review, reason: "New local reason" }
    save?.()
    await settle()
    expect(saved).toEqual([{ ...initial, reason: "New local reason" }])
    old.resolve(stage === "context" ? context : review)
    await settle()
    expect(saved).toEqual([{ ...initial, reason: "New local reason" }])
  }
})
test("bad original money is withheld rather than formatted as saved precision", () => {
  for (const value of [
    Number.MAX_SAFE_INTEGER + 1,
    1000.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ]) {
    reset()
    detailQuery = ready({
      ...detail,
      totalMinor: value,
      options: [
        {
          ...detail.options[0],
          totalMinor: value,
          lines: [
            {
              ...detail.options[0]?.lines[0],
              unitPriceMinor: value,
              totalMinor: value,
            },
          ],
        },
      ],
    })
    const html = original()
    expect(html).toContain("Unavailable amount")
    expect(html).not.toContain("₦10.01")
    expect(html).not.toContain("₦NaN")
    expect(html).not.toContain("₦∞")
  }
})
