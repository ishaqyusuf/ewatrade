import { expect, mock, test } from "bun:test"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

// Actual native membership reader, with UI/query stand-ins. No database,
// network, staff mutation, device or saved-chat acceptance is exercised.
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
const buttons: { label: string; onPress: () => void }[] = []
standIn("components/mobile/action-button", {
  ActionButton: ({
    children,
    onPress,
  }: { children: string; onPress: () => void }) => {
    buttons.push({ label: children, onPress })
    return <button type="button">{children}</button>
  },
})
type Profile = {
  id: string
  businessId?: string
  storeId?: string
  role?: string
  staffAccessMode?: string
  catalogEditor?: boolean
  status?: string
}
const owner: Profile = {
  id: "actor",
  businessId: "business",
  storeId: "store",
  role: "OWNER",
  staffAccessMode: "LEGACY",
  status: "ACTIVE",
}
let profile: Profile | null = owner
standIn("hooks/use-auth", { useAuthContext: () => ({ profile }) })
const calls: { input: unknown; options: object }[] = []
const keys: unknown[][] = []
standIn("trpc/client", {
  useTRPC: () => ({
    retailOps: {
      staffDirectoryMember: {
        queryOptions: (input: unknown, options: object) => {
          calls.push({ input, options })
          return {
            queryKey: ["retailOps", "staffDirectoryMember", input],
            queryFn: async () => {
              throw Error("No request permitted")
            },
            ...options,
          }
        },
      },
    },
  }),
})
const member = {
  membershipId: "exact-membership-reference",
  name: "Amina Current",
  email: "amina@example.test",
  role: "CASHIER",
  status: "SUSPENDED",
  invitedAt: new Date("2026-10-01T10:12:00+01:00"),
  acceptedAt: new Date("2026-10-02T10:12:00+01:00"),
  createdAt: new Date("2026-09-30T10:12:00+01:00"),
  updatedAt: new Date("2026-10-15T10:12:00+01:00"),
  profileCoverage: "available",
  userId: "DO_NOT_SHOW_PRIVATE_USER_ID",
  token: "DO_NOT_SHOW_PRIVATE_TOKEN",
  grants: "DO_NOT_SHOW_PRIVATE_GRANTS",
  historyCoverage: "not_read",
}
let retries = 0
function ready() {
  return {
    isError: false,
    isSuccess: true,
    isFetching: false,
    isPaused: false,
    isFetchedAfterMount: true,
    data: member,
    refetch: async () => {
      retries++
    },
  }
}
let query = ready()
mock.module("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: unknown[] }) => {
    keys.push(options.queryKey)
    return query
  },
}))
const { NativeStaffMemberScreen } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/native-staff-member-screen"
)
const target = {
  kind: "staff_member",
  membershipId: member.membershipId,
} as const
const opened: NonNullable<GeneralAnswer["target"]>[] = []
function render(
  value: Parameters<typeof NativeStaffMemberScreen>[0]["target"] = target,
) {
  buttons.length = 0
  return renderToStaticMarkup(
    createElement(NativeStaffMemberScreen, {
      target: value,
      onOpen: (value) => {
        opened.push(value)
      },
    }),
  )
}

test("exact protected membership input and allowlisted current/original facts render", () => {
  profile = owner
  query = ready()
  const html = render()
  expect(calls.at(-1)?.input).toEqual({ membershipId: member.membershipId })
  expect(calls.at(-1)?.options).toMatchObject({
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    trpc: { abortOnUnmount: true },
  })
  for (const text of [
    member.name,
    member.email,
    member.membershipId,
    "Current role",
    "CASHIER",
    "Current status",
    "SUSPENDED",
    "2026-10-01T09:12:00.000Z",
    "2026-10-02T09:12:00.000Z",
    "2026-09-30T09:12:00.000Z",
    "2026-10-15T09:12:00.000Z",
    "Durable profile identity available",
    "does not establish invitation delivery or past access",
    "history have not been read",
  ])
    expect(html).toContain(text)
  for (const secret of [member.userId, member.token, member.grants])
    expect(html).not.toContain(secret)
})

test("Owner and Admin history handoff uses only the exact current membership filter", () => {
  query = ready()
  for (const role of ["OWNER", "ADMIN"]) {
    profile = { ...owner, role }
    render()
    buttons.find((row) => row.label === "Open history")?.onPress()
    expect(opened.at(-1)).toEqual({
      kind: "staff_history",
      filters: { membershipId: member.membershipId },
    })
  }
  profile = owner
})

test("legacy Manager can read the member but has no history button or mutation controls", () => {
  profile = { ...owner, role: "MANAGER", staffAccessMode: "LEGACY" }
  query = ready()
  const html = render()
  expect(html).toContain(member.name)
  expect(html).not.toContain("Open history")
  expect(buttons.map((row) => row.label)).toEqual(["Refresh member"])
  profile = owner
})

test("missing or ineligible scope refuses before any protected member query is prepared", () => {
  query = ready()
  const before = calls.length
  for (const scope of [
    null,
    { ...owner, businessId: undefined },
    { ...owner, id: "" },
    { ...owner, role: "CASHIER" },
    { ...owner, role: "MANAGER", staffAccessMode: "SCOPED" },
    { ...owner, role: "MANAGER", staffAccessMode: undefined },
    { ...owner, status: "SUSPENDED" },
    { ...owner, status: "INVITED" },
    { ...owner, status: "" },
  ]) {
    profile = scope
    const html = render()
    expect(html).toContain(
      "Current business staff-management access is required",
    )
    expect(html).not.toContain(member.email)
  }
  expect(calls).toHaveLength(before)
  profile = { ...owner, status: undefined }
  expect(render()).toContain(member.name)
  profile = owner
})

test("malformed or authority-bearing target refuses before preparing a query", () => {
  const before = calls.length
  for (const value of [
    null,
    {},
    { ...target, membershipId: " " },
    { ...target, membershipId: "x".repeat(161) },
    { ...target, tenantId: "foreign" },
    { ...target, url: "https://example.test" },
    { kind: "staff_history", membershipId: target.membershipId },
  ]) {
    const html = render(value as never)
    expect(html).toContain("staff member link is invalid")
    expect(html).not.toContain(member.name)
  }
  expect(calls).toHaveLength(before)
})

test("cached, fetching, paused, refused and pre-mount data withhold all member identities", () => {
  for (const state of [
    { isFetching: true },
    { isPaused: true },
    { isError: true },
    { isFetchedAfterMount: false },
    { isSuccess: false },
  ]) {
    query = { ...ready(), ...state }
    const html = render()
    for (const privateText of [
      member.name,
      member.email,
      member.membershipId,
      member.userId,
      member.token,
      member.grants,
    ])
      expect(html).not.toContain(privateText)
    expect(html).not.toContain("Open history")
    expect(html).not.toContain("Refresh member")
  }
})

test("a mismatched protected identity is unavailable and only offers retry", () => {
  query = { ...ready(), data: { ...member, membershipId: "wrong-membership" } }
  const html = render()
  expect(html).toContain("Staff membership is unavailable")
  expect(html).not.toContain(member.name)
  expect(html).not.toContain("wrong-membership")
  expect(buttons.map((row) => row.label)).toEqual(["Try again"])
  const before = retries
  buttons[0]?.onPress()
  expect(retries).toBe(before + 1)
})

test("unknown or invalid original dates are explicit and never inferred from created/updated", () => {
  query = {
    ...ready(),
    data: {
      ...member,
      invitedAt: null as never,
      acceptedAt: new Date("invalid"),
      profileCoverage: "unavailable",
    },
  }
  const html = render()
  expect(html).toContain("Invited at (UTC)</div><div>Not recorded")
  expect(html).toContain("Accepted at (UTC)</div><div>Not recorded")
  expect(html).toContain("2026-09-30T09:12:00.000Z")
  expect(html).toContain(
    "Durable profile unavailable; membership identity is shown",
  )
  expect(html).not.toContain("2026-10-01T09:12:00.000Z")
})

test("each reopen gets its own read cache entry", () => {
  query = ready()
  render()
  const first = keys.at(-1)
  render()
  expect(keys.at(-1)).not.toEqual(first)
  expect(keys.at(-1)?.slice(0, 3)).toEqual(first?.slice(0, 3))
})

test("actor, business, Store, role, access, status and exact target changes remount the reader", () => {
  profile = owner
  const key = NativeStaffMemberScreen({ target, onOpen: () => {} }).key
  for (const scope of [
    { ...owner, id: "new-actor" },
    { ...owner, businessId: "new-business" },
    { ...owner, storeId: "new-store" },
    { ...owner, role: "ADMIN" },
    { ...owner, staffAccessMode: "SCOPED" },
    { ...owner, status: undefined },
  ]) {
    profile = scope
    expect(NativeStaffMemberScreen({ target, onOpen: () => {} }).key).not.toBe(
      key,
    )
  }
  profile = owner
  expect(
    NativeStaffMemberScreen({
      target: { ...target, membershipId: "other-member" },
      onOpen: () => {},
    }).key,
  ).not.toBe(key)
})
