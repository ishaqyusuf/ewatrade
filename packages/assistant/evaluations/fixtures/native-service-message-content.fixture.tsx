import { expect, mock, test } from "bun:test"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

// Actual pure content consumer; native primitives stand in. No transport,
// database, provider, send or navigation runs.
const root = new URL("../../../../", import.meta.url)
function standIn(path: string, value: Record<string, unknown>) {
  mock.module(new URL(`apps/mobile/src/${path}`, root).pathname, () => value)
}
const children = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
)
standIn("components/ui/text", { Text: children })
standIn("components/ui/view", { View: children })
standIn("components/mobile/green-till/kit", {
  ListCard: children,
  StatusPill: ({ label }: { label: string }) => <span>{label}</span>,
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
const { NativeServiceMessageContent } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/native-service-message-content"
)
type Record = RouterOutputs["serviceCommunications"]["manualMessageOriginal"]
function record(): Record {
  return {
    actorUserId: "private-actor",
    tenantId: "private-business",
    storeId: "private-store",
    job: { id: "private-job", revision: 7 },
    order: { id: "private-order", number: "ORD-3001" },
    intent: {
      id: "private-intent",
      channel: "MANUAL",
      status: "COMPLETED",
      purpose: "assistant_manual_share",
      message: "Your gown is ready. Collect after 2pm with your ticket.",
      recipient: {
        phone: "+2348000000001",
        email: "saved.contact@example.test",
      },
      createdAt: "2026-10-14T09:00:00.000Z",
      completedAt: "2026-10-14T09:00:01.250Z",
    },
    share: {
      id: "private-share",
      channel: "WHATSAPP",
      note: "Sent from the shop phone",
      sharedAt: "2026-10-14T08:55:00.000Z",
      sharedByUserId: "staff-user-42",
    },
    currentOrderRecipientName: "Current Label Name",
    asOf: "2026-10-15T14:50:00.000Z",
    kind: "staff_reported_share",
    sending: "none",
    delivery: "unverified",
  } as Record
}
function render(value: Record, onOpenOrder?: () => void) {
  buttons.clear()
  return renderToStaticMarkup(
    createElement(NativeServiceMessageContent, { record: value, onOpenOrder }),
  )
}

test("shows the exact saved message, how it was recorded and the saved recipient as saved facts", () => {
  const html = render(record())
  for (const text of [
    "Nothing sent",
    "Delivery not verified",
    "Staff-reported shared message",
    "ẸwáTrade sent nothing",
    "no consent, provider or delivery proof",
    "Your gown is ready. Collect after 2pm with your ticket.",
    "WhatsApp from the staff member’s own phone",
    "2026-10-14T08:55:00.000Z (UTC)",
    "staff-user-42",
    "no current staff name is inferred",
    "Sent from the shop phone",
    "Saved recipient at the time",
    "+2348000000001",
    "saved.contact@example.test",
    "2026-10-14T09:00:01.250Z (UTC)",
    "Checked 2026-10-15T14:50:00.000Z (UTC)",
  ])
    expect(html).toContain(text)
  for (const text of [
    "private-actor",
    "private-business",
    "private-store",
    "private-job",
    "private-order",
    "private-intent",
    "private-share",
  ])
    expect(html).not.toContain(text)
})

test("the full 1000-character message is shown without truncation", () => {
  const value = record()
  value.intent.message = `${"a".repeat(998)}END`.slice(0, 1000)
  const html = render(value)
  expect(html).toContain(value.intent.message)
  expect(html).toContain("1000 characters")
})

test("the current Order label is separate from the saved recipient and only opens through the supplied callback", () => {
  const html = render(record())
  expect(html).toContain("Related Order (current)")
  expect(html).toContain("ORD-3001")
  expect(html).toContain("Current Label Name")
  expect(html).toContain("They do not replace the saved message")
  expect(buttons.size).toBe(0)
  let opened = 0
  render(record(), () => {
    opened++
  })
  expect([...buttons.keys()]).toEqual(["Open related Order"])
  buttons.get("Open related Order")?.()
  expect(opened).toBe(1)
})

test("missing saved values read as not recorded, never as a send or delivery", () => {
  const value = record()
  value.intent.recipient = { phone: null, email: null }
  value.share = {
    ...value.share,
    channel: "MANUAL",
    note: null,
    sharedByUserId: null,
  }
  value.currentOrderRecipientName = null
  const html = render(value)
  for (const text of [
    "In person / other",
    "No note",
    "Not saved",
    "Not recorded",
    "No current customer name",
  ])
    expect(html).toContain(text)
  for (const text of ["Delivered", "Sent to", "Consent", "Send"])
    expect(html).not.toContain(text)
})

test("unknown or malformed states render no message, recipient or delivery facts", () => {
  const variants: Array<(value: Record) => void> = [
    (v) => Object.assign(v, { kind: "provider_send" }),
    (v) => Object.assign(v, { sending: "queued" }),
    (v) => Object.assign(v, { delivery: "delivered" }),
    (v) => Object.assign(v.intent, { status: "READY" }),
    (v) => Object.assign(v.intent, { channel: "SMS" }),
    (v) => Object.assign(v.share, { channel: "EMAIL" }),
    (v) => Object.assign(v.intent, { message: "   " }),
    (v) => Object.assign(v.intent, { message: "x".repeat(1001) }),
    (v) => Object.assign(v.share, { note: "n".repeat(501) }),
  ]
  for (const change of variants) {
    const value = record()
    change(value)
    const html = render(value, () => {})
    expect(html).toContain("unsupported state")
    expect(html).not.toContain("Your gown is ready")
    expect(html).not.toContain("+2348000000001")
    expect(html).not.toContain("ORD-3001")
    expect(buttons.size).toBe(0)
  }
})
