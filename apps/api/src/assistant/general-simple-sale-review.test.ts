import { expect, test } from "bun:test"
import { simpleSaleAction } from "@ewatrade/assistant/general/contracts"
import { projectChannelProposalReview } from "./channel-proposal-review"
import { simpleSaleReviewPresentation } from "./general-simple-sale"
import { proposalDigest } from "./proposal-security"

const now = Date.parse("2026-10-15T12:00:00.000Z")
const facts = {
  businessName: "Original business",
  storeName: "Original Store",
  currencyCode: "NGN",
  timezone: "Africa/Lagos",
  hasBook: true,
  revision: "a".repeat(64),
  accountName: "Shop cash",
  total: 12500,
}
test("sale review shows the actual recording time, complete money, scope and staged effects", () => {
  const payload = simpleSaleAction.parse({
    action: "sale_record",
    receivedMinor: 5000,
    totalMinor: 12500,
    partial: true,
    accountName: "Shop cash",
    moneyAccountId: "cash",
    method: "cash",
    customerChoice: "walk_in",
    description: "Original complete description",
  })
  const presentation = simpleSaleReviewPresentation(payload, facts)
  const shown = JSON.stringify(presentation)
  for (const fact of [
    "Original business · NGN",
    "Original Store",
    "Shop cash",
    "Africa/Lagos",
    "Time of confirmation",
    "₦125",
    "₦50",
    "₦75",
    "Original complete description",
    "No inventory",
    "Walk-in; no saved customer created",
  ])
    expect(shown).toContain(fact)
  expect(shown).not.toContain("Today")
  const row = {
    id: "proposal",
    revision: 3,
    payloadHash: proposalDigest(payload),
    status: "PENDING",
    action: payload.action,
    actionVersion: 1,
    expiresAt: new Date(now + 300000),
  }
  const proposal = {
    id: row.id,
    revision: row.revision,
    payload,
    status: "PENDING",
    expiresAt: row.expiresAt.toISOString(),
    receipt: null,
    approvalToken: "server-only-approval",
    review: ["Review the exact sale."],
    presentation,
    choices: [{ label: "Customer (Walk-in)", text: "Change customer" }],
  }
  expect(projectChannelProposalReview(row, proposal, facts, now).kind).toBe(
    "review",
  )
  expect(
    projectChannelProposalReview(
      row,
      {
        ...proposal,
        choices: [
          { label: "Use a different account", text: "Use account: other" },
        ],
      },
      facts,
      now,
    ).kind,
  ).toBe("app_review")
  expect(
    projectChannelProposalReview(
      row,
      { ...proposal, question: "Which account?" },
      facts,
      now,
    ).kind,
  ).toBe("app_review")
  const staged = simpleSaleReviewPresentation(
    {
      ...payload,
      createAccount: true,
      moneyAccountId: undefined,
      customerChoice: "new",
      customerName: "Amina",
    },
    { ...facts, hasBook: false },
  )
  expect(JSON.stringify(staged)).toContain(
    "Create Book when confirmed; bookkeeping starts at confirmation",
  )
  expect(JSON.stringify(staged)).toContain("Create account when confirmed")
  expect(JSON.stringify(staged)).toContain(
    "Create saved customer when confirmed",
  )
})
test("incomplete sale and missing canonical timezone never become confirmable", () => {
  const payload = simpleSaleAction.parse({
    action: "sale_record",
    receivedMinor: 5000,
    accountName: "Shop cash",
    moneyAccountId: "cash",
    method: "cash",
    customerChoice: "walk_in",
  })
  expect(
    simpleSaleReviewPresentation(payload, { ...facts, timezone: "" }),
  ).toBeUndefined()
  expect(
    simpleSaleReviewPresentation(payload, { ...facts, total: undefined }),
  ).toBeUndefined()
  expect(
    simpleSaleReviewPresentation(
      { ...payload, receivedMinor: undefined },
      facts,
    ),
  ).toBeUndefined()
})
