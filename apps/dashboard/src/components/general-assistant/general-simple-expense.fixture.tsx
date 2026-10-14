import { expect, mock, test } from "bun:test"
import type {
  GeneralProposal,
  SimpleExpense,
} from "@ewatrade/assistant/general/contracts"
import { renderToStaticMarkup } from "react-dom/server"

mock.module("./general-product-picture", () => ({
  GeneralProductPicture: () => null,
}))
mock.module("@/trpc/client", () => ({
  useTRPC: () => ({
    assistant: {
      simpleExpenseOptions: {
        queryOptions: () => ({ queryKey: ["simpleExpenseOptions"] }),
      },
    },
  }),
}))
mock.module("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: {
      book: {
        id: "book",
        startsAt: new Date(2026, 9, 1, 15, 0).toISOString(),
        currencyCode: "NGN",
      },
      accounts: [
        { id: "acc_cash", name: "Shop cash", purpose: "CASH" },
        { id: "acc_bank", name: "Bank account", purpose: "BANK" },
      ],
      categories: [
        { id: "cat_ops", name: "Operating expenses", code: "6000" },
        { id: "cat_feed", name: "Feed", code: "6100" },
      ],
    },
  }),
}))
const { GeneralProposalCard } = await import("./general-proposal-card")
const { GeneralSimpleExpenseEditor } = await import(
  "./general-simple-expense-editor"
)

const later = new Date(Date.now() + 30 * 60_000).toISOString()
const expense = (payload: Partial<SimpleExpense> = {}) =>
  ({
    action: "expense_record_simple",
    amountMinor: 500_000,
    description: "feed",
    paid: true,
    accountName: "Shop cash",
    moneyAccountId: "acc_cash",
    categoryName: "Operating expenses",
    expenseCategoryId: "cat_ops",
    attachmentIds: [],
    ...payload,
  }) as SimpleExpense
const proposal = (
  payload: SimpleExpense,
  fields: Partial<GeneralProposal> = {},
) =>
  ({
    id: "e1",
    revision: 1,
    payload,
    status: "PENDING",
    expiresAt: later,
    receipt: null,
    review: ["Payee: Not specified", "Account: Pending"],
    question: "Proceed or change anything?",
    choices: [],
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

test("a paid expense reads amount, for feed, from Shop cash, then the quiet line", () => {
  const html = card(proposal(expense()))
  const at = (text: string) => html.indexOf(text)
  expect(at("5,000.00")).toBeGreaterThan(-1)
  expect(at("5,000.00")).toBeLessThan(at(">feed<"))
  expect(at(">feed<")).toBeLessThan(at("Shop cash"))
  expect(at("Shop cash")).toBeLessThan(
    at("Today · by you · Operating expenses"),
  )
  expect(html).toContain(">Proceed<")
  expect(html).toContain(">Edit<")
  expect(html).toContain(">Cancel<")
  expect(html).toContain("Not saved yet")
  for (const absent of [
    "Needs your review",
    "Proceed or change anything?",
    "Pending",
    "Not specified",
    "acc_cash",
    "cat_ops",
    "Not paid yet",
    ">Confirm<",
  ])
    expect(html).not.toContain(absent)
})

test("an unpaid bill says Not paid yet and names no account", () => {
  const html = card(
    proposal(
      expense({
        paid: false,
        accountName: undefined,
        moneyAccountId: undefined,
      }),
    ),
  )
  expect(html).toContain("Not paid yet")
  expect(html).not.toContain(">from<")
  expect(html).not.toContain("Shop cash")
})

test("a stated payee and a receipt show compactly", () => {
  const html = card(
    proposal(
      expense({ payeeName: "Mama Bisi Feeds", attachmentIds: ["att_7"] }),
    ),
  )
  expect(html).toContain("Mama Bisi Feeds")
  expect(html).toContain("/api/assistant/attachments/att_7/content")
})

test("Proceed stays guarded and an expired draft renews", () => {
  expect(card(proposal(expense(), { approvalToken: undefined }))).toMatch(
    /<button[^>]*disabled=""[^>]*>Proceed<\/button>/,
  )
  const expired = card(
    proposal(expense(), { status: "EXPIRED", approvalToken: undefined }),
  )
  expect(expired).toContain("Edit and review again")
  expect(expired).not.toContain(">Proceed<")
})

test("the editor offers amount, purpose, paid, account, category, payee, date and receipt", () => {
  const html = renderToStaticMarkup(
    <GeneralSimpleExpenseEditor
      initial={expense({ attachmentIds: ["att_7"] })}
      disabled={false}
      onSave={noop}
      onCancel={noop}
    />,
  )
  expect(html).toContain('value="5000"')
  expect(html).toContain('value="feed"')
  expect(html).toMatch(/aria-pressed="true"[^>]*>Paid</)
  expect(html).toContain('value="Shop cash"')
  // Chosen rows offer the others.
  expect(html).toContain(">Bank account<")
  expect(html).toContain(">Feed<")
  expect(html).toContain("Paid to (optional)")
  expect(html).toContain('min="2026-10-01"')
  expect(html).toContain('aria-label="Remove receipt"')
})

test("an unpaid draft hides the account field", () => {
  const html = renderToStaticMarkup(
    <GeneralSimpleExpenseEditor
      initial={expense({
        paid: false,
        accountName: undefined,
        moneyAccountId: undefined,
      })}
      disabled={false}
      onSave={noop}
      onCancel={noop}
    />,
  )
  expect(html).toMatch(/aria-pressed="true"[^>]*>Not paid yet</)
  expect(html).not.toContain("From account")
  expect(html).toContain("Owed to (optional)")
})
