import { expect, mock, test } from "bun:test"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

// Actual pure page content with the real RecordRow contract stood in; no
// query, route, transport or request action runs.
const root = new URL("../../../../", import.meta.url)
function standIn(path: string, value: Record<string, unknown>) {
  mock.module(new URL(`apps/mobile/src/${path}`, root).pathname, () => value)
}
const children = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
)
standIn("components/ui/text", { Text: children })
standIn("components/ui/view", { View: children })
const rows = new Map<string, () => void>()
standIn("components/mobile/green-till/kit", {
  ListCard: children,
  StatusPill: ({ label }: { label: string }) => <span>{label}</span>,
  RecordRow: ({
    title,
    meta,
    status,
    avatar,
    accessibilityLabel,
    onPress,
  }: {
    title: string
    meta: string[]
    status: ReactNode
    avatar: { initials: string }
    accessibilityLabel: string
    onPress: () => void
  }) => {
    rows.set(title, onPress)
    return (
      <div aria-label={accessibilityLabel}>
        <span>{avatar.initials}</span>
        {title}
        {meta.map((line) => (
          <span key={line}>{line}</span>
        ))}
        {status}
      </div>
    )
  },
})
const buttons = new Map<string, () => void>()
standIn("components/mobile/action-button", {
  ActionButton: ({
    children,
    onPress,
  }: { children: string; onPress: () => void }) => {
    buttons.set(children, onPress)
    return <button type="button">{children}</button>
  },
})
const { NativeServiceRequestPageContent } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/native-service-request-page-content"
)
type Page = RouterOutputs["serviceAssistantRequests"]["listPage"]
function item(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    revision: 1,
    status: "SUBMITTED",
    customerName: "Adaeze Okafor",
    requestedAt: "2026-10-18T09:00:00.000Z",
    createdAt: "2026-10-15T08:12:40.000Z",
    form: { id: `form-${id}`, label: "Tailoring request" },
    lineCount: 2,
    originalTarget: {
      kind: "service_request",
      requestId: id,
      origin: { tenantId: "private-business", storeId: "private-store" },
    },
    ...overrides,
  }
}
function page(
  items = [item("private-r1")],
  nextCursor: string | null = null,
): Page {
  return {
    actorUserId: "private-actor",
    tenantId: "private-business",
    storeId: "private-store",
    asOf: "2026-10-15T15:20:00.000Z",
    coverage: "service_requests_only",
    totalMatching: "12345678901234567890",
    items,
    nextCursor,
  } as Page
}
const opened: string[] = []
let nexts = 0
let restarts = 0
function render(
  value: Page,
  extra: {
    filterLabels?: string[]
    onNext?: () => void
    onRestart?: () => void
  } = {},
) {
  rows.clear()
  buttons.clear()
  opened.length = 0
  return renderToStaticMarkup(
    createElement(NativeServiceRequestPageContent, {
      page: value,
      onOpen: (id: string) => opened.push(id),
      ...extra,
    }),
  )
}

test("count, coverage, filters and bounded rows show only list facts; opening passes the exact request id", () => {
  const html = render(
    page([
      item("private-r1"),
      item("private-r2", {
        status: "NEEDS_INFORMATION",
        customerName: null,
        requestedAt: null,
        lineCount: 1,
        form: { id: "f2", label: "Device repair request" },
      }),
    ]),
    { filterLabels: ["Needs information", "Customer contains “ada”"] },
  )
  for (const text of [
    "12345678901234567890",
    "matching",
    "Needs information · Customer contains “ada”",
    "2026-10-15T15:20:00.000Z (UTC)",
    "Generic Service Requests only — not Product Inquiries or clinical requests.",
    "pages are never added together",
    "Adaeze Okafor",
    "AO",
    "Tailoring request · 2 lines",
    "Requested for 2026-10-18T09:00:00.000Z (UTC)",
    "Submitted",
    "No customer name",
    "Device repair request · 1 line",
    "Received 2026-10-15T08:12:40.000Z (UTC)",
    "Open original request from Adaeze Okafor",
  ])
    expect(html).toContain(text)
  for (const text of [
    "private-r1",
    "private-r2",
    "private-actor",
    "private-business",
    "private-store",
    "form-private",
  ])
    expect(html).not.toContain(text)
  rows.get("No customer name")?.()
  rows.get("Adaeze Okafor")?.()
  expect(opened).toEqual(["private-r2", "private-r1"])
  expect(buttons.size).toBe(0)
})

test("Next appears only with both a cursor and a callback; Restart only when supplied", () => {
  render(page([item("a")], "cursor"), {})
  expect(buttons.has("Next page")).toBe(false)
  render(page([item("a")], null), { onNext: () => nexts++ })
  expect(buttons.has("Next page")).toBe(false)
  render(page([item("a")], "cursor"), {
    onNext: () => nexts++,
    onRestart: () => restarts++,
  })
  buttons.get("Next page")?.()
  buttons.get("Back to first page")?.()
  expect([nexts, restarts]).toEqual([1, 1])
})

test("an empty first page and an empty later page say different, honest things", () => {
  const first = render(page([]))
  expect(first).toContain(
    "No Service Requests match these filters in this Store.",
  )
  expect(first).toContain(
    "does not cover Product Inquiries or clinical requests",
  )
  const later = render(page([]), { onRestart: () => {} })
  expect(later).toContain(
    "No requests on this page. Start again from the first page.",
  )
})

test("foreign coverage, malformed counts, over-10 rows, unknown status or mismatched targets show no requests", () => {
  const variants: Page[] = [
    { ...page(), coverage: "inquiries" } as unknown as Page,
    { ...page(), totalMatching: "12.5" } as Page,
    { ...page(), totalMatching: "-1" } as Page,
    page(Array.from({ length: 11 }, (_, i) => item(`r${i}`))),
    page([item("r1", { status: "PRESCRIPTION" })]),
    page([
      item("r1", {
        originalTarget: {
          kind: "service_request",
          requestId: "other",
          origin: { tenantId: "b", storeId: "s" },
        },
      }),
    ]),
    page([
      item("r1", {
        originalTarget: {
          kind: "inquiry",
          requestId: "r1",
          origin: { tenantId: "b", storeId: "s" },
        },
      }),
    ]),
    page([item("r1", { lineCount: 1.5 })]),
  ]
  for (const value of variants) {
    const html = render(value, { onNext: () => {}, onRestart: () => {} })
    expect(html).toContain("unsupported state")
    expect(html).not.toContain("Adaeze Okafor")
    expect(rows.size).toBe(0)
    expect(buttons.size).toBe(0)
  }
})
