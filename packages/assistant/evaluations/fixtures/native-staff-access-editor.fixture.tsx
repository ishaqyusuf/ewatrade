import { expect, mock, test } from "bun:test"
import type { GeneralStaffAccessAction } from "@ewatrade/assistant/general/staff-access"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
// The actual editor and freshness/validation logic run. Native primitives and
// protected query transport stand in; these checks do not prove device layout.
const root = new URL("../../../../", import.meta.url)
function standIn(path: string, value: Record<string, unknown>) {
  mock.module(new URL(`apps/mobile/src/${path}`, root).pathname, () => value)
}
const children = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
)
standIn("components/ui/bottom-sheet-input-context", {
  BottomSheetInputProvider: children,
})
standIn("components/ui/bottom-sheet-keyboard-aware-scroll-view", {
  BottomSheetKeyboardAwareScrollView: children,
})
standIn("components/ui/view", { View: children })
standIn("components/ui/text", { Text: children })
const button = ({
  children,
  disabled,
  accessibilityLabel,
}: {
  children: ReactNode
  disabled?: boolean
  accessibilityLabel?: string
}) => (
  <button type="button" disabled={disabled} aria-label={accessibilityLabel}>
    {children}
  </button>
)
standIn("components/ui/pressable", { Pressable: button })
standIn("components/mobile/action-button", { ActionButton: button })
let role = "OWNER"
standIn("hooks/use-auth", {
  useAuthContext: () => ({
    profile: { id: "actor", businessId: "business", storeId: "selected", role },
  }),
})
const inputs: unknown[] = []
const keys: unknown[] = []
standIn("trpc/client", {
  useTRPC: () => ({
    retailOps: {
      staffStoreAccessReview: {
        queryOptions: (input: unknown, options: object) => {
          inputs.push(input)
          return {
            queryKey: ["review", input],
            queryFn: async () => {
              throw Error("Unexpected request")
            },
            ...options,
          }
        },
      },
    },
  }),
})
const workload = {
  membershipId: "private-person",
  storeId: null,
  scope: "all_business_stores_current_assignee",
  count: 1,
  shown: 1,
  limit: 10,
  hasMore: false,
  coverage: "available",
  countCoverage: "complete",
  detailsCoverage: "complete",
  attribution: "current_assignee",
  asOf: "2026-10-15T10:00:00.000Z",
  jobs: [
    {
      jobId: "private-job",
      storeId: "private-store",
      storeName: "Archived Workshop",
      storeStatus: "ARCHIVED",
      priority: "URGENT",
      revision: 4,
      createdAt: "2026-10-14T10:00:00.000Z",
    },
  ],
}
const original = {
  membershipId: "private-person",
  name: "Selected Staff",
  email: "staff@example.test",
  expectedRevision: 8,
  availableStoresCoverage: "complete",
  availableStores: [
    { id: "private-store", name: "Main Shop" },
    { id: "private-other", name: "Second Store" },
  ],
  requiresLegacyCutoverConfirmation: false,
  before: {
    businessRole: "CASHIER",
    membershipStatus: "ACTIVE",
    accessMode: "SCOPED",
    assignments: [
      { storeId: "private-store", storeName: "Main Shop", role: "MANAGER" },
    ],
    defaultStoreId: "private-store",
    catalogEditor: true,
  },
  outstandingServiceWork: workload,
}
function ready() {
  return {
    isError: false,
    isSuccess: true,
    isFetching: false,
    isPaused: false,
    isFetchedAfterMount: true,
    data: original,
    refetch: async () => {},
  }
}
let query = ready()
mock.module("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: unknown }) => {
    keys.push(options.queryKey)
    return query
  },
  useQueryClient: () => ({
    fetchQuery: async () => {
      throw Error("Static rendering cannot submit")
    },
  }),
}))
const { GeneralStaffAccessEditor } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/general-staff-access-editor"
)
const initial: GeneralStaffAccessAction = {
  action: "staff_access",
  membershipId: "private-person",
  expectedRevision: 3,
  confirmLegacyCutover: true,
  assignments: [{ storeId: "private-store", role: "MANAGER" }],
  defaultStoreId: "private-store",
  catalogEditor: true,
}
function render(payload = initial, disabled = false) {
  return renderToStaticMarkup(
    createElement(GeneralStaffAccessEditor, {
      initial: payload,
      disabled,
      onSave: () => {
        throw Error("Static render cannot save")
      },
    }),
  )
}
const saveDisabled =
  /<button(?=[^>]*disabled="")[^>]*>Save and review<\/button>/
test("protected review keeps exact selected person and renders available Stores with three roles", () => {
  role = "OWNER"
  query = ready()
  const html = render()
  expect(inputs.at(-1)).toMatchObject({
    membershipId: "private-person",
    confirmLegacyCutover: false,
  })
  for (const label of [
    "Selected Staff",
    "Main Shop",
    "Second Store",
    "Cashier",
    "Operator",
    "Manager",
    "Starting Store",
    "Allow catalog editing",
  ])
    expect(html).toContain(label)
  for (const id of ["private-person", "private-store", "private-other"])
    expect(html).not.toContain(id)
  expect(html).toContain("confirm separately")
})
test("cached, fetching, paused, denied and earlier-mount facts remain hidden and Save disabled", () => {
  for (const state of [
    { isFetching: true },
    { isPaused: true },
    { isError: true },
    { isFetchedAfterMount: false },
  ]) {
    query = { ...ready(), ...state }
    const html = render()
    expect(html).not.toContain("Selected Staff")
    expect(html).not.toContain("Main Shop")
    expect(html).not.toContain("Archived Workshop")
    expect(html).toMatch(saveDisabled)
  }
})
test("each reopen owns a distinct protected query cache key and refused access offers retry", () => {
  query = ready()
  render()
  const first = keys.at(-1)
  render()
  expect(keys.at(-1)).not.toEqual(first)
  query = { ...ready(), isError: true }
  expect(render()).toContain("Retry access review")
})
test("non-administrative scope cannot render membership facts or create a review request", () => {
  query = ready()
  for (const denied of ["CASHIER", "OPERATOR", "MANAGER"]) {
    role = denied
    const before = inputs.length
    const html = render()
    expect(html).toContain("owner or administrator")
    expect(html).not.toContain("Selected Staff")
    expect(inputs.length).toBe(before)
  }
  role = "OWNER"
})
test("legacy acknowledgment is explicit and unchecked even when previous proposal acknowledged", () => {
  query = {
    ...ready(),
    data: {
      ...original,
      requiresLegacyCutoverConfirmation: true,
      before: { ...original.before, accessMode: "LEGACY" },
    },
  }
  const html = render()
  expect(html).toContain("existing business-wide access")
  expect(html).toContain("remove access to unselected Stores")
  expect(html).toMatch(saveDisabled)
})
test("empty assignment review explains removal separately from suspension", () => {
  query = ready()
  const html = render({
    ...initial,
    assignments: [],
    defaultStoreId: null,
    catalogEditor: false,
  })
  expect(html).toContain("No assignments removes Store access")
  expect(html).toContain("does not suspend the person")
  expect(html).not.toContain("Starting Store")
})
test("bounded actual service work details disclose current attribution, archived Store and separate handover", () => {
  query = ready()
  const html = render()
  for (const label of [
    "1 outstanding jobs",
    "Archived Workshop",
    "archived",
    "urgent",
    "Job revision at review: 4",
    "2026-10-14T10:00:00.000Z",
    "does not reassign these jobs",
    "separate service workflow",
    "No reason or handover is recorded",
  ])
    expect(html).toContain(label)
  expect(html).not.toContain("private-job")
})
test("unavailable workload blocks Save and never claims no assigned jobs", () => {
  query = {
    ...ready(),
    data: {
      ...original,
      outstandingServiceWork: { ...workload, membershipId: "wrong" },
    },
  }
  const html = render()
  expect(html).toContain("Current assigned work is unavailable")
  expect(html).not.toContain("Archived Workshop")
  expect(html).toMatch(saveDisabled)
})
test("parent busy guard disables Save while keeping reviewed facts visible", () => {
  query = ready()
  const html = render(initial, true)
  expect(html).toContain("Selected Staff")
  expect(html).toMatch(saveDisabled)
})
