import { expect, mock, test } from "bun:test"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import type { ServiceIntakeAction } from "@ewatrade/assistant/general/service-intake"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  type NativeIntakeContinuation,
  type NativeIntakeOffering,
  intakeChoicePage,
} from "../../../../apps/mobile/src/components/mobile/assistant/native-service-intake-values"

// Real editor, schemas, exact values and freshness policy. Native/query stand-ins
// provide static source/callback proof; this is not device or connected acceptance.
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
])
  standIn(`components/${path}`, { [name]: children })
let buttons: { text: ReactNode; disabled?: boolean; onPress: () => void }[] = []
function Button({
  children,
  disabled,
  onPress,
}: { children: ReactNode; disabled?: boolean; onPress: () => void }) {
  buttons.push({ text: children, disabled, onPress })
  return (
    <button type="button" disabled={disabled}>
      {children}
    </button>
  )
}
standIn("components/mobile/action-button", { ActionButton: Button })
standIn("components/ui/pressable", { Pressable: Button })
const fieldChanges = new Map<string, (value: string) => void>()
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
    fieldChanges.set(label, onChangeText)
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
  storeId?: string
  role: string
  status?: string
  staffAccessMode?: string
  catalogEditor?: boolean
}
let profile: Profile = {
  id: "actor",
  businessId: "business",
  storeId: "private-store",
  role: "OWNER",
  status: "ACTIVE",
  staffAccessMode: "LEGACY",
}
standIn("hooks/use-auth", { useAuthContext: () => ({ profile }) })
const inputs: { procedure: string; input: unknown; flags: unknown }[] = []
const queries: { queryKey: readonly unknown[] }[] = []
function queryOptions(procedure: string) {
  return (input: unknown, flags: object) => {
    inputs.push({ procedure, input, flags })
    return {
      queryKey: [procedure, input],
      queryFn: () => {
        throw Error("Unexpected network request")
      },
      ...flags,
    }
  }
}
standIn("trpc/client", {
  useTRPC: () => ({
    serviceAssistantIntake: {
      options: { queryOptions: queryOptions("options") },
    },
    customers: { getById: { queryOptions: queryOptions("customer") } },
  }),
})
const tracked: NativeIntakeOffering = {
  offeringId: "private-track",
  itemName: "Laundry",
  variantName: "Shirt",
  offeringName: "Wash",
  fixedPriceMinor: 2500,
  service: { workPolicy: "TRACKED", authorizationPolicy: "MANUAL_RELEASE" },
}
const charge: NativeIntakeOffering = {
  offeringId: "private-charge",
  itemName: "Handling",
  variantName: "One",
  offeringName: "Fee",
  fixedPriceMinor: 1000,
  service: {
    workPolicy: "CHARGE_ONLY",
    authorizationPolicy: "ON_ORDER_CONFIRMATION",
  },
}
function originalContinuation(): NativeIntakeContinuation | null {
  return {
    query: undefined,
    cursor: "exact-catalog-cursor",
    offeringAfter: "exact-offering-after",
  }
}
const original = {
  storeId: "private-store",
  currencyCode: "NGN",
  offerings: [tracked, charge],
  assignees: [{ id: "private-staff", name: "Ada" }],
  continuation: originalContinuation(),
  exhaustive: false,
  coverage: "bounded_catalog_page",
  catalogItemsExamined: 20,
  truncated: true,
  settings: {},
  note: "bounded",
}
let refreshes = 0
function ready<T>(data: T) {
  return {
    data,
    isError: false,
    isSuccess: true,
    isFetching: false,
    isPaused: false,
    isFetchedAfterMount: true,
    refetch: async () => {
      refreshes += 1
    },
  }
}
let choices = ready(original)
let customer = ready({
  id: "private-customer",
  name: "Amina saved",
  phone: "08012345678",
  email: "amina.saved@example.test",
  privateMetadata: "never-visible",
})
mock.module("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: readonly unknown[] }) => {
    queries.push(options)
    return options.queryKey[0] === "options" ? choices : customer
  },
}))
const { GeneralServiceIntakeEditor, NativeIntakeOfferingFacts } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/general-service-intake-editor"
)
const initial: ServiceIntakeAction = {
  action: "service_intake",
  customerName: "Amina",
  customerPhone: "08012345678",
  customerEmail: "amina@example.test",
  lines: [
    { offeringId: "private-track", quantity: "0.123456" },
    { offeringId: "private-charge", quantity: "2" },
  ],
  instructions: "Handle gently",
  conditionNote: "One stain",
  requestedAssigneeId: "private-staff",
  requestedAt: "2026-10-15T11:23:45.123456+01:00",
  dueCommitmentAt: "2026-10-16T18:00:00.789123Z",
  priority: "urgent",
  serviceLevel: "express",
  initialPaymentMinor: 120001,
  initialPaymentMethod: "bank_transfer",
  initialPaymentReference: "Payment reference",
}
let saved: GeneralAction[] = []
function render(value = initial, disabled = false) {
  fieldChanges.clear()
  buttons = []
  saved = []
  return renderToStaticMarkup(
    createElement(GeneralServiceIntakeEditor, {
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
    storeId: "private-store",
    role: "OWNER",
    status: "ACTIVE",
    staffAccessMode: "LEGACY",
  }
  choices = ready(original)
  customer = ready({
    id: "private-customer",
    name: "Amina saved",
    phone: "08012345678",
    email: "amina.saved@example.test",
    privateMetadata: "never-visible",
  })
  refreshes = 0
}
function save() {
  const button = buttons.find((button) => button.text === "Save and review")
  expect(button).toBeDefined()
  button?.onPress()
  return button
}

test("full native editor shows all supported fields/work policies and saves only exact intention for parent re-review", () => {
  reset()
  const html = render()
  for (const label of [
    "Customer name",
    "Customer phone",
    "Customer email",
    "Exact quantity for service 1",
    "Instructions",
    "Condition note",
    "Assignee: Ada",
    "Requested date and time (UTC",
    "Promised date and time (UTC",
    "Urgent",
    "Express",
    "Initial payment already received (NGN",
    "Bank transfer",
    "Payment reference",
    "Tracked: creates queued Job Lines",
    "Charge only: no queued Job Line",
    "separate management release",
    "without payment and record payment with a receiving account",
    "Automatic customer reminders",
  ])
    expect(html).toContain(label)
  expect(html).toContain("0.123456")
  expect(html).toContain("2026-10-15T10:23:45.123456Z")
  expect(html).toContain("2026-10-16T18:00:00.789123Z")
  expect(html).toContain("1200.01")
  expect(save()?.disabled).toBe(false)
  expect(saved).toEqual([initial])
  for (const secret of [
    "private-track",
    "private-charge",
    "private-staff",
    "private-store",
  ])
    expect(html).not.toContain(secret)
})
test("queued quantity, text, payment and UTC events save their latest exact values before rerender", () => {
  reset()
  render()
  const changes = {
    "Exact quantity for service 1": "3.123456",
    "Exact quantity for service 2": "4",
    "Instructions (optional)": "Latest instructions",
    "Condition note (optional)": "Latest condition",
    "Initial payment already received (NGN, optional)": "250.05",
    "Requested date and time (UTC, optional)": "2026-10-17T09:00:00.000001Z",
    "Promised date and time (UTC, optional)": "2026-10-18T09:30:00.999999Z",
  }
  for (const [label, value] of Object.entries(changes)) {
    const change = fieldChanges.get(label)
    expect(change).toBeDefined()
    change?.(value)
  }
  // No second render occurs between these native callbacks and Save.
  save()
  expect(saved).toEqual([
    {
      ...initial,
      lines: [
        { offeringId: "private-track", quantity: "3.123456" },
        { offeringId: "private-charge", quantity: "4" },
      ],
      instructions: "Latest instructions",
      conditionNote: "Latest condition",
      initialPaymentMinor: 25005,
      requestedAt: "2026-10-17T09:00:00.000001Z",
      dueCommitmentAt: "2026-10-18T09:30:00.999999Z",
    },
  ])
})
test("options request is bounded canonical discovery with explicit continuation and no invented ID fields", () => {
  reset()
  const html = render()
  expect(
    inputs.filter((row) => row.procedure === "options").at(-1)?.input,
  ).toEqual({})
  expect(html).toContain("one bounded catalog page, not all services")
  expect(
    buttons.find((button) => button.text === "Next choices")?.disabled,
  ).toBe(false)
  expect(html).not.toContain("exact-catalog-cursor")
  expect(html).not.toContain("exact-offering-after")
  choices.data = { ...original, continuation: null, truncated: false }
  render()
  expect(
    buttons.find((button) => button.text === "Next choices")?.disabled,
  ).toBe(true)
})
test("unseen selected offering/assignee stays explicit unresolved rather than omitted or replaced", () => {
  reset()
  choices.data = { ...original, offerings: [charge], assignees: [] }
  const html = render()
  expect(html).toContain("Selected services (2/100)")
  expect(html).toContain("Selected service unresolved")
  expect(html).toContain("exact saved selection is retained")
  expect(html).toContain("Selected assignee unavailable")
  expect(save()?.disabled).toBe(true)
  expect(saved).toHaveLength(0)
})
test("multi-page selected facts retain historical provenance, not current-price authority, through actual facts component", () => {
  reset()
  const pageTwo = [{ ...charge, offeringId: "later-page" }]
  const merged = intakeChoicePage([tracked, charge], pageTwo, [
    tracked.offeringId,
    "later-page",
    "unseen",
  ])
  expect(merged.map((offering) => offering.offeringId)).toEqual([
    tracked.offeringId,
    "later-page",
  ])
  const earlier = merged[0]
  if (!earlier) throw Error("Selected earlier offering missing")
  const html = renderToStaticMarkup(
    createElement(NativeIntakeOfferingFacts, {
      offering: earlier,
      currencyCode: "NGN",
    }),
  )
  expect(html).toContain("Previously read on an earlier choices page")
  expect(html).toContain("Previously read price: 25 NGN")
  expect(html).toContain("price and availability must be reviewed again")
  expect(html).not.toContain("Fixed-price service on this choices page")
  const current = intakeChoicePage(
    merged,
    [{ ...tracked, fixedPriceMinor: 3000 }],
    [tracked.offeringId],
  )[0]
  if (!current) throw Error("Current read missing")
  const latest = renderToStaticMarkup(
    createElement(NativeIntakeOfferingFacts, {
      offering: current,
      currencyCode: "NGN",
    }),
  )
  expect(latest).toContain("Page price: 30 NGN")
  expect(latest).not.toContain("Previously read")
})
test("malformed price facts remain unavailable without throwing or inventing precise money", () => {
  for (const fixedPriceMinor of [
    null,
    -1,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    for (const previouslyRead of [false, true]) {
      const html = renderToStaticMarkup(
        createElement(NativeIntakeOfferingFacts, {
          offering: { ...tracked, fixedPriceMinor, previouslyRead },
          currencyCode: "NGN",
        }),
      )
      expect(html).toContain(
        `${previouslyRead ? "Previously read price" : "Page price"}: Unavailable`,
      )
      expect(html).not.toContain(" NGN")
    }
  }
  const zero = renderToStaticMarkup(
    createElement(NativeIntakeOfferingFacts, {
      offering: { ...tracked, fixedPriceMinor: 0 },
      currencyCode: "NGN",
    }),
  )
  expect(zero).toContain("Page price: 0 NGN")
})
test("saved customer uses fresh exact identity and contact summary without editable overrides", () => {
  reset()
  const value = {
    ...initial,
    customerId: "private-customer",
    customerName: undefined,
    customerPhone: undefined,
    customerEmail: undefined,
  }
  const html = render(value)
  expect(
    inputs.filter((row) => row.procedure === "customer").at(-1)?.input,
  ).toEqual({ customerId: "private-customer" })
  expect(html).toContain("Saved customer: Amina saved")
  expect(html).toContain("amina.saved@example.test")
  expect(html).not.toContain("Customer name (optional)")
  expect(html).not.toContain("never-visible")
  expect(html).not.toContain("private-customer")
  save()
  expect(saved).toEqual([value])
  customer = { ...customer, data: { ...customer.data, id: "foreign" } }
  expect(render(value)).not.toContain("Amina saved")
  expect(buttons.some((button) => button.text === "Save and review")).toBe(
    false,
  )
})
test("cached/fetching/paused/denied options or saved customer hide all selection facts and save controls", () => {
  for (const changes of [
    { isFetching: true },
    { isPaused: true },
    { isFetchedAfterMount: false },
    { isError: true },
  ]) {
    reset()
    choices = { ...choices, ...changes }
    const html = render()
    expect(html).not.toContain("Laundry")
    expect(html).not.toContain("Handle gently")
    expect(buttons.some((button) => button.text === "Save and review")).toBe(
      false,
    )
  }
  for (const changes of [
    { isFetching: true },
    { isPaused: true },
    { isError: true },
  ]) {
    reset()
    customer = { ...customer, ...changes }
    const html = render({
      ...initial,
      customerId: "private-customer",
      customerName: undefined,
      customerPhone: undefined,
      customerEmail: undefined,
    })
    expect(html).not.toContain("Amina saved")
    expect(html).not.toContain("Laundry")
    expect(buttons.some((button) => button.text === "Save and review")).toBe(
      false,
    )
  }
})
test("wrong Store/current role/status scope is refused without leaking choices", () => {
  reset()
  choices.data = { ...original, storeId: "different-store" }
  expect(render()).not.toContain("Laundry")
  expect(buttons.map((button) => button.text)).toEqual(["Retry intake choices"])
  for (const patch of [
    { id: "" },
    { businessId: undefined },
    { storeId: undefined },
    { role: "CASHIER" },
    { role: "OPERATOR" },
    { status: "SUSPENDED" },
  ]) {
    reset()
    profile = { ...profile, ...patch }
    const before = inputs.length
    expect(render()).toContain("access at the selected Store is required")
    expect(inputs.length).toBe(before)
  }
  for (const role of ["OWNER", "ADMIN", "MANAGER"]) {
    reset()
    profile.role = role
    expect(render()).toContain("Selected services (2/100)")
  }
})
test("all100 saved selected rows remain accessible and Add service is disabled at bound", () => {
  reset()
  const lines = Array.from({ length: 100 }, (_, index) => ({
    offeringId: `line-${index}`,
    quantity: "1",
  }))
  choices.data = {
    ...original,
    offerings: lines.map((line) => ({
      ...tracked,
      offeringId: line.offeringId,
    })),
  }
  const value = { ...initial, lines }
  const html = render(value)
  expect(html).toContain("Service 100:")
  expect(html).toContain("Exact quantity for service 100")
  expect(
    buttons.find((button) => button.text === "Add service")?.disabled,
  ).toBe(true)
  save()
  expect(saved).toEqual([value])
})
test("busy Save cannot return an intention; new mounts own independent fresh cancellable reads", () => {
  reset()
  render(initial, true)
  expect(save()?.disabled).toBe(true)
  expect(saved).toHaveLength(0)
  const first = queries.at(-2)?.queryKey
  profile = { ...profile, storeId: "changed-store" }
  render()
  expect(queries.at(-2)?.queryKey).not.toEqual(first)
  expect(
    inputs.filter((row) => row.procedure === "options").at(-1)?.flags,
  ).toEqual({
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    trpc: { abortOnUnmount: true },
  })
})
