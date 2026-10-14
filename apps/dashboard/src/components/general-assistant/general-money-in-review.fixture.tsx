import { expect, mock, test } from "bun:test"
import type {
  GeneralProposal,
  SimpleMoneyIn,
} from "@ewatrade/assistant/general/contracts"
import { renderToStaticMarkup } from "react-dom/server"

mock.module("./general-product-picture", () => ({
  GeneralProductPicture: () => null,
}))
mock.module("@/trpc/client", () => ({
  useTRPC: () => ({
    assistant: {
      saleOptions: { queryOptions: () => ({ queryKey: ["saleOptions"] }) },
    },
  }),
}))
mock.module("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: {
      accounts: [
        { id: "acc_cash", name: "Shop cash", purpose: "CASH" },
        { id: "acc_bank", name: "Ishaq Palmpay", purpose: "BANK" },
      ],
      customers: [],
    },
  }),
}))
const { GeneralProposalCard } = await import("./general-proposal-card")
const { moneyInDay } = await import("./general-money-in-review")
const { GeneralSimpleMoneyInEditor, localDay, moneyInEffectiveAt } =
  await import("./general-simple-money-in-editor")

const later = new Date(Date.now() + 30 * 60_000).toISOString()
const money = (payload: Partial<SimpleMoneyIn> = {}): SimpleMoneyIn => ({
  action: "money_in_record",
  amountMinor: 2_000_000,
  accountName: "Shop cash",
  moneyAccountId: "acc_cash",
  createAccount: false,
  description: "",
  attachmentIds: [],
  ...payload,
})
const proposal = (
  payload: SimpleMoneyIn,
  fields: Partial<GeneralProposal> = {},
) =>
  ({
    id: "m1",
    revision: 2,
    payload,
    status: "PENDING",
    expiresAt: later,
    receipt: null,
    review: ["Amount: Pending", "Account: Pending"],
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

test("money in reads amount, account, then today · by you · owner funds", () => {
  const html = card(proposal(money()))
  const at = (text: string) => html.indexOf(text)
  expect(at("20,000.00")).toBeGreaterThan(-1)
  expect(at("20,000.00")).toBeLessThan(at("Shop cash"))
  expect(at("Shop cash")).toBeLessThan(at("Today · by you"))
  expect(html).toContain("Owner funds")
  expect(html).toContain(">Proceed<")
  expect(html).toContain(">Edit<")
  expect(html).toContain(">Cancel<")
  expect(html).toContain("Not saved yet")
  // No badge, repeated question, placeholders, ids or empty note.
  expect(html).not.toContain("Needs your review")
  expect(html).not.toContain("Proceed or change anything?")
  expect(html).not.toContain("Pending")
  expect(html).not.toContain("acc_cash")
  expect(html).not.toContain("New account")
  expect(html).not.toContain(">Confirm<")
})

test("a new account, a stated note and a photo show compactly", () => {
  const html = card(
    proposal(
      money({
        accountName: "Money QA Bank",
        moneyAccountId: undefined,
        createAccount: true,
        description: "Float for the week",
        attachmentIds: ["att_9"],
      }),
    ),
  )
  expect(html).toContain("Money QA Bank")
  expect(html).toContain("New account")
  expect(html).toContain("Float for the week")
  expect(html).toContain("/api/assistant/attachments/att_9/content")
})

test("Proceed stays guarded and an expired draft renews", () => {
  expect(card(proposal(money(), { approvalToken: undefined }))).toMatch(
    /<button[^>]*disabled=""[^>]*>Proceed<\/button>/,
  )
  const expired = card(
    proposal(money(), { status: "EXPIRED", approvalToken: undefined }),
  )
  expect(expired).toContain("Expired")
  expect(expired).toContain("Edit and review again")
  expect(expired).not.toContain(">Proceed<")
})

test("dates read as Today, Yesterday or a short date", () => {
  const now = new Date(2026, 9, 13, 18, 0)
  expect(moneyInDay(undefined, now)).toBe("Today")
  expect(moneyInDay(new Date(2026, 9, 13, 8).toISOString(), now)).toBe("Today")
  expect(moneyInDay(new Date(2026, 9, 12, 8).toISOString(), now)).toBe(
    "Yesterday",
  )
  expect(moneyInDay(new Date(2026, 9, 1, 8).toISOString(), now)).toMatch(/1/)
})

test("the edited date keeps the reviewed timestamp unless the day changes", () => {
  const now = new Date(2026, 9, 13, 18, 0)
  const reviewed = new Date(2026, 9, 10, 9, 41, 7).toISOString()
  expect(moneyInEffectiveAt("2026-10-10", reviewed, now)).toBe(reviewed)
  expect(moneyInEffectiveAt("2026-10-13", undefined, now)).toBeUndefined()
  expect(moneyInEffectiveAt("2026-10-13", reviewed, now)).toBeUndefined()
  expect(moneyInEffectiveAt("2026-10-11", undefined, now)).toBe(
    new Date(2026, 9, 11, 12).toISOString(),
  )
  expect(moneyInEffectiveAt("", undefined, now)).toBeNull()
  expect(localDay(now)).toBe("2026-10-13")
})

test("the editor offers amount, account, date, note and photo removal", () => {
  const html = renderToStaticMarkup(
    <GeneralSimpleMoneyInEditor
      initial={money({ attachmentIds: ["att_9"], description: "" })}
      disabled={false}
      onSave={noop}
      onCancel={noop}
    />,
  )
  expect(html).toContain('value="20000"')
  expect(html).toContain('value="Shop cash"')
  expect(html).toContain('type="date"')
  expect(html).toContain("Note (optional)")
  expect(html).toContain('aria-label="Remove photo"')
  // The chosen account is not offered again; another one is.
  expect(html).toContain(">Ishaq Palmpay<")
  expect(html).not.toContain(">Shop cash<")
  expect(html).toContain("owner funds")
})
