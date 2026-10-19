import { expect, mock, test } from "bun:test"
import type { GeneralStaffStatusAction } from "@ewatrade/assistant/general/staff-status"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

// Actual editor source with native primitives and query hooks stood in. These
// checks establish data/authority rendering, not device, layout or saved flows.
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
}: { children: ReactNode; disabled?: boolean }) => (
  <button type="button" disabled={disabled}>
    {children}
  </button>
)
standIn("components/ui/pressable", { Pressable: button })
standIn("components/mobile/action-button", { ActionButton: button })
standIn("components/mobile/form-field", {
  FormField: ({
    label,
    value,
    editable,
  }: { label: string; value: string; editable?: boolean }) => (
    <label>
      {label}
      <input value={value} readOnly disabled={editable === false} />
    </label>
  ),
})
const owner = {
  id: "actor",
  businessId: "business",
  storeId: "store",
  role: "OWNER",
}
let profile: typeof owner | null = owner
standIn("hooks/use-auth", { useAuthContext: () => ({ profile }) })
const inputs: unknown[] = []
const keys: readonly unknown[][] = []
standIn("trpc/client", {
  useTRPC: () => ({
    retailOps: {
      staffStatusReview: {
        queryOptions: (input: unknown, options: object) => {
          inputs.push(input)
          return {
            queryKey: ["retailOps", "staffStatusReview", input],
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
const original = {
  membershipId: "private-membership",
  name: "Current Staff Name",
  email: "staff@example.test",
  role: "CASHIER",
  previousStatus: "ACTIVE",
  nextStatus: "SUSPENDED",
  reason: "Access review",
  expectedRevision: 12,
  impact: "Current suspension impact from protected review.",
  accessMode: "SCOPED",
  catalogEditor: false,
  defaultStoreId: "private-store",
  assignments: [
    { storeId: "private-store", storeName: "Market branch", role: "CASHIER" },
  ],
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
  useQuery: (options: { queryKey: unknown[] }) => {
    ;(keys as unknown[][]).push(options.queryKey)
    return query
  },
  useQueryClient: () => ({
    fetchQuery: () => {
      throw Error("Static rendering cannot review or save")
    },
  }),
}))
const { GeneralStaffStatusEditor } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/general-staff-status-editor"
)
const initial: GeneralStaffStatusAction = {
  action: "staff_status",
  membershipId: "private-membership",
  status: "suspended",
  expectedRevision: 2,
  reason: "Access review",
}
function render(value = initial, disabled = false) {
  return renderToStaticMarkup(
    createElement(GeneralStaffStatusEditor, {
      initial: value,
      disabled,
      onSave: () => {
        throw Error("Static rendering cannot save")
      },
    }),
  )
}

test("the exact protected membership review supplies names, current status, access and Store labels", () => {
  profile = owner
  query = ready()
  const html = render()
  expect(inputs.at(-1)).toEqual({
    membershipId: initial.membershipId,
    status: "suspended",
    reason: "Access review",
  })
  for (const text of [
    "Current Staff Name",
    "staff@example.test",
    "Current status: active",
    "cashier",
    "Current access: scoped",
    "catalog editing not allowed",
    "Market branch",
    "starting Store",
    original.impact,
    "Suspend business access",
    "Reactivate current access",
    "confirming separately",
    "not one Store assignment",
  ])
    expect(html).toContain(text)
  expect(html).not.toContain("private-membership")
  expect(html).not.toContain("private-store")
})

test("every reopened editor owns a different read cache key", () => {
  query = ready()
  render()
  const first = keys.at(-1)
  render()
  expect(keys.at(-1)).not.toEqual(first)
  expect(first?.slice(0, 3)).toEqual(keys.at(-1)?.slice(0, 3))
})

test("fetching, paused, denied and pre-mount cached data cannot show staff facts or Save", () => {
  for (const state of [
    { isFetching: true },
    { isPaused: true },
    { isError: true },
    { isFetchedAfterMount: false },
  ]) {
    query = { ...ready(), ...state }
    const html = render()
    expect(html).not.toContain("Current Staff Name")
    expect(html).not.toContain("staff@example.test")
    expect(html).not.toContain(original.impact)
    expect(html).toMatch(
      /<button(?=[^>]*disabled="")[^>]*>Save and review<\/button>/,
    )
  }
})

test("unavailable or mismatched original membership offers retry and keeps values private", () => {
  for (const state of [
    { ...ready(), isError: true },
    { ...ready(), data: { ...original, membershipId: "foreign" } },
  ]) {
    query = state
    const html = render()
    expect(html).toContain("Retry staff review")
    expect(html).not.toContain("Current Staff Name")
    expect(html).not.toContain(original.impact)
  }
})

test("changed status or reason withholds the old impact pending fresh review", () => {
  query = ready()
  for (const edited of [
    { ...initial, status: "active" as const },
    { ...initial, reason: "Changed reason" },
  ]) {
    const html = render(edited)
    expect(html).toContain("Save to load a fresh review of this choice")
    expect(html).not.toContain(original.impact)
  }
})

test("parent busy state disables the editable controls and Save", () => {
  query = ready()
  const html = render(initial, true)
  expect(html).toMatch(
    /<button(?=[^>]*disabled="")[^>]*>Save and review<\/button>/,
  )
  expect(html).toMatch(/<input(?=[^>]*disabled="")/)
})

test("non-administrative or missing business scope never reads staff review", () => {
  const before = inputs.length
  for (const scope of [
    null,
    { ...owner, role: "MANAGER" },
    { ...owner, role: "CASHIER" },
    { ...owner, businessId: "" },
  ]) {
    profile = scope
    expect(render()).toContain("An owner or administrator")
  }
  expect(inputs).toHaveLength(before)
  profile = owner
})
