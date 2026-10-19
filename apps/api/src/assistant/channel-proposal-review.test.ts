import { expect, test } from "bun:test"
import {
  generalActionSchema,
  simpleSaleAction,
} from "@ewatrade/assistant/general/contracts"
import { customerCreatePresentation } from "./catalog-review-presentations"
import {
  type ChannelProposalSource,
  projectChannelProposalReview,
} from "./channel-proposal-review"
import type { GeneralTransactionContext } from "./general-actions"
import { simpleSaleRecord } from "./general-simple-sale"
import { proposalDigest } from "./proposal-security"
const now = Date.parse("2026-10-15T12:00:00.000Z")
const scope = {
  businessName: "Original business",
  storeName: "Original Store",
  currencyCode: "NGN",
}
function customer() {
  const payload = generalActionSchema.parse({
    action: "customer_create",
    name: "Amina",
    phone: "08030000000",
    email: "amina@example.test",
  })
  const row: ChannelProposalSource = {
    id: "proposal",
    revision: 3,
    payloadHash: proposalDigest(payload),
    status: "PENDING",
    action: payload.action,
    actionVersion: 1,
    expiresAt: new Date(now + 300000),
  }
  return {
    row,
    proposal: {
      id: row.id,
      revision: row.revision,
      payload,
      status: "PENDING",
      expiresAt: row.expiresAt.toISOString(),
      receipt: null,
      approvalToken: "server-only-approval",
      review: ["Amina · 08030000000 · amina@example.test"],
      presentation: customerCreatePresentation({
        name: "Amina",
        phone: "08030000000",
        email: "amina@example.test",
      }),
    },
  }
}

test("only exact pending canonical source review becomes a token-free channel projection", () => {
  const { row, proposal } = customer()
  const result = projectChannelProposalReview(row, proposal, scope, now)
  expect(result.kind).toBe("review")
  expect(JSON.stringify(result)).not.toContain("server-only-approval")
  if (result.kind !== "review") throw Error("Canonical customer review missing")
  expect(result.review.source).toEqual({
    proposalId: row.id,
    revision: 3,
    payloadHash: row.payloadHash,
  })
  expect(result.review.businessName).toBe("Original business")
  expect(result.review.reviewLines).toContain(
    "Amina · 08030000000 · amina@example.test",
  )
  for (const patch of [
    { revision: 4 },
    { id: "another-proposal" },
    { status: "COMPLETED" },
    { approvalToken: undefined },
    { question: "Which customer?" },
    { presentation: undefined },
  ])
    expect(
      projectChannelProposalReview(row, { ...proposal, ...patch }, scope, now)
        .kind,
    ).toBe("app_review")
  expect(
    projectChannelProposalReview(
      { ...row, payloadHash: "0".repeat(64) },
      proposal,
      scope,
      now,
    ).kind,
  ).toBe("app_review")
  expect(
    projectChannelProposalReview(row, proposal, scope, row.expiresAt.getTime())
      .kind,
  ).toBe("app_review")
})

test("material clipped contact or incomplete cash review never receives native confirm projection", () => {
  const { row, proposal } = customer()
  expect(
    projectChannelProposalReview(
      row,
      { ...proposal, review: ["Amina…"] },
      scope,
      now,
    ).kind,
  ).toBe("app_review")
  expect(
    projectChannelProposalReview(
      row,
      {
        ...proposal,
        presentation: customerCreatePresentation({
          name: "Different customer",
        }),
        review: ["Different customer"],
      },
      scope,
      now,
    ).kind,
  ).toBe("app_review")
  const payload = generalActionSchema.parse({
    action: "money_transfer_simple",
    amountMinor: 12500,
    fromMoneyAccountId: "from",
    toMoneyAccountId: "to",
    fromAccountName: "Shop bank",
    toAccountName: "Shop cash",
    bookId: "book",
    effectiveAt: "2026-10-15T11:00:00.000Z",
  })
  expect(
    projectChannelProposalReview(
      { ...row, action: payload.action, payloadHash: proposalDigest(payload) },
      {
        ...proposal,
        payload,
        presentation: undefined,
        review: ["₦125.00 from Shop bank to Shop cash", "Today · by you"],
      },
      scope,
      now,
    ).kind,
  ).toBe("app_review")
})

test("unsupported write stays app review even with a valid-looking generic presentation", () => {
  const { row, proposal } = customer()
  const payload = generalActionSchema.parse({
    action: "catalog_archive",
    catalogItemId: "product",
    targets: [{ kind: "offering", offeringId: "offering" }],
    reason: "Stopped selling",
  })
  expect(
    projectChannelProposalReview(
      { ...row, action: payload.action, payloadHash: proposalDigest(payload) },
      { ...proposal, payload },
      scope,
      now,
    ).kind,
  ).toBe("app_review")
})

test("canonical ready sale instruction permits exact review while clarification still requires app review", async () => {
  // Inert canonical review dependencies: no database client or domain command executes.
  const ctx = {
    session: { user: { id: "user" }, session: { id: "session" } },
    requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
    tenantContext: {
      tenant: {
        id: "tenant",
        name: scope.businessName,
        dataClassification: "QA",
        currencyCode: "NGN",
        timezone: "Africa/Lagos",
        retailOpsPlanId: "pro",
      },
      membership: { id: "member", role: "OWNER" },
      activeStore: { id: "store", name: scope.storeName, currencyCode: "NGN" },
      stores: [{ id: "store" }],
      staffAccess: {
        status: "ACTIVE",
        mode: "LEGACY",
        businessRole: "OWNER",
        assignments: [],
      },
    },
    db: {
      financeBook: {
        findUnique: async () => ({ id: "book", currencyCode: "NGN" }),
        findFirst: async () => ({ timezone: "Africa/Lagos" }),
      },
      financeAccount: {
        findMany: async () => [
          {
            id: "cash",
            name: "Shop cash",
            purpose: "CASH",
            paymentMethods: [],
            paymentsPausedAt: null,
          },
        ],
      },
      assistantAttachment: { findMany: async () => [] },
    },
  } as unknown as GeneralTransactionContext
  const payload = simpleSaleAction.parse({
    action: "sale_record",
    moneyAccountId: "cash",
    accountName: "Shop cash",
    method: "cash",
    receivedMinor: 12500,
    customerChoice: "walk_in",
    description: "Counter sale",
  })
  const { row: baseRow, proposal: baseProposal } = customer()
  const row = {
    ...baseRow,
    action: payload.action,
    payloadHash: proposalDigest(payload),
  }
  const oldKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "synthetic-review-key-".repeat(3)
  try {
    const canonical = await simpleSaleRecord.review(ctx, payload)
    const proposal = {
      ...baseProposal,
      payload,
      question: canonical.question,
      choices: canonical.choices,
      presentation: canonical.presentation,
      review: canonical.lines,
    }
    expect(canonical.question).toBe("Review the sale, then save it.")
    expect(projectChannelProposalReview(row, proposal, scope, now).kind).toBe(
      "review",
    )
    expect(
      projectChannelProposalReview(
        row,
        { ...proposal, question: "Which account?" },
        scope,
        now,
      ).kind,
    ).toBe("app_review")
    const partial = { ...payload, partial: true }
    const clarification = await simpleSaleRecord.review(ctx, partial)
    expect(clarification.question).toBe("What is the full sale total?")
    expect(
      projectChannelProposalReview(
        { ...row, payloadHash: proposalDigest(partial) },
        {
          ...baseProposal,
          payload: partial,
          question: clarification.question,
          choices: clarification.choices,
          presentation: clarification.presentation,
          review: clarification.lines,
        },
        scope,
        now,
      ).kind,
    ).toBe("app_review")
  } finally {
    if (oldKey === undefined)
      Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
    else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = oldKey
  }
})
