import { expect, test } from "bun:test"
import {
  type GeneralAction,
  type GeneralReviewPresentation,
  generalMoney,
  simpleExpenseAction,
  simpleMoneyInAction,
  simpleTransferAction,
} from "@ewatrade/assistant/general/contracts"
import { projectChannelProposalReview } from "./channel-proposal-review"
import { simpleExpenseReviewPresentation } from "./general-simple-expense"
import { simpleMoneyInReviewPresentation } from "./general-simple-money-in"
import { simpleTransferReviewPresentation } from "./general-simple-transfer"
import { proposalDigest } from "./proposal-security"

const now = Date.parse("2026-10-15T12:00:00.000Z")
const effectiveAt = "2026-10-14T23:59:59.123Z"
const facts = {
  businessName: "Original business",
  storeName: "Original Store",
  currencyCode: "NGN",
  timezone: "Africa/Lagos",
  revision: "a".repeat(64),
}
function project(
  payload: GeneralAction,
  presentation: GeneralReviewPresentation | undefined,
) {
  const row = {
    id: "proposal",
    revision: 4,
    payloadHash: proposalDigest(payload),
    action: payload.action,
    actionVersion: 1,
    status: "PENDING",
    expiresAt: new Date(now + 300000),
  }
  return projectChannelProposalReview(
    row,
    {
      id: row.id,
      revision: row.revision,
      payload,
      status: "PENDING",
      expiresAt: row.expiresAt.toISOString(),
      receipt: null,
      approvalToken: "server-only-approval",
      review: ["Review the exact saved bookkeeping details."],
      presentation,
    },
    facts,
    now,
  )
}
const text = (value: unknown) => JSON.stringify(value)

test("transfer preserves exact Book/date/account/amount/note and distinguishes staged destination", () => {
  const payload = simpleTransferAction.parse({
    action: "money_transfer_simple",
    amountMinor: 123456789,
    fromMoneyAccountId: "source",
    fromAccountName: "Business bank",
    toMoneyAccountId: "destination",
    toAccountName: "Store cash",
    effectiveAt,
    bookId: "book",
    note: "N".repeat(400),
  })
  const current = {
    ...facts,
    from: { name: "Business bank", purpose: "BANK" },
    to: { name: "Store cash", purpose: "CASH" },
  }
  const presentation = simpleTransferReviewPresentation(payload, current)
  const shown = text(presentation)
  for (const value of [
    "Original business · NGN",
    effectiveAt,
    "Africa/Lagos",
    "Original Store",
    "Business bank",
    "Store cash",
    generalMoney(123456789, "NGN"),
    payload.note,
    "Existing BANK account",
    "Existing CASH account",
    "already-made transfer",
  ])
    expect(shown).toContain(value)
  expect(shown).not.toContain("Today")
  expect(project(payload, presentation).kind).toBe("review")
  const staged = {
    ...payload,
    toMoneyAccountId: undefined,
    newToAccount: { name: "Store cash", kind: "CASH" as const },
  }
  const stagedPresentation = simpleTransferReviewPresentation(staged, {
    ...current,
    to: undefined,
  })
  expect(text(stagedPresentation)).toContain(
    "Create CASH account when recorded",
  )
  expect(project(staged, stagedPresentation).kind).toBe("review")
})

test("paid and unpaid expense reviews preserve category/payee and actual funding distinction", () => {
  const payload = simpleExpenseAction.parse({
    action: "expense_record_simple",
    amountMinor: 10001,
    description: "D".repeat(200),
    payeeName: "P".repeat(160),
    paid: true,
    moneyAccountId: "source",
    accountName: "Business bank",
    expenseCategoryId: "category",
    categoryName: "Transport",
    effectiveAt,
    bookId: "book",
  })
  const current = {
    ...facts,
    account: { name: "Business bank", purpose: "BANK" },
    category: { name: "Transport" },
  }
  const presentation = simpleExpenseReviewPresentation(payload, current)
  const shown = text(presentation)
  if (!payload.description || !payload.payeeName)
    throw Error("Expense fixture requires its description and payee")
  for (const value of [
    payload.description,
    payload.payeeName,
    "Transport",
    "Business bank",
    effectiveAt,
    "Already paid · business account",
    generalMoney(10001, "NGN"),
  ])
    expect(shown).toContain(value)
  expect(project(payload, presentation).kind).toBe("review")
  const unpaid = {
    ...payload,
    paid: false,
    moneyAccountId: undefined,
    accountName: undefined,
  }
  const unpaidPresentation = simpleExpenseReviewPresentation(unpaid, {
    ...current,
    account: undefined,
  })
  expect(text(unpaidPresentation)).toContain("Unpaid · no payment recorded")
  expect(text(unpaidPresentation)).not.toContain("Paid from")
  expect(text(unpaidPresentation)).not.toContain("Business bank")
  expect(project(unpaid, unpaidPresentation).kind).toBe("review")
})

test("owner funds review identifies existing vs new Book/account and keeps full description", () => {
  const payload = simpleMoneyInAction.parse({
    action: "money_in_record",
    amountMinor: 250000,
    createAccount: true,
    accountName: "New bank",
    effectiveAt,
    description: "D".repeat(400),
  })
  const staged = simpleMoneyInReviewPresentation(payload, {
    ...facts,
    existingBook: false,
  })
  for (const value of [
    "Create Book when recorded",
    "Create BANK account when recorded",
    payload.description,
    effectiveAt,
    "Owner contribution · not sales income",
    "Original business · NGN",
  ])
    expect(text(staged)).toContain(value)
  expect(project(payload, staged).kind).toBe("review")
  const existing = {
    ...payload,
    createAccount: false,
    moneyAccountId: "account",
  }
  const presentation = simpleMoneyInReviewPresentation(existing, {
    ...facts,
    existingBook: true,
    account: { name: "New bank", purpose: "BANK" },
  })
  expect(text(presentation)).toContain("Existing Book")
  expect(text(presentation)).toContain("Existing BANK account")
  expect(text(presentation)).not.toContain("Create Book")
  expect(project(existing, presentation).kind).toBe("review")
})

test("incomplete, oversized, foreign Book, absent timezone and attached reviews fail closed", () => {
  const payload = simpleTransferAction.parse({
    action: "money_transfer_simple",
    amountMinor: 100,
    fromMoneyAccountId: "source",
    fromAccountName: "Business bank",
    toMoneyAccountId: "destination",
    toAccountName: "Store cash",
    effectiveAt,
    bookId: "book",
  })
  const current = {
    ...facts,
    from: { name: "Business bank", purpose: "BANK" },
    to: { name: "Store cash", purpose: "CASH" },
  }
  expect(
    simpleTransferReviewPresentation(
      { ...payload, effectiveAt: undefined },
      current,
    ),
  ).toBeUndefined()
  expect(
    simpleTransferReviewPresentation(payload, { ...current, from: undefined }),
  ).toBeUndefined()
  expect(
    simpleTransferReviewPresentation(payload, {
      ...current,
      businessName: "B".repeat(250),
    }),
  ).toBeUndefined()
  const presentation = simpleTransferReviewPresentation(payload, current)
  expect(
    project({ ...payload, attachmentIds: ["image"] }, presentation).kind,
  ).toBe("app_review")
  expect(
    project(
      payload,
      simpleTransferReviewPresentation(payload, {
        ...current,
        businessName: "Another business",
      }),
    ).kind,
  ).toBe("app_review")
  expect(
    project(
      payload,
      simpleTransferReviewPresentation(payload, { ...current, timezone: "" }),
    ).kind,
  ).toBe("app_review")
  expect(
    simpleExpenseReviewPresentation(
      simpleExpenseAction.parse({
        action: "expense_record_simple",
        amountMinor: 1,
      }),
      { ...facts },
    ),
  ).toBeUndefined()
  expect(
    simpleMoneyInReviewPresentation(
      simpleMoneyInAction.parse({ action: "money_in_record", amountMinor: 1 }),
      { ...facts, existingBook: true },
    ),
  ).toBeUndefined()
})
