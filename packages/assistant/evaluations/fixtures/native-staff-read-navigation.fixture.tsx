import { expect, mock, test } from "bun:test"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { GeneralAnswer } from "../../src/general/contracts"

// Actual route and read dispatcher, with screen furniture tested separately.
// No network, native device, saved chat, command or provider is contacted.
const root = new URL("../../../../apps/mobile/src/", import.meta.url)
function standIn(path: string, value: Record<string, unknown>) {
  mock.module(new URL(path, root).pathname, () => value)
}
type Target = GeneralAnswer["target"]
let opened: Target
let onOpen: ((next: Target) => void) | undefined
let params: { target?: string | string[] } = {}
let changed: unknown
mock.module("expo-router", () => ({
  useLocalSearchParams: () => params,
  useRouter: () => ({
    setParams: (value: unknown) => {
      changed = value
    },
  }),
}))
for (const [name, file, label] of [
  ["NativeStaffDirectoryScreen", "directory", "Directory"],
  ["NativeStaffMemberScreen", "member", "Member"],
  ["NativeStaffHistoryScreen", "history", "History"],
] as const) {
  standIn(`components/mobile/assistant/native-staff-${file}-screen`, {
    [name]: (props: { target: Target; onOpen: (next: Target) => void }) => {
      opened = props.target
      onOpen = props.onOpen
      return <div>{label}</div>
    },
  })
}
standIn("components/mobile/assistant/staff-original-screen", {
  StaffOriginalScreen: () => <div>Original or invalid staff link</div>,
})
standIn("components/mobile/staff/staff-screen", {
  StaffChrome: () => null,
  StaffInviteContent: () => <div>Ordinary staff directory</div>,
})
standIn("components/mobile/workflow-modal-screen", {
  WorkflowModalScreen: (props: {
    children: ReactNode
    back?: boolean
    title: string
    closeLabel: string
  }) => (
    <section
      data-back={String(props.back)}
      data-title={props.title}
      data-close={props.closeLabel}
    >
      {props.children}
    </section>
  ),
})
const { default: StaffRoute } = await import(
  "../../../../apps/mobile/src/app/staff-invite-modal"
)

test("assistant staff targets dispatch exactly and retain the one modal Back boundary", () => {
  for (const [target, label] of [
    [
      {
        kind: "staff_directory",
        filters: {
          search: "Amina",
          cursor: "original-page",
          assignmentStoreId: "original-store",
        },
      },
      "Directory",
    ],
    [{ kind: "staff_member", membershipId: "original-member" }, "Member"],
    [
      {
        kind: "staff_history",
        filters: {
          membershipId: "original-member",
          from: "2026-10-01T00:00:00Z",
          cursor: "history-page",
        },
      },
      "History",
    ],
  ] as const) {
    params = { target: JSON.stringify(target) }
    const html = renderToStaticMarkup(<StaffRoute />)
    expect(opened).toEqual(target)
    expect(html).toContain(label)
    expect(html).toContain('data-back="true"')
    expect(html).toContain('data-close="Back to the assistant"')
    expect(html).not.toContain("Ordinary staff directory")
  }
})

test("read-to-read or exact-original handoff replaces only this modal target", () => {
  params = { target: JSON.stringify({ kind: "staff_directory", filters: {} }) }
  renderToStaticMarkup(<StaffRoute />)
  const next = {
    kind: "staff_member",
    membershipId: "selected-member",
  } as const
  onOpen?.(next)
  expect(changed).toEqual({ target: JSON.stringify(next) })
  const original = {
    kind: "staff_access",
    eventId: "selected-access-event",
  } as const
  onOpen?.(original)
  expect(changed).toEqual({ target: JSON.stringify(original) })
  onOpen?.({ kind: "staff_member", membershipId: " " })
  expect(changed).toEqual({ target: JSON.stringify(original) })
})

test("malformed and repeated parameters do not become an ordinary directory", () => {
  for (const raw of [
    "malformed",
    ["{}"],
    JSON.stringify({
      kind: "staff_directory",
      filters: { tenantId: "foreign" },
    }),
  ]) {
    params = { target: raw }
    const html = renderToStaticMarkup(<StaffRoute />)
    expect(html).toContain("Original or invalid staff link")
    expect(html).not.toContain("Ordinary staff directory")
  }
  params = {}
  expect(renderToStaticMarkup(<StaffRoute />)).toContain(
    "Ordinary staff directory",
  )
})
