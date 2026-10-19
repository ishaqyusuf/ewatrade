import { expect, mock, test } from "bun:test"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

// Actual original consumers and modal dispatch, with native/query stand-ins.
// No server, database, notification, staff write or device request is made.
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
standIn("components/mobile/action-button", {
  ActionButton: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
})
mock.module("react-native", () => ({ ScrollView: children }))
// Directory/member/history have their own isolated actual-component fixtures.
standIn("components/mobile/assistant/native-staff-read-screen", {
  NativeStaffReadScreen: () => <div>Separate staff read</div>,
})
let role = "OWNER"
standIn("hooks/use-auth", {
  useAuthContext: () => ({
    profile: {
      id: "actor",
      businessId: "business",
      storeId: "store",
      role,
      staffAccessMode: "LEGACY",
    },
  }),
})
const calls: { name: string; input: unknown }[] = []
function procedure(name: string) {
  return {
    queryOptions: (input: unknown, options: unknown) => {
      calls.push({ name, input })
      return {
        queryKey: [name, input],
        queryFn: async () => {
          throw Error("No request permitted")
        },
        ...(options as object),
      }
    },
  }
}
standIn("trpc/client", {
  useTRPC: () => ({
    retailOps: {
      staffStatusReceipt: procedure("status"),
      staffAccessReceipt: procedure("access"),
      staffInvitationCommand: procedure("invitation"),
    },
  }),
})
const common = {
  membershipId: "private-member",
  happenedAt: "2026-10-15T10:00:00Z",
  asOf: "2026-10-15T11:00:00Z",
  subject: { name: "Amina Current", email: "amina@example.test" },
  actor: { name: "Owner Current", email: "owner@example.test" },
  currentMembership: { role: "MANAGER", status: "ACTIVE", accessRevision: 9 },
  secret: "NEVER_RENDER",
}
const status = {
  ...common,
  eventId: "status-original",
  before: { role: "OPERATOR", status: "ACTIVE" },
  after: { role: "OPERATOR", status: "SUSPENDED" },
  reason: "Original leave reason",
}
const before = {
  coverage: "available",
  mode: "SCOPED",
  catalogEditor: false,
  businessRole: "OPERATOR",
  membershipStatus: "ACTIVE",
  defaultStore: { id: "s1", name: "Shop" },
  assignments: [
    { storeId: "s1", storeName: "Shop", role: "OPERATOR", status: "ACTIVE" },
  ],
}
const access = {
  ...common,
  eventId: "access-original",
  operation: "access_changed",
  revision: 8,
  before,
  after: {
    ...before,
    catalogEditor: true,
    assignments: [
      { storeId: "s1", storeName: "Shop", role: "MANAGER", status: "ACTIVE" },
    ],
  },
}
const invitation = {
  receipt: {
    commandId: "command-original",
    kind: "INVITE",
    details: {
      recipient: { name: "Amina Original", email: "invited@example.test" },
      grants: {
        role: "CASHIER",
        status: "INVITED",
        catalogEditor: false,
        defaultStoreId: "s1",
        assignments: [
          { storeId: "s1", storeName: "Shop Original", role: "CASHIER" },
        ],
      },
      membershipBefore: null,
      seats: { used: 2, limit: 5, additional: 1 },
      emailEffect: "REQUEST_INVITATION_EMAIL",
      reviewedAt: "2026-10-15T09:00:00Z",
      reason: null,
    },
  },
  savedAt: "2026-10-15T10:00:00Z",
  membership: { status: "ACTIVE", role: "OPERATOR", staffAccessRevision: 3 },
  invitation: {
    status: "ACCEPTED",
    expiresAt: "2026-10-16T10:00:00Z",
    acceptedAt: "2026-10-15T11:00:00Z",
    revokedAt: null,
  },
  notification: {
    status: "PENDING",
    failureCode: null,
    sentAt: null,
    deliveredAt: null,
  },
  acceptanceToken: "NEVER_RENDER",
  acceptanceUrl: "https://example.test/NEVER_RENDER",
}
function ready(data: unknown) {
  return {
    isError: false,
    isSuccess: true,
    isFetching: false,
    isPaused: false,
    isFetchedAfterMount: true,
    data,
    refetch: async () => {},
  }
}
let query = ready(status)
mock.module("@tanstack/react-query", () => ({ useQuery: () => query }))
const { StaffOriginalScreen } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/staff-original-screen"
)
const targets = [
  { kind: "staff_status", eventId: "status-original" },
  { kind: "staff_access", eventId: "access-original" },
  { kind: "staff_invitation", commandId: "command-original" },
] as const
const records = [status, access, invitation]
function render(index: number) {
  return renderToStaticMarkup(
    createElement(StaffOriginalScreen, { raw: JSON.stringify(targets[index]) }),
  )
}
test("all three native originals call only their exact protected read and render no private metadata", () => {
  role = "OWNER"
  for (const [index, record] of records.entries()) {
    query = ready(record)
    calls.length = 0
    const html = render(index)
    expect(calls).toEqual([
      {
        name: ["status", "access", "invitation"][index],
        input:
          index === 2
            ? { commandId: "command-original" }
            : { eventId: index === 0 ? "status-original" : "access-original" },
      },
    ])
    expect(html).toContain("Refresh original")
    expect(html).not.toContain("NEVER_RENDER")
    expect(html).not.toContain("private-member")
  }
})
test("fetching, paused, denied and old cached success never display original facts", () => {
  for (const [index, record] of records.entries())
    for (const flags of [
      { isFetching: true },
      { isPaused: true },
      { isError: true },
      { isFetchedAfterMount: false },
    ]) {
      query = { ...ready(record), ...flags }
      const html = render(index)
      expect(html).not.toContain("Amina")
      expect(html).not.toContain("Original leave reason")
      expect(html).not.toContain("Refresh original")
    }
})
test("a fresh response for another event or command is withheld rather than substituted", () => {
  for (const [index, record] of records.entries()) {
    query = ready(
      index === 2
        ? {
            ...invitation,
            receipt: { ...invitation.receipt, commandId: "other-command" },
          }
        : { ...record, eventId: "other-event" },
    )
    expect(render(index)).toContain(
      "unavailable for your current business or access",
    )
    expect(render(index)).not.toContain("Amina")
  }
})
test("role loss and malformed targets mount no read or stale original", () => {
  calls.length = 0
  role = "MANAGER"
  query = ready(status)
  expect(render(0)).toContain("Current Owner or Admin")
  expect(calls).toHaveLength(0)
  role = "OWNER"
  for (const raw of [
    "",
    "{",
    [JSON.stringify(targets[0])],
    JSON.stringify({ ...targets[0], tenantId: "other" }),
  ]) {
    expect(renderToStaticMarkup(<StaffOriginalScreen raw={raw} />)).toContain(
      "link is invalid",
    )
    expect(calls).toHaveLength(0)
  }
})
test("saved status and current membership/identity retain their separate provenance", () => {
  query = ready(status)
  const html = render(0)
  for (const text of [
    "Original saved status",
    "suspended",
    "Original leave reason",
    "Current directory identities",
    "Amina Current",
    "Current membership",
    "access revision 9",
    "Original Store grants",
    "not recorded here",
  ])
    expect(html).toContain(text)
})
test("access originals disclose unavailable snapshots and unrecorded reason/handover", () => {
  query = ready({
    ...access,
    before: { coverage: "not_recorded" },
    after: { ...before, coverage: "partial", assignments: null },
  })
  const html = render(1)
  for (const text of [
    "Original saved Store access",
    "not recorded",
    "Store assignments were not recorded",
    "Some original Store references",
    "Original reason, historical names and service handover",
  ])
    expect(html).toContain(text)
})
test("hidden original Store references are not reported as an empty saved assignment list", () => {
  query = ready({
    ...access,
    before: {
      ...before,
      coverage: "partial",
      assignments: [],
      defaultStore: null,
      hiddenStoreReferences: 2,
    },
    after: { coverage: "not_recorded" },
  })
  const html = render(1)
  expect(html).toContain(
    "No original Store assignments are visible for this business",
  )
  expect(html).not.toContain("No Store assignments in this snapshot")
  expect(html).not.toContain("NEVER_RENDER")
})

test("invitation delivery never treats queued or uncertain output as delivered or activated", () => {
  for (const [status, expected] of [
    ["PENDING", "Queued"],
    ["SENT", "Provider accepted"],
    ["OUTCOME_UNKNOWN", "Sending outcome unknown"],
    ["DELIVERED", "Delivered"],
  ]) {
    query = ready({
      ...invitation,
      notification: { ...invitation.notification, status },
    })
    const html = render(2)
    expect(html).toContain(expected ?? "")
    expect(html).toContain("saved or queued".replace("saved", "Saved"))
    expect(html).toContain("separate states")
    expect(html).not.toContain("NEVER_RENDER")
  }
  query = ready({
    ...invitation,
    notification: {
      ...invitation.notification,
      status: "SENT",
      failureCode: "PROVIDER_BOUNCED",
    },
  })
  expect(render(2)).toContain("Delivery bounced")
})
test("legacy invitation commands never reconstruct missing original grants from current membership", () => {
  query = ready({
    ...invitation,
    receipt: { ...invitation.receipt, details: undefined },
  })
  const html = render(2)
  expect(html).toContain("Original review details were not recorded")
  expect(html).not.toContain("Shop Original")
  expect(html).not.toContain("invited@example.test")
})
let routeParams: { target?: unknown } = {}
mock.module("expo-router", () => ({ useLocalSearchParams: () => routeParams }))
standIn("components/mobile/staff/staff-screen", {
  StaffInviteContent: () => <span>Ordinary staff directory</span>,
  StaffChrome: children,
})
standIn("components/mobile/workflow-modal-screen", {
  WorkflowModalScreen: ({
    children,
    back,
    closeLabel,
  }: { children: ReactNode; back?: boolean; closeLabel: string }) => (
    <div data-back={String(Boolean(back))}>
      {closeLabel}
      {children}
    </div>
  ),
})
const { default: StaffRoute } = await import(
  "../../../../apps/mobile/src/app/staff-invite-modal"
)
test("existing staff route preserves its directory and returns original views through the back stack", () => {
  routeParams = {}
  expect(renderToStaticMarkup(<StaffRoute />)).toContain(
    "Ordinary staff directory",
  )
  routeParams = { target: "malformed" }
  const html = renderToStaticMarkup(<StaffRoute />)
  expect(html).toContain('data-back="true"')
  expect(html).toContain("Back to the assistant")
  expect(html).toContain("link is invalid")
  expect(html).not.toContain("Ordinary staff directory")
})
