import { expect, mock, test } from "bun:test"
import type { GeneralProposal } from "@ewatrade/assistant/general/contracts"
import { renderToStaticMarkup } from "react-dom/server"

mock.module("./general-product-picture", () => ({
  GeneralProductPicture: () => null,
}))
const { GeneralOutcomeList, GeneralProposalCard, isGeneralOutcome } =
  await import("./general-proposal-card")

const later = new Date(Date.now() + 30 * 60_000).toISOString()
const earlier = new Date(Date.now() - 60_000).toISOString()
const proposal = (
  id: string,
  action: string,
  fields: Partial<GeneralProposal>,
): GeneralProposal =>
  ({
    id,
    revision: 1,
    payload: { action },
    status: "PENDING",
    expiresAt: later,
    receipt: null,
    review: [],
    ...fields,
  }) as GeneralProposal
const sale = [
  "Quail Eggs · Tray · 2 × ₦2,400.00 = ₦4,800.00",
  "Total: ₦4,800.00",
  "Customer: Bola Okafor (QA)",
]
const noop = () => {}
const card = (value: GeneralProposal) =>
  renderToStaticMarkup(
    <GeneralProposalCard
      proposal={value}
      currencyCode="NGN"
      disabled={false}
      onConfirm={noop}
      onCancel={noop}
      onEdit={noop}
    />,
  )

test("only drafts that still need the owner render as cards", () => {
  const saved = proposal("a", "order_create", {
    status: "COMPLETED",
    receipt: {
      kind: "order",
      recordId: "o1",
      title: "Order created",
      detail: "ORD-017",
    } as GeneralProposal["receipt"],
  })
  expect(isGeneralOutcome(saved)).toBe(true)
  expect(
    isGeneralOutcome(proposal("b", "order_create", { status: "CANCELLED" })),
  ).toBe(true)
  expect(
    isGeneralOutcome(proposal("c", "order_create", { status: "FAILED" })),
  ).toBe(true)
  expect(
    isGeneralOutcome(proposal("d", "order_create", { status: "COMPLETED" })),
  ).toBe(true)
  expect(isGeneralOutcome(proposal("e", "order_create", {}))).toBe(false)
  expect(
    isGeneralOutcome(proposal("f", "order_create", { status: "EXPIRED" })),
  ).toBe(false)
  expect(
    isGeneralOutcome(proposal("g", "order_create", { status: "EXECUTING" })),
  ).toBe(false)
})

test("a pending draft reads as labelled values with a total and its actions", () => {
  const html = card(
    proposal("p", "order_create", { review: sale, approvalToken: "t" }),
  )
  expect(html).toContain("Create a sale")
  expect(html).toContain("Needs your review")
  expect(html).toContain(
    "<li>Quail Eggs · Tray · 2 × ₦2,400.00 = ₦4,800.00</li>",
  )
  expect(html).toMatch(
    /<span class="[^"]*font-semibold[^"]*"><span class="min-w-0">Total<\/span><span class="[^"]*text-right[^"]*">₦4,800.00<\/span>/,
  )
  expect(html).toContain("Bola Okafor (QA)")
  expect(html).toContain(">Confirm<")
  expect(html).toContain(">Cancel draft<")
  expect(html).toContain("Nothing changes until you confirm · expires")
})

test("long review copy stays one wrapping line instead of a squeezed column", () => {
  const label =
    "Record supplier invoice, ownership and receipt for QA Web Supplier at Sweet Crumbs Bakery"
  const value =
    "2026-10-12T00:00:00.123Z (UTC). Due: 2026-10-20T00:00:00.456Z (UTC)."
  const html = card(
    proposal("long", "order_create", {
      review: [`${label}: QA purchase.`, `Bill date: ${value}`, "Total: ₦1.00"],
    }),
  )
  expect(html).toContain(
    `<li><span class="text-muted-foreground">${label}:</span> QA purchase.</li>`,
  )
  expect(html).toContain(
    `<li><span class="text-muted-foreground">Bill date:</span> ${value}</li>`,
  )
  expect(html).not.toContain("grid-cols")
})

test("a lapsed draft offers a fresh review instead of Confirm", () => {
  const html = card(
    proposal("x", "order_create", { review: sale, expiresAt: earlier }),
  )
  expect(html).toContain("Expired")
  expect(html).toContain("Edit and review again")
  expect(html).not.toContain(">Confirm<")
  expect(html).toContain("Approval expired. Edit to review a fresh draft.")
})

test("finished drafts list as saved rows and collapsed cancelled rows", () => {
  const html = renderToStaticMarkup(
    <GeneralOutcomeList
      currencyCode="NGN"
      onOpenReceipt={noop}
      proposals={[
        proposal("c1", "customer_create", {
          status: "CANCELLED",
          review: ["Name: Amina QA Test"],
        }),
        proposal("o1", "order_create", {
          status: "COMPLETED",
          receipt: {
            kind: "order",
            recordId: "o1",
            title: "Order created",
            detail: "ORD-017",
          } as GeneralProposal["receipt"],
        }),
        proposal("o2", "order_create", { status: "CANCELLED", review: sale }),
      ]}
    />,
  )
  expect(html).toContain("1 saved · 2 cancelled")
  expect(html).toContain('aria-label="Open Order created"')
  expect(html).toContain("ORD-017")
  expect(html).toContain("Cancelled · Total: ₦4,800.00")
  expect(html).toContain("Cancelled · Name: Amina QA Test")
  // Cancelled review lines stay one click away, not on the page.
  expect(html).not.toContain("Bola Okafor (QA)")
  expect(html).toContain('aria-expanded="false"')
})

test("a long draft opens on its first lines with the rest one click away", () => {
  const review = Array.from({ length: 12 }, (_, index) => `Line ${index + 1}`)
  const html = card(
    proposal("big", "order_create", { review, approvalToken: "t" }),
  )
  expect(html).toContain('<li class="line-clamp-2">Line 6</li>')
  expect(html).not.toContain("<li>Line 7</li>")
  expect(html).toContain("Show all 12 lines")
  expect(html).toContain('aria-expanded="false"')
  // Actions stay visible while the review is folded.
  expect(html).toContain(">Confirm<")
  const short = card(proposal("small", "order_create", { review: sale }))
  expect(short).not.toContain("Show all")
})

test("a draft with a structured review reads as an invoice summary", () => {
  const html = card(
    proposal("purchase", "purchase_record", {
      approvalToken: "t",
      review: ["Fallback sentence that must not show."],
      presentation: {
        summary: {
          party: "Lagos Flour Mills (LFM-01)",
          context: "Weekly baking stock",
          amount: "₦441,500.00",
          amountLabel: "payable",
        },
        facts: [
          { label: "Due", value: "20 Oct 2026" },
          { value: "10 goods received" },
        ],
        table: {
          columns: [
            { label: "Goods" },
            { label: "Received", align: "end" },
            { label: "Cost", align: "end" },
          ],
          rows: Array.from({ length: 10 }, (_, n) => ({
            cells: [`Item ${n + 1}`, "2 bag", "₦1.00"],
            detail: "50kg bag",
          })),
          total: { label: "Total", value: "₦441,500.00" },
          preview: 4,
        },
        sections: [
          {
            title: "Accounting",
            summary: "Inventory Dr · Payables Cr",
            rows: [{ label: "1300 Inventory", value: "Dr ₦441,500.00" }],
          },
        ],
      },
    }),
  )
  expect(html).toContain("Record received supplier purchase")
  expect(html).toContain("Lagos Flour Mills (LFM-01) · Weekly baking stock")
  expect(html).toContain("₦441,500.00")
  expect(html).toContain(">payable<")
  expect(html).toContain("20 Oct 2026")
  expect(html).toContain("Item 4")
  expect(html).not.toContain("Item 5")
  expect(html).toContain("+ 6 more")
  // Sections start folded, with their summary in the header.
  expect(html).toContain("Accounting")
  expect(html).toContain("Inventory Dr · Payables Cr")
  expect(html).not.toContain("1300 Inventory")
  expect(html).not.toContain("Fallback sentence")
  expect(html).toContain(">Confirm<")
})

test("without an amount, the subject leads the card", () => {
  const html = card(
    proposal("customer", "customer_create", {
      presentation: {
        summary: { party: "Amina Bello", amountLabel: "new customer" },
        facts: [{ label: "Phone", value: "0803 555 0101" }],
      },
    }),
  )
  expect(html).toContain(
    '<p class="text-base leading-tight font-semibold">Amina Bello<span class="text-sm font-normal text-muted-foreground"> new customer</span></p>',
  )
})
