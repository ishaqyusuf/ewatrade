import { expect, mock, test } from "bun:test"
import type {
  GeneralProposal,
  SimpleTransfer,
} from "@ewatrade/assistant/general/contracts"
import { renderToStaticMarkup } from "react-dom/server"

mock.module("./general-product-picture", () => ({
  GeneralProductPicture: () => null,
}))
mock.module("@/trpc/client", () => ({
  useTRPC: () => ({
    assistant: {
      simpleTransferOptions: {
        queryOptions: () => ({ queryKey: ["simpleTransferOptions"] }),
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
        { id: "acc_palm", name: "palmpay 02", purpose: "BANK" },
      ],
    },
  }),
}))
const { GeneralProposalCard } = await import("./general-proposal-card")
const { GeneralSimpleTransferEditor } = await import(
  "./general-simple-transfer-editor"
)

const later = new Date(Date.now() + 30 * 60_000).toISOString()
const transfer = (payload: Partial<SimpleTransfer> = {}) =>
  ({
    action: "money_transfer_simple",
    amountMinor: 500_000,
    fromAccountName: "Shop cash",
    fromMoneyAccountId: "acc_cash",
    toAccountName: "palmpay 02",
    toMoneyAccountId: "acc_palm",
    attachmentIds: [],
    ...payload,
  }) as SimpleTransfer
const proposal = (
  payload: SimpleTransfer,
  fields: Partial<GeneralProposal> = {},
) =>
  ({
    id: "t1",
    revision: 1,
    payload,
    status: "PENDING",
    expiresAt: later,
    receipt: null,
    review: ["From: Pending", "To: Pending"],
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

test("a transfer reads amount, then from one account to the other, then today · by you", () => {
  const html = card(proposal(transfer()))
  const at = (text: string) => html.indexOf(text)
  expect(at("5,000.00")).toBeGreaterThan(-1)
  expect(at("5,000.00")).toBeLessThan(at("Shop cash"))
  expect(at("Shop cash")).toBeLessThan(at("→"))
  expect(at("→")).toBeLessThan(at("palmpay 02"))
  expect(at("palmpay 02")).toBeLessThan(at("Today · by you"))
  expect(html).toContain('<span class="sr-only">to</span>')
  expect(html).toContain(">Proceed<")
  expect(html).toContain(">Edit<")
  expect(html).toContain(">Cancel<")
  expect(html).toContain("Not saved yet")
  for (const absent of [
    "Needs your review",
    "Proceed or change anything?",
    "Pending",
    "acc_cash",
    "acc_palm",
    "New bank account",
    ">Confirm<",
  ])
    expect(html).not.toContain(absent)
})

test("a staged destination is marked by its kind, and a note and receipt show", () => {
  const html = card(
    proposal(
      transfer({
        toAccountName: "Ishaq PalmPay",
        toMoneyAccountId: undefined,
        newToAccount: { name: "Ishaq PalmPay", kind: "BANK" },
        note: "Float for POS",
        attachmentIds: ["att_3"],
      }),
    ),
  )
  expect(html).toContain("Ishaq PalmPay")
  expect(html).toContain("New bank account")
  expect(html).toContain("Float for POS")
  expect(html).toContain("/api/assistant/attachments/att_3/content")
})

test("Proceed stays guarded and an expired draft renews", () => {
  expect(card(proposal(transfer(), { approvalToken: undefined }))).toMatch(
    /<button[^>]*disabled=""[^>]*>Proceed<\/button>/,
  )
  const expired = card(
    proposal(transfer(), { status: "EXPIRED", approvalToken: undefined }),
  )
  expect(expired).toContain("Edit and review again")
  expect(expired).not.toContain(">Proceed<")
})

test("the editor offers amount, from, to, date, note and receipt", () => {
  const html = renderToStaticMarkup(
    <GeneralSimpleTransferEditor
      initial={transfer({ attachmentIds: ["att_3"] })}
      disabled={false}
      onSave={noop}
      onCancel={noop}
    />,
  )
  expect(html).toContain('value="5000"')
  expect(html).toContain('value="Shop cash"')
  expect(html).toContain('value="palmpay 02"')
  expect(html).toContain(">Bank account<")
  expect(html).toContain('min="2026-10-01"')
  expect(html).toContain("Note (optional)")
  expect(html).toContain('aria-label="Remove receipt"')
  expect(html).not.toContain("New account type")
  // Each side never offers the account chosen on the other side.
  expect(html.match(/>palmpay 02</g)?.length ?? 0).toBe(0)
  expect(html.match(/>Shop cash</g)?.length ?? 0).toBe(0)
})

test("a typed new destination offers Bank or Cash; an unmatched source asks for an existing account", () => {
  const html = renderToStaticMarkup(
    <GeneralSimpleTransferEditor
      initial={transfer({
        fromAccountName: "Till",
        fromMoneyAccountId: undefined,
        toAccountName: "Ishaq PalmPay",
        toMoneyAccountId: undefined,
        newToAccount: { name: "Ishaq PalmPay", kind: "BANK" },
      })}
      disabled={false}
      onSave={noop}
      onCancel={noop}
    />,
  )
  expect(html).toContain("New account type")
  expect(html).toMatch(/aria-pressed="true"[^>]*>Bank</)
  expect(html).toMatch(/aria-pressed="false"[^>]*>Cash</)
  expect(html).toContain("Choose one of your accounts.")
  // No close match: every account is offered.
  expect(html).toContain(">Shop cash<")
})
