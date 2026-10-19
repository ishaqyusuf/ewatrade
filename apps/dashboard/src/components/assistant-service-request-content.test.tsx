import { expect, test } from "bun:test"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AssistantServiceRequestContent } from "./assistant-service-request-content"

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
      status: "CONVERTED",
      createdAt: "2026-10-10T10:00:00.000Z",
      updatedAt: "2026-10-12T10:00:00.000Z",
      requestedAt: null,
      details: "Uniform alterations for three children.\nCollect Friday.",
      staffResponse: null,
      customer: { name: "Chidi Nwosu", phone: "+2348000000104", email: null },
      channelOrigin: "WEB",
      contactOptIn: true,
      consentVersion: "2026-09",
    },
    form: { id: "private-form", label: "Tailoring request" },
    lines: [
      {
        id: "l1",
        offeringId: "private-offering",
        offeringName: "Alteration",
        variantName: "Shirt sleeves",
        optionSelections: [{ group: "Length", value: "Half" }],
        quantity: "12345678901234567890123456789012.000001",
        details: null,
      },
    ],
    currentQuote: {
      quoteId: "private-quote",
      versionId: "private-version",
      version: 1,
      status: "ACCEPTED",
      currencyCode: "NGN",
      totalMinor: 1200000,
      expiresAt: null,
      acceptedOrderId: "private-order",
    },
  } as Original
}
const render = (value: Original) =>
  renderToStaticMarkup(
    createElement(AssistantServiceRequestContent, {
      record: value,
      checkedAt: Date.parse("2026-10-15T15:20:02.000Z"),
    }),
  )

test("saved request, exact lines and the separate current quotation render without ids, links or actions", () => {
  const html = render(record())
  for (const text of [
    "Converted to Order",
    "Saved request",
    "Chidi Nwosu",
    "+2348000000104",
    "Not recorded",
    "Web request form",
    "2026-09",
    "not permission to send anything",
    "Uniform alterations for three children.\nCollect Friday.",
    "Tailoring request",
    "Not stated",
    "Alteration · Shirt sleeves",
    "Length: Half",
    "12345678901234567890123456789012.000001",
    "not current Catalog",
    "No staff response recorded",
    "Current, separate from the saved request",
    "Accepted",
    "₦12,000.00",
    "No expiry recorded",
    "Accepted into an Order",
    "not the selected offer, an amount",
    "2026-10-15T15:20:02.000Z",
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
    "private-order",
    "<button",
    "<a ",
  ])
    expect(html).not.toContain(text)
})

test("no quotation reads honestly; unsupported records show nothing private", () => {
  const none = record()
  none.currentQuote = null
  expect(render(none)).toContain(
    "No canonical quotation exists for this request.",
  )
  const negative = record()
  Object.assign(negative.currentQuote as object, { totalMinor: -100 })
  expect(render(negative)).toContain("Amount unavailable")
  const zero = record()
  Object.assign(zero.currentQuote as object, { totalMinor: 0 })
  expect(render(zero)).toContain("₦0.00")
  for (const change of [
    (v: Original) => Object.assign(v.request, { status: "INQUIRY" }),
    (v: Original) =>
      Object.assign(v.request, { channelOrigin: "PRESCRIPTION" }),
    (v: Original) => Object.assign(v.lines[0] as object, { quantity: "0" }),
    (v: Original) =>
      Object.assign(v.currentQuote as object, { status: "PAID" }),
    (v: Original) => {
      v.lines = Array.from(
        { length: 101 },
        () => v.lines[0],
      ) as Original["lines"]
    },
  ]) {
    const value = record()
    change(value)
    const html = render(value)
    expect(html).toContain("unsupported state")
    expect(html).not.toContain("Chidi Nwosu")
    expect(html).not.toContain("+2348000000104")
  }
})
