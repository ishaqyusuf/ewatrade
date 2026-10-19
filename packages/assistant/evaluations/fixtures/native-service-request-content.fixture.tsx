import { expect, mock, test } from "bun:test"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

// Actual pure original content; native primitives stand in. No transport,
// database, navigation or request action runs.
const root = new URL("../../../../", import.meta.url)
function standIn(path: string, value: Record<string, unknown>) {
  mock.module(new URL(`apps/mobile/src/${path}`, root).pathname, () => value)
}
const children = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
)
standIn("components/ui/text", { Text: children })
standIn("components/ui/view", { View: children })
const presses: string[] = []
standIn("components/mobile/green-till/kit", {
  ListCard: children,
  StatusPill: ({ label }: { label: string }) => <span>{label}</span>,
  RecordRow: ({ title }: { title: string }) => {
    presses.push(title)
    return <div>{title}</div>
  },
})
standIn("components/mobile/action-button", {
  ActionButton: ({ children }: { children: string }) => (
    <button type="button">{children}</button>
  ),
})
const { NativeServiceRequestContent } = await import(
  "../../../../apps/mobile/src/components/mobile/assistant/native-service-request-content"
)
type Original = RouterOutputs["serviceAssistantRequests"]["original"]
function record(): Original {
  return {
    actorUserId: "private-actor",
    tenantId: "private-business",
    storeId: "private-store",
    asOf: "2026-10-15T15:20:00.000Z",
    request: {
      id: "private-request",
      revision: 3,
      status: "QUOTED",
      createdAt: "2026-10-14T16:30:05.120Z",
      updatedAt: "2026-10-15T09:00:00.000Z",
      requestedAt: "2026-10-18T09:00:00.000Z",
      details:
        "Laptop screen flickers after a fall.\nNeeds a quote before Friday.",
      staffResponse: "Screen and hinge replacement likely.",
      customer: {
        name: "Tunde Bakare",
        phone: "+2348000000102",
        email: "tunde@example.test",
      },
      channelOrigin: "WHATSAPP",
      contactOptIn: false,
      consentVersion: null,
    },
    form: { id: "private-form", label: "Device repair request" },
    lines: [
      {
        id: "line-1",
        offeringId: "private-offering",
        offeringName: "Laptop screen repair",
        variantName: "14-inch",
        optionSelections: [{ group: "Model", value: "ThinkPad T14" }],
        quantity: "12345678901234567890123456789012.000001",
        details: "Customer brings the charger",
      },
    ],
    currentQuote: {
      quoteId: "private-quote",
      versionId: "private-version",
      version: 2,
      status: "ISSUED",
      currencyCode: "NGN",
      totalMinor: 4500000,
      expiresAt: "2026-10-20T23:59:59.000Z",
      acceptedOrderId: null,
    },
  } as Original
}
const render = (value: Original) =>
  renderToStaticMarkup(
    createElement(NativeServiceRequestContent, { record: value }),
  )

test("saved request facts, exact decimal lines and the separate current quotation are shown without ids or actions", () => {
  const html = render(record())
  for (const text of [
    "Quoted",
    "Saved request",
    "Tunde Bakare",
    "Device repair request · 1 line",
    "2026-10-18T09:00:00.000Z (UTC)",
    "2026-10-14T16:30:05.120Z (UTC)",
    "Customer as submitted",
    "+2348000000102",
    "tunde@example.test",
    "WhatsApp",
    "Contact opt-in (stored)",
    "None recorded",
    "not permission to send",
    "Laptop screen flickers after a fall.\nNeeds a quote before Friday.",
    "Laptop screen repair · 14-inch",
    "× 12345678901234567890123456789012.000001",
    "ThinkPad T14",
    "Customer brings the charger",
    "not current Catalog",
    "Screen and hinge replacement likely.",
    "Current quotation",
    "Current",
    "v2",
    "Issued",
    "₦45,000.00",
    "2026-10-20T23:59:59.000Z (UTC)",
    "No accepted Order",
    "not the selected offer, an amount",
    "Read-only: no reply, decline, quote or convert action here.",
  ])
    expect(html).toContain(text)
  for (const text of [
    "private-actor",
    "private-business",
    "private-store",
    "private-request",
    "private-form",
    "private-offering",
    "private-quote",
    "private-version",
    "<button",
  ])
    expect(html).not.toContain(text)
})

test("100 full lines render untruncated; missing saved values read as not recorded, never zero", () => {
  const value = record()
  value.lines = Array.from({ length: 100 }, (_, index) => ({
    ...record().lines[0],
    id: `line-${index}`,
    variantName: `Item ${index + 1}`,
    quantity: index === 99 ? "0.000001" : "1",
  })) as Original["lines"]
  value.request.customer = { name: null, phone: null, email: null }
  value.request.details = null as unknown as string
  value.request.staffResponse = null
  value.request.requestedAt = null
  value.currentQuote = null
  const html = render(value)
  expect(html).toContain("Saved lines (100)")
  expect(html).toContain("Item 100")
  expect(html).toContain("× 0.000001")
  for (const text of [
    "No customer name",
    "Not recorded",
    "Not stated",
    "No details recorded",
    "No staff response recorded",
    "No canonical quotation exists for this request.",
  ])
    expect(html).toContain(text)
  expect(html).not.toContain("₦0.00")
})

test("an accepted quotation is described without a link or payment claim", () => {
  const value = record()
  value.currentQuote = {
    ...(value.currentQuote as NonNullable<Original["currentQuote"]>),
    status: "ACCEPTED",
    acceptedOrderId: "private-order",
    expiresAt: null,
  }
  const html = render(value)
  expect(html).toContain("Accepted into an Order")
  expect(html).toContain("No expiry recorded")
  expect(html).not.toContain("private-order")
  expect(html).not.toContain("Paid")
})

test("unknown status, channel, quote status, quantities, over-100 lines or unsafe totals show nothing private", () => {
  const variants: Array<(value: Original) => void> = [
    (v) => Object.assign(v.request, { status: "INQUIRY" }),
    (v) => Object.assign(v.request, { channelOrigin: "PRESCRIPTION" }),
    (v) => Object.assign(v.lines[0] as object, { quantity: "1.5e3" }),
    (v) => Object.assign(v.lines[0] as object, { quantity: "0" }),
    (v) => Object.assign(v.lines[0] as object, { quantity: "1.0000001" }),
    (v) => {
      v.lines = Array.from(
        { length: 101 },
        () => v.lines[0],
      ) as Original["lines"]
    },
    (v) => Object.assign(v.currentQuote as object, { status: "PAID" }),
  ]
  for (const change of variants) {
    const value = record()
    change(value)
    const html = render(value)
    expect(html).toContain("unsupported state")
    expect(html).not.toContain("Tunde Bakare")
    expect(html).not.toContain("+2348000000102")
    expect(html).not.toContain("Laptop screen")
  }
  const unsafe = record()
  Object.assign(unsafe.currentQuote as object, {
    totalMinor: Number.MAX_SAFE_INTEGER + 2,
  })
  expect(render(unsafe)).toContain("Amount unavailable")
  const negative = record()
  Object.assign(negative.currentQuote as object, { totalMinor: -100 })
  expect(render(negative)).toContain("Amount unavailable")
  expect(render(negative)).not.toContain("-₦")
  const zero = record()
  Object.assign(zero.currentQuote as object, { totalMinor: 0 })
  expect(render(zero)).toContain("₦0.00")
})
