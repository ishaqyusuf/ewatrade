import { expect, mock, test } from "bun:test"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

// Actual screen, schema, freshness helper and event callbacks; native primitives,
// profile and protected query hook are isolated stand-ins. No device/network proof.
const root = new URL("../../../../", import.meta.url)
function standIn(path: string, value: Record<string, unknown>) {
  mock.module(new URL(`apps/mobile/src/${path}`, root).pathname, () => value)
}
const children = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
)
// Retain the shared search contract while isolating native keyboard furniture.
standIn("components/mobile/search-footer-scope", {
  SearchFooterScope: children,
  SearchFooterSpacer: () => null,
  SearchFooterField: ({
    accessibilityLabel,
    value,
  }: {
    accessibilityLabel: string
    value: string
  }) => (
    <label>
      {accessibilityLabel}
      <input value={value} readOnly />
    </label>
  ),
})
standIn("components/ui/view", { View: children })
standIn("components/ui/text", { Text: children })
mock.module("react-native", () => ({ ScrollView: children }))
type ButtonRecord = { text: ReactNode; label?: string; onPress: () => void }
let buttons: ButtonRecord[] = []
function Button({
  children,
  accessibilityLabel,
  onPress,
}: { children: ReactNode; accessibilityLabel?: string; onPress: () => void }) {
  buttons.push({ text: children, label: accessibilityLabel, onPress })
  return <button type="button">{children}</button>
}
standIn("components/mobile/action-button", { ActionButton: Button })
standIn("components/ui/pressable", { Pressable: Button })
standIn("components/mobile/form-field", {
  FormField: ({ label, value }: { label: string; value: string }) => (
    <label>
      {label}
      <input value={value} readOnly />
    </label>
  ),
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
  storeId: "selected-store-not-filter",
  role: "OWNER",
  status: "ACTIVE",
  staffAccessMode: "LEGACY",
}
standIn("hooks/use-auth", { useAuthContext: () => ({ profile }) })
const inputs: unknown[] = []
const flags: unknown[] = []
const queries: { queryKey: readonly unknown[] }[] = []
standIn("trpc/client", {
  useTRPC: () => ({
    retailOps: {
      staffDirectoryPage: {
        queryOptions: (input: unknown, options: object) => {
          inputs.push(input)
          flags.push(options)
          return {
            queryKey: ["retailOps", "staffDirectoryPage", input],
            queryFn: () => {
              throw Error("Unexpected network request")
            },
            ...options,
          }
        },
      },
    },
  }),
})
const membership = {
  membershipId: "private-member-a",
  userId: "private-user",
  name: "Alex",
  email: "alex.a@example.test",
  role: "CASHIER",
  status: "INVITED",
  invitedAt: "2026-10-15T12:00:00.000Z",
  acceptedAt: null,
  createdAt: "2026-10-15T12:00:00.000Z",
  updatedAt: "2026-10-15T12:00:00.000Z",
  profileCoverage: "available",
  passwordHash: "private-never-show",
  profileMetadata: { secret: "private-metadata" },
}
const original = {
  data: [
    membership,
    {
      ...membership,
      membershipId: "private-member-b",
      email: "alex.b@example.test",
      role: "OPERATOR",
      status: "ACTIVE",
      acceptedAt: "2026-10-15T12:30:00.000Z",
      profileCoverage: "unavailable",
    },
  ],
  total: 31,
  nextCursor: "exact-next-cursor",
  scope: "active_store_assignments",
  assignmentStoreId: "original-assignment-store",
  asOf: "2026-10-15T13:00:00.000Z",
  coverage: {
    directory: "current_memberships",
    profile: "partial",
    history: "not_read",
  },
}
let refreshes = 0
function ready() {
  return {
    isError: false,
    isSuccess: true,
    isFetching: false,
    isPaused: false,
    isFetchedAfterMount: true,
    data: original,
    refetch: async () => {
      refreshes += 1
    },
  }
}
let query = ready()
mock.module("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: readonly unknown[] }) => {
    queries.push(options)
    return query
  },
}))
const { NativeStaffDirectoryScreen } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/native-staff-directory-screen"
)
type Target = Extract<
  NonNullable<GeneralAnswer["target"]>,
  { kind: "staff_directory" }
>
const target: Target = {
  kind: "staff_directory",
  filters: {
    search: "Alex",
    role: "CASHIER",
    status: "INVITED",
    assignmentStoreId: "original-assignment-store",
    cursor: "exact-original-cursor",
  },
}
let opened: NonNullable<GeneralAnswer["target"]>[] = []
function render(value = target) {
  opened = []
  buttons = []
  return renderToStaticMarkup(
    createElement(NativeStaffDirectoryScreen, {
      target: value,
      onOpen: (next) => opened.push(next),
    }),
  )
}
function press(text: string) {
  const button = buttons.find((button) => button.text === text)
  expect(button).toBeDefined()
  button?.onPress()
}
function reset() {
  profile = {
    id: "actor",
    businessId: "business",
    storeId: "selected-store-not-filter",
    role: "OWNER",
    status: "ACTIVE",
    staffAccessMode: "LEGACY",
  }
  query = ready()
  refreshes = 0
}

test("directory uses exact original filters plus limit10 and displays complete total separately from bounded page", () => {
  reset()
  const html = render()
  expect(inputs.at(-1)).toEqual({ ...target.filters, limit: 10 })
  expect(html).toContain("31 matching memberships · 2 on this page")
  expect(html).toContain("2026-10-15T13:00:00.000Z UTC")
  expect(html).toContain("total covers all matching")
  expect(html).toContain("Page results may change between requests")
  expect(html).toContain("explicit active Store assignments")
  expect(html).toContain("original saved Store assignment filter is retained")
  expect(html).toContain("History has not been")
  expect(html).toContain("legacy Store")
  expect(html).toContain("Some durable profiles are unavailable")
  expect(html).not.toContain("selected-store-not-filter")
  expect(html).not.toContain("original-assignment-store")
})
test("same-name memberships remain separate with exact email, role/status, UTC dates and membership Open", () => {
  reset()
  const html = render()
  expect(html.match(/>Alex<\/div>/g)).toHaveLength(2)
  expect(html).toContain("alex.a@example.test")
  expect(html).toContain("alex.b@example.test")
  expect(html).toContain("Cashier · Invited")
  expect(html).toContain("Operator · Active")
  expect(html).toContain("2026-10-15T12:30:00.000Z UTC")
  expect(html).toContain("Accepted: Not recorded UTC")
  expect(html).toContain("Durable staff profile unavailable")
  const memberButtons = buttons.filter(
    (button) => button.text === "Open membership",
  )
  expect(memberButtons.map((button) => button.label)).toEqual([
    "Open membership 1: Alex, alex.a@example.test",
    "Open membership 2: Alex, alex.b@example.test",
  ])
  for (const button of memberButtons) button.onPress()
  expect(opened).toEqual([
    { kind: "staff_member", membershipId: "private-member-a" },
    { kind: "staff_member", membershipId: "private-member-b" },
  ])
  for (const value of [
    "private-member",
    "private-user",
    "private-never-show",
    "private-metadata",
  ])
    expect(html).not.toContain(value)
})
test("Next preserves all saved filters and exact cursor; First removes only cursor; Refresh does not navigate", () => {
  reset()
  render()
  press("Next page")
  expect(opened).toEqual([
    {
      kind: "staff_directory",
      filters: { ...target.filters, cursor: "exact-next-cursor" },
    },
  ])
  press("First page")
  const { cursor: _cursor, ...filters } = target.filters
  expect(opened.at(-1)).toEqual({ kind: "staff_directory", filters })
  const before = opened.length
  press("Refresh directory")
  expect(refreshes).toBe(1)
  expect(opened.length).toBe(before)
})
test("fetching, paused, initial cached and denied results hide all private rows/totals/navigation", () => {
  for (const change of [
    { isFetching: true },
    { isPaused: true },
    { isFetchedAfterMount: false },
    { isError: true },
  ]) {
    reset()
    query = { ...query, ...change }
    const html = render()
    expect(html).not.toContain("Alex")
    expect(html).not.toContain("31 matching")
    expect(buttons.some((button) => button.text === "Next page")).toBe(false)
    expect(buttons.some((button) => button.text === "Open membership")).toBe(
      false,
    )
    expect(opened).toHaveLength(0)
  }
  expect(render()).toContain("original filters and cursor have been kept")
  expect(render()).not.toContain("First page")
  press("Retry directory")
  expect(refreshes).toBe(1)
})
test("current role/status/business guard blocks scoped/unknown Managers, cashier, removed actor and missing business before reads", () => {
  for (const patch of [
    { role: "MANAGER", staffAccessMode: "SCOPED" },
    { role: "MANAGER", staffAccessMode: undefined },
    { role: "CASHIER" },
    { role: "OPERATOR" },
    { status: "SUSPENDED" },
    { status: "REMOVED" },
    { status: "" },
    { businessId: undefined },
    { id: "" },
  ]) {
    reset()
    profile = { ...profile, ...patch }
    const before = inputs.length
    const html = render()
    expect(html).toContain("legacy Manager access is required")
    expect(html).not.toContain("Alex")
    expect(inputs.length).toBe(before)
  }
  for (const patch of [
    { role: "OWNER" },
    { role: "ADMIN" },
    { role: "MANAGER", staffAccessMode: "LEGACY" },
    { status: undefined },
  ]) {
    reset()
    profile = { ...profile, ...patch }
    expect(render()).toContain("31 matching memberships")
  }
})
test("bad cursor refusal is retained without automatic first-page navigation or zero claim", () => {
  reset()
  query.isError = true
  const html = render()
  expect(inputs.at(-1)).toEqual({ ...target.filters, limit: 10 })
  expect(html).toContain("No empty")
  expect(html).toContain("zero total is inferred")
  expect(opened).toHaveLength(0)
  expect(buttons.map((button) => button.text)).toEqual(["Retry directory"])
})
test("empty continuation is not an empty business claim; unknown identity/date facts remain explicit", () => {
  reset()
  query.data = { ...original, data: [], total: 31, nextCursor: null }
  const html = render()
  expect(html).toContain("31 matching memberships · 0 on this page")
  expect(html).toContain("No memberships on this continuation page")
  expect(html).not.toContain("No staff")
  expect(buttons.some((button) => button.text === "Next page")).toBe(false)
  query.data = {
    ...original,
    data: [
      {
        ...membership,
        name: "",
        email: "",
        invitedAt: "invalid",
        acceptedAt: null,
      },
    ],
  }
  const unknown = render()
  expect(unknown).toContain("Name not recorded")
  expect(unknown).toContain("Email not recorded")
  expect(unknown).toContain("Invited: Not recorded UTC")
})
test("wrong saved Store scope and invalid navigation fields fail closed", () => {
  reset()
  query.data = { ...original, assignmentStoreId: "foreign-store" }
  expect(render()).not.toContain("alex.a@example.test")
  expect(opened).toHaveLength(0)
  const before = inputs.length
  const injected = {
    ...target,
    filters: { ...target.filters, actorUserId: "foreign" },
  }
  expect(render(injected)).toContain("directory link is invalid")
  expect(inputs.length).toBe(before)
})
test("each mount owns a distinct fresh read with cancellation and strict retry settings", () => {
  reset()
  render()
  const first = queries.at(-1)?.queryKey
  profile = { ...profile, storeId: "changed-selected-store" }
  render()
  expect(queries.at(-1)?.queryKey).not.toEqual(first)
  expect(inputs.at(-1)).toEqual({ ...target.filters, limit: 10 })
  expect(flags.at(-1)).toEqual({
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    trpc: { abortOnUnmount: true },
  })
})
