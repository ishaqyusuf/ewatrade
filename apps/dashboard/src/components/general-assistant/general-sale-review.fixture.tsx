import { expect, mock, test } from "bun:test"
import type { GeneralProposal } from "@ewatrade/assistant/general/contracts"
import { renderToStaticMarkup } from "react-dom/server"

mock.module("./general-product-picture", () => ({
  GeneralProductPicture: () => null,
}))
const { GeneralProposalCard } = await import("./general-proposal-card")

const later = new Date(Date.now() + 30 * 60_000).toISOString()
const sale = (
  payload: Record<string, unknown>,
  fields: Partial<GeneralProposal> = {},
) =>
  ({
    id: "s1",
    revision: 3,
    payload: {
      action: "sale_record",
      createAccount: false,
      method: "bank_transfer",
      partial: false,
      attachmentIds: [],
      ...payload,
    },
    status: "PENDING",
    expiresAt: later,
    receipt: null,
    review: [
      "Account: Ishaq Palmpay",
      "Customer: Walk-in",
      "Received: ₦20,000.00",
      "Total: Pending",
      "Remaining: Pending",
    ],
    question: "Review the sale, then save it.",
    choices: [{ label: "Customer (Walk-in)", text: "Change customer" }],
    approvalToken: "t",
    ...fields,
  }) as GeneralProposal
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
      onReply={noop}
    />,
  )

test("a fully paid sale leads with the amount, account and Walk-in", () => {
  const html = card(
    sale({
      accountName: "Ishaq Palmpay",
      moneyAccountId: "acc_1",
      receivedMinor: 2_000_000,
      customerChoice: "walk_in",
    }),
  )
  expect(html).toContain("Amount received")
  expect(html).toContain("20,000.00")
  expect(html).toContain("Paid into")
  expect(html).toContain("Ishaq Palmpay")
  expect(html).toContain("Walk-in")
  expect(html).toContain(">Change<")
  expect(html).toContain("Save sale")
  expect(html).toContain(">Edit<")
  expect(html).toContain(">Cancel<")
  expect(html).toContain("Not saved yet")
  // No placeholders, repeated question, status badge, ids or balance rows.
  expect(html).not.toContain("Pending")
  expect(html).not.toContain("Review the sale")
  expect(html).not.toContain("Needs your review")
  expect(html).not.toContain("acc_1")
  expect(html).not.toContain("Balance due")
  expect(html).not.toContain("Open order form")
})

test("a part-paid sale shows the total and the balance still due", () => {
  const html = card(
    sale(
      {
        accountName: "Shop cash",
        moneyAccountId: "acc_2",
        method: "cash",
        receivedMinor: 2_000_000,
        totalMinor: 5_000_000,
        partial: true,
        customerName: "Salman",
        customerId: "cus_9",
      },
      { choices: [] },
    ),
  )
  expect(html).toContain("Part payment received")
  expect(html).toContain("Sale total")
  expect(html).toContain("50,000.00")
  expect(html).toContain("Balance due")
  expect(html).toContain("30,000.00")
  expect(html).toContain("Salman")
  expect(html).not.toContain("cus_9")
  expect(html).not.toContain(">Change<")
})

test("new names are marked and a sale photo shows as a small image", () => {
  const html = card(
    sale(
      {
        accountName: "Moniepoint",
        createAccount: true,
        receivedMinor: 500_000,
        customerName: "Ada",
        customerChoice: "new",
        attachmentIds: ["att_1"],
      },
      { choices: [] },
    ),
  )
  expect(html).toContain("New account")
  expect(html).toContain(">New<")
  expect(html).toContain("/api/assistant/attachments/att_1/content")
})

test("an expired sale keeps the renewal path and offers no choices", () => {
  const html = card(
    sale(
      {
        accountName: "Ishaq Palmpay",
        moneyAccountId: "acc_1",
        receivedMinor: 2_000_000,
      },
      { status: "EXPIRED", approvalToken: undefined },
    ),
  )
  expect(html).toContain("Expired")
  expect(html).toContain("Edit and review again")
  expect(html).not.toContain("Save sale")
  expect(html).not.toContain(">Change<")
})
