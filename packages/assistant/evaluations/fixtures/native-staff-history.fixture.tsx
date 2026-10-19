import { expect, mock, test } from "bun:test"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
// Actual component/freshness/target validation, with native furniture and query
// transport stand-ins. This is not device, DB or layout acceptance.
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
const controls: Map<string, () => void> = new Map()
standIn("components/mobile/action-button", {
  ActionButton: ({
    children,
    onPress,
  }: { children: ReactNode; onPress: () => void }) => {
    controls.set(String(children), onPress)
    return <button type="button">{children}</button>
  },
})
mock.module("react-native", () => ({ ScrollView: children }))
let profile = {
  id: "actor",
  businessId: "business",
  storeId: "store",
  role: "OWNER",
  status: "ACTIVE" as string | undefined,
  staffAccessMode: "LEGACY",
  catalogEditor: true,
}
standIn("hooks/use-auth", { useAuthContext: () => ({ profile }) })
const inputs: unknown[] = []
const keys: unknown[] = []
standIn("trpc/client", {
  useTRPC: () => ({
    retailOps: {
      staffHistoryPage: {
        queryOptions: (input: unknown, options: object) => {
          inputs.push(input)
          return {
            queryKey: ["history", input],
            queryFn: async () => {
              throw Error("No network request permitted")
            },
            ...options,
          }
        },
      },
    },
  }),
})
const identity = {
  coverage: "available",
  membershipId: "private-member",
  userId: "private-user",
  name: "Amina Current",
  email: "amina@example.test",
}
const actor = {
  ...identity,
  membershipId: "private-owner",
  userId: "private-owner-user",
  name: "Owner Current",
}
const event = {
  id: "private-event",
  at: "2026-10-15T10:00:00.000Z",
  stream: "LIFECYCLE",
  source: "RetailOpsStaffLifecycleEvent",
  eventType: "SUSPENDED",
  subject: identity,
  actor,
  reason: "Original leave reason",
  before: { role: "OPERATOR", status: "ACTIVE", privateValue: "NEVER_RENDER" },
  after: { role: "OPERATOR", status: "SUSPENDED" },
  privateValue: "NEVER_RENDER",
}
const snapshot = {
  coverage: "available",
  mode: "SCOPED",
  businessRole: "CASHIER",
  membershipStatus: "ACTIVE",
  catalogEditor: false,
  defaultStore: { id: "private-shop", name: "Shop Now" },
  assignments: [
    {
      storeId: "private-shop",
      storeName: "Shop Now",
      role: "MANAGER",
      status: "ACTIVE",
    },
  ],
  hiddenStoreReferences: 0,
  secret: "NEVER_RENDER",
}
const access = {
  id: "private-access-event",
  at: "2026-10-15T11:00:00.000Z",
  stream: "STORE_ACCESS",
  source: "StaffAccessAuditEvent",
  eventType: "STORE_ACCESS_CHANGED",
  subject: identity,
  actor,
  revision: 7,
  before: snapshot,
  after: { ...snapshot, catalogEditor: true },
}
const original = {
  data: [event],
  total: 1,
  knownMatchingEvents: 1,
  nextCursor: "next-exact-cursor",
  asOf: "2026-10-15T11:30:00.000Z",
  scope: "tenant_staff_history",
  coverage: {
    history: "partial",
    lifecycle: "available",
    access: "available",
    identities: "available",
    detail: "NEVER_RENDER",
  },
  privateValue: "NEVER_RENDER",
}
function ready(data: unknown = original) {
  return {
    isError: false,
    isSuccess: true,
    isFetching: false,
    isPaused: false,
    isFetchedAfterMount: true,
    data,
    refetch: async () => {
      refreshes++
    },
  }
}
let refreshes = 0
let query = ready()
mock.module("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: unknown }) => {
    keys.push(options.queryKey)
    return query
  },
}))
const { NativeStaffHistoryScreen } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/native-staff-history-screen"
)
type Target = Extract<
  NonNullable<GeneralAnswer["target"]>,
  { kind: "staff_history" }
>
const opened: NonNullable<GeneralAnswer["target"]>[] = []
function render(target: Target = { kind: "staff_history", filters: {} }) {
  controls.clear()
  return renderToStaticMarkup(
    createElement(NativeStaffHistoryScreen, {
      target,
      onOpen: (next) => opened.push(next),
    }),
  )
}
test("protected request preserves all exact saved filters/cursor and only adds the ten-event limit", () => {
  query = ready()
  const filters = {
    membershipId: "private-member",
    actorMembershipId: "private-owner",
    stream: "LIFECYCLE" as const,
    eventType: "SUSPENDED" as const,
    from: "2026-10-15T09:00:00.000+01:00",
    to: "2026-10-16T09:00:00.000+01:00",
    cursor: "saved-cursor",
  }
  const html = render({ kind: "staff_history", filters })
  expect(inputs.at(-1)).toEqual({ ...filters, limit: 10 })
  expect(html).toContain("From (UTC, inclusive): 2026-10-15T08:00:00.000Z")
  expect(html).toContain("Until (UTC, exclusive): 2026-10-16T08:00:00.000Z")
  expect(html).toContain("Subject: selected saved membership")
  expect(html).not.toContain("private-member")
  expect(html).not.toContain("saved-cursor")
})
test("next preserves filters exactly and first removes only the cursor", () => {
  query = ready()
  opened.length = 0
  const filters = {
    membershipId: "private-member",
    actorMembershipId: "private-owner",
    from: "2026-10-15T00:00:00.000Z",
    to: "2026-10-16T00:00:00.000Z",
    stream: "LIFECYCLE" as const,
    cursor: "old-cursor",
  }
  render({ kind: "staff_history", filters })
  controls.get("Next page")?.()
  expect(opened.at(-1)).toEqual({
    kind: "staff_history",
    filters: { ...filters, cursor: "next-exact-cursor" },
  })
  controls.get("First page")?.()
  const { cursor: _cursor, ...first } = filters
  expect(opened.at(-1)).toEqual({ kind: "staff_history", filters: first })
  expect("cursor" in (opened.at(-1) as Target).filters).toBe(false)
})
test("fresh mount cache keys change on reopen and scope keys include actor/business/Store/role/status/target", () => {
  query = ready()
  render()
  const first = keys.at(-1)
  render()
  expect(keys.at(-1)).not.toEqual(first)
  const target: Target = { kind: "staff_history", filters: {} }
  const base = NativeStaffHistoryScreen({ target, onOpen: () => {} }).key
  for (const patch of [
    { id: "other" },
    { businessId: "other" },
    { storeId: "other" },
    { role: "ADMIN" },
    { staffAccessMode: "SCOPED" },
    { catalogEditor: false },
  ]) {
    const before = profile
    profile = { ...profile, ...patch }
    expect(NativeStaffHistoryScreen({ target, onOpen: () => {} }).key).not.toBe(
      base,
    )
    profile = before
  }
  expect(
    NativeStaffHistoryScreen({
      target: { ...target, filters: { cursor: "changed" } },
      onOpen: () => {},
    }).key,
  ).not.toBe(base)
})
test("stale paused denied or not-fetched-after-mount facts and navigation controls stay hidden", () => {
  for (const state of [
    { isFetching: true },
    { isPaused: true },
    { isError: true },
    { isFetchedAfterMount: false },
  ]) {
    query = { ...ready(), ...state }
    const html = render()
    expect(html).not.toContain("Amina Current")
    expect(html).not.toContain("Original leave reason")
    expect(html).not.toContain("Next page")
    expect(html).not.toContain("Open original saved event")
  }
})
test("current nonadministrative or inactive profiles issue no history request", () => {
  const base = profile
  for (const patch of [
    { role: "MANAGER" },
    { role: "CASHIER" },
    { role: "OPERATOR" },
    { status: "SUSPENDED" },
    { status: "INVITED" },
    { businessId: "" },
    { id: "" },
  ]) {
    profile = { ...base, ...patch }
    const before = inputs.length
    expect(render()).toContain("Current active Owner or Admin")
    expect(inputs.length).toBe(before)
  }
  profile = base
})
test("invalid injected authority and backwards interval fail before request", () => {
  const before = inputs.length
  expect(
    render({
      kind: "staff_history",
      filters: { tenantId: "foreign" } as never,
    }),
  ).toContain("link is invalid")
  expect(
    render({
      kind: "staff_history",
      filters: {
        from: "2026-10-16T00:00:00.000Z",
        to: "2026-10-15T00:00:00.000Z",
      },
    }),
  ).toContain("link is invalid")
  expect(inputs.length).toBe(before)
})
test("current identities are distinct from original role/status/reason with no private JSON rendered", () => {
  query = ready()
  const html = render()
  for (const text of [
    "Amina Current",
    "Owner Current",
    "Original leave reason",
    "Recorded role: operator",
    "Recorded status: suspended",
    "Current directory label, not an original event identity snapshot",
    "Legacy history is partial",
    "RetailOpsStaffLifecycleEvent",
  ])
    expect(html).toContain(text)
  expect(html).not.toContain("NEVER_RENDER")
  expect(html).not.toContain("private-event")
  controls.get("Open original saved event")?.()
  expect(opened.at(-1)).toEqual({
    kind: "staff_status",
    eventId: "private-event",
  })
})
test("access snapshots keep original grants and current Store labels; exact supported source opens its access event", () => {
  query = ready({ ...original, data: [access] })
  const html = render()
  for (const text of [
    "Recorded access mode: scoped",
    "Recorded business role: cashier",
    "Shop Now",
    "manager · active",
    "Saved access revision: 7",
    "Store names are current directory labels",
    "Not recorded by this access command",
  ])
    expect(html).toContain(text)
  expect(html).not.toContain("NEVER_RENDER")
  expect(html).not.toContain("private-shop")
  controls.get("Open original saved event")?.()
  expect(opened.at(-1)).toEqual({
    kind: "staff_access",
    eventId: "private-access-event",
  })
})
test("unavailable identities, missing snapshots and private unknown metadata are never reconstructed", () => {
  query = ready({
    ...original,
    data: [
      {
        ...access,
        subject: {
          ...identity,
          coverage: "unavailable",
          name: "PRIVATE_NAME",
          email: "PRIVATE_EMAIL",
        },
        actor: { ...actor, coverage: "historical_profile" },
        before: { coverage: "not_recorded", raw: "PRIVATE_SNAPSHOT" },
        after: { coverage: "unavailable", raw: "PRIVATE_SNAPSHOT" },
      },
    ],
  })
  const html = render()
  expect(html).toContain("Subject: Unavailable")
  expect(html).toContain("saved historical profile")
  expect(html).toContain("Original snapshot not recorded")
  expect(html).toContain("Original snapshot unavailable")
  for (const text of ["PRIVATE_NAME", "PRIVATE_EMAIL", "PRIVATE_SNAPSHOT"])
    expect(html).not.toContain(text)
})
test("missing streams retain known counts but never claim a full total or complete legacy history", () => {
  query = ready({
    ...original,
    data: [],
    total: null,
    knownMatchingEvents: 6,
    nextCursor: null,
    coverage: {
      ...original.coverage,
      lifecycle: "unavailable",
      identities: "partial",
    },
  })
  const html = render()
  for (const text of [
    "6 known recorded events",
    "full matching total unknown",
    "0 on this page",
    "Lifecycle stream: unavailable",
    "No matching events in the available recorded streams",
    "does not establish complete legacy history",
  ])
    expect(html).toContain(text)
})
test("all ten canonical events render and unsupported event types never get guessed receipt links", () => {
  query = ready({
    ...original,
    data: Array.from({ length: 10 }, (_, index) => ({
      ...event,
      id: `event-${index}`,
      eventType: "INVITED",
      reason: `Original reason ${index}`,
    })),
    total: 16,
    knownMatchingEvents: 16,
  })
  const html = render()
  expect(html).toContain("10 on this page")
  for (let i = 0; i < 10; i++) expect(html).toContain(`Original reason ${i}`)
  expect(html).not.toContain("Open original saved event")
  expect(html).toContain("No separate supported original-event view")
})
test("cross-scope or wrong filtered identities/time/source refuse all facts", () => {
  for (const data of [
    { ...original, scope: "recorded_store_access" },
    {
      ...original,
      data: [{ ...event, subject: { ...identity, membershipId: "foreign" } }],
    },
    { ...original, data: [{ ...event, at: "2026-10-16T00:00:00.000Z" }] },
    { ...original, data: [{ ...event, source: "WrongPrivateSource" }] },
  ]) {
    query = ready(data)
    const html = render({
      kind: "staff_history",
      filters: {
        membershipId: "private-member",
        from: "2026-10-15T00:00:00.000Z",
        to: "2026-10-16T00:00:00.000Z",
      },
    })
    expect(html).toContain("unavailable for the selected business")
    expect(html).not.toContain("Amina Current")
    expect(html).not.toContain("Next page")
  }
})
test("recorded Store filter preserves exact query and discloses excluded membership stream", () => {
  query = ready({
    ...original,
    data: [access],
    scope: "recorded_store_access",
    coverage: { ...original.coverage, lifecycle: "not_requested" },
  })
  const html = render({
    kind: "staff_history",
    filters: {
      storeId: "private-shop",
      stream: "STORE_ACCESS",
      eventType: "STORE_ACCESS_CHANGED",
    },
  })
  expect(inputs.at(-1)).toEqual({
    storeId: "private-shop",
    stream: "STORE_ACCESS",
    eventType: "STORE_ACCESS_CHANGED",
    limit: 10,
  })
  expect(html).toContain("business membership events are excluded")
  expect(html).not.toContain("private-shop")
})
test("Refresh and refused Retry invoke only the protected query refetch", () => {
  query = ready()
  render()
  const before = refreshes
  controls.get("Refresh history")?.()
  expect(refreshes).toBe(before + 1)
  query = { ...ready(), isError: true }
  render()
  controls.get("Retry history")?.()
  expect(refreshes).toBe(before + 2)
})

test("legacy mobile profile with omitted optional status can request protected current history", () => {
  const before = profile
  profile = { ...before, status: undefined }
  query = ready()
  const count = inputs.length
  const html = render()
  expect(inputs.length).toBe(count + 1)
  expect(html).toContain("Amina Current")
  expect(html).toContain("Recorded staff history")
  profile = before
})

test("hidden-only Store snapshot reports no visible assignments without asserting no original grants", () => {
  const hidden = {
    ...snapshot,
    coverage: "partial",
    defaultStore: null,
    assignments: [],
    hiddenStoreReferences: 2,
    privateStoreId: "PRIVATE_STORE_REFERENCE",
    privateStoreName: "PRIVATE_STORE_NAME",
  }
  query = ready({
    ...original,
    data: [{ ...access, before: hidden, after: hidden }],
  })
  const html = render()
  expect(html).toContain(
    "No original Store assignments are visible for this business.",
  )
  expect(html).toContain("Some original Store references are unavailable")
  expect(html).not.toContain("No Store assignments in this snapshot.")
  expect(html).not.toContain("PRIVATE_STORE_REFERENCE")
  expect(html).not.toContain("PRIVATE_STORE_NAME")
  query = ready({
    ...original,
    data: [
      {
        ...access,
        before: { ...hidden, hiddenStoreReferences: 0 },
        after: { ...hidden, hiddenStoreReferences: 0 },
      },
    ],
  })
  expect(render()).toContain("No Store assignments in this snapshot.")
})
