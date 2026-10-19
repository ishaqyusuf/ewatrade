import { expect, mock, test } from "bun:test"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { NativeStaffInvitationAction } from "../../../../apps/mobile/src/components/mobile/assistant/native-staff-invitation-values"

// Isolated real component/fresh-read tests with native/query stand-ins. These
// do not establish device layout, accessibility traversal or network acceptance.
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
let buttons: { text: ReactNode; onPress: () => void; disabled?: boolean }[] = []
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
standIn("components/mobile/form-field", {
  FormField: ({
    label,
    value,
    editable,
  }: { label: string; value: string; editable?: boolean }) => (
    <label>
      {label}
      <input readOnly value={value} disabled={editable === false} />
    </label>
  ),
})
let profile = {
  id: "actor",
  businessId: "business",
  storeId: "private-store-id",
  role: "OWNER",
  status: "ACTIVE",
}
standIn("hooks/use-auth", { useAuthContext: () => ({ profile }) })
const options: unknown[] = []
const queries: { queryKey: readonly unknown[] }[] = []
standIn("trpc/client", {
  useTRPC: () => ({
    tenant: {
      stores: {
        queryOptions: (input: unknown, flags: object) => {
          expect(input).toBeUndefined()
          options.push(flags)
          return {
            queryKey: ["tenant", "stores"],
            queryFn: () => {
              throw Error("Unexpected network request")
            },
            ...flags,
          }
        },
      },
    },
  }),
})
const originalStores = [
  { id: "private-store-id", name: "Main Store" },
  { id: "private-annex-id", name: "Annex Store" },
]
function ready() {
  return {
    isError: false,
    isSuccess: true,
    isFetching: false,
    isPaused: false,
    isFetchedAfterMount: true,
    data: originalStores,
    refetch: async () => {},
  }
}
let query = ready()
mock.module("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: readonly unknown[] }) => {
    queries.push(options)
    return query
  },
}))
const { GeneralStaffInvitationEditor } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/general-staff-invitation-editor"
)
const invite: NativeStaffInvitationAction = {
  action: "staff_invitation",
  intent: {
    kind: "INVITE",
    invite: {
      email: "staff@example.test",
      name: "Pat",
      assignments: [
        { storeId: "private-store-id", role: "MANAGER" },
        { storeId: "private-annex-id", role: "CASHIER" },
      ],
      defaultStoreId: "private-store-id",
      catalogEditor: true,
    },
  },
}
let saved: unknown[] = []
function render(initial = invite, disabled = false) {
  buttons = []
  saved = []
  return renderToStaticMarkup(
    createElement(GeneralStaffInvitationEditor, {
      initial,
      disabled,
      onSave: (payload) => saved.push(payload),
    }),
  )
}
function pressSave() {
  const button = buttons.find(({ text }) => text === "Save and review")
  expect(button).toBeDefined()
  button?.onPress()
  return button
}
function reset() {
  profile = {
    ...profile,
    role: "OWNER",
    status: "ACTIVE",
    businessId: "business",
  }
  query = ready()
}

test("native invitation renders all saved grants with names and saves only the reviewed draft", () => {
  reset()
  const html = render()
  expect(html).toContain("Recipient email")
  expect(html).toContain("Assignment 1: Main Store")
  expect(html).toContain("Assignment 2: Annex Store")
  expect(html).toContain("Manager")
  expect(html).toContain("Cashier")
  expect(html).toContain("Starting Store")
  expect(html).toContain("does not mean sent, delivered")
  expect(html).not.toContain("private-store-id")
  expect(html).not.toContain("private-annex-id")
  expect(pressSave()?.disabled).toBe(false)
  expect(saved).toEqual([invite])
})
test("fresh authority read hides all cached Store names while pending, paused, not fetched or denied", () => {
  for (const flags of [
    { isFetching: true },
    { isPaused: true },
    { isFetchedAfterMount: false },
    { isError: true },
  ]) {
    reset()
    query = { ...query, ...flags }
    const html = render()
    expect(html).not.toContain("Main Store")
    expect(html).not.toContain("Annex Store")
    expect(pressSave()?.disabled).toBe(true)
    expect(saved).toHaveLength(0)
  }
  expect(render()).toContain("Retry Stores")
})
test("nonmanagement, suspended and missing-Tenant profiles do not query or expose recipient or cached Stores", () => {
  for (const patch of [
    { role: "MANAGER" },
    { role: "CASHIER" },
    { status: "SUSPENDED" },
    { businessId: "" },
  ]) {
    reset()
    profile = { ...profile, ...patch }
    const before = queries.length
    const html = render()
    expect(html).toContain("Active Owner or Admin access")
    expect(html).not.toContain("staff@example.test")
    expect(html).not.toContain("Main Store")
    expect(queries.length).toBe(before)
  }
  reset()
  profile.role = "ADMIN"
  expect(render()).toContain("Recipient email")
})
test("unavailable original Store is retained as a visible unresolved assignment and cannot save", () => {
  reset()
  query = { ...query, data: [originalStores[0]] }
  const html = render()
  expect(html).toContain("Store assignments (2/100)")
  expect(html).toContain("Assignment 2: Store unavailable")
  expect(html).toContain("Replace or remove unavailable Stores")
  expect(pressSave()?.disabled).toBe(true)
  expect(saved).toHaveLength(0)
})
test("100 assignments remain reachable in source and Add Store is disabled at the schema limit", () => {
  reset()
  const stores = Array.from({ length: 100 }, (_, index) => ({
    id: `private-${index}`,
    name: `Place ${index + 1}`,
  }))
  query.data = stores
  if (invite.intent.kind !== "INVITE") throw Error("Wrong fixture")
  const full: NativeStaffInvitationAction = {
    ...invite,
    intent: {
      kind: "INVITE",
      invite: {
        ...invite.intent.invite,
        assignments: stores.map((store) => ({
          storeId: store.id,
          role: "MANAGER",
        })),
        defaultStoreId: stores[99].id,
      },
    },
  }
  const html = render(full)
  expect(html).toContain("Assignment 100: Place 100")
  expect(html.match(/Assignment \d+:/g)).toHaveLength(100)
  expect(buttons.find(({ text }) => text === "Add Store")?.disabled).toBe(true)
  expect(pressSave()?.disabled).toBe(false)
  expect(saved).toEqual([full])
})
test("busy controls cannot save and lifecycle editors preserve exact ID with truthful email caveats", () => {
  reset()
  render(invite, true)
  expect(pressSave()?.disabled).toBe(true)
  expect(saved).toHaveLength(0)
  for (const kind of ["RESEND", "REVOKE"] as const) {
    const initial: NativeStaffInvitationAction = {
      action: "staff_invitation",
      intent: {
        kind,
        invitationId: "private-invitation-id",
        reason: "Requested by member",
      },
    }
    const before = queries.length
    const html = render(initial)
    expect(html).not.toContain("private-invitation-id")
    expect(html).not.toContain("Recipient email")
    expect(html).toContain("reviewed invitation stays selected")
    expect(html).toContain(
      kind === "RESEND"
        ? "does not mean sent, delivered or accepted"
        : "email already sending may still arrive",
    )
    expect(queries.length).toBe(before)
    pressSave()
    expect(saved).toEqual([initial])
  }
})
test("each fresh mount owns a distinct query identity and retains strict fetch cancellation/refetch settings", () => {
  reset()
  render()
  const first = queries.at(-1)?.queryKey
  render()
  const second = queries.at(-1)?.queryKey
  expect(first).not.toEqual(second)
  expect(options.at(-1)).toEqual({
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    trpc: { abortOnUnmount: true },
  })
})
