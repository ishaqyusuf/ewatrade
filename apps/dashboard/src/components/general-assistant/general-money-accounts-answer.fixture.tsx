import { expect, mock, test } from "bun:test"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import { renderToStaticMarkup } from "react-dom/server"

mock.module("next/link", () => ({
  default: ({ href, ...props }: { href: string }) => (
    <a href={href} {...props} />
  ),
}))
const { GeneralAnswerCard } = await import("./general-answer-card")

const answer = {
  id: "m1",
  title: "Money accounts",
  value: "4 accounts",
  scope: "Finance Book · NGN",
  asOf: "2026-10-13T18:25:25.000Z",
  detail: "Shop cash (cash), … Names only; balances aren't checked here.",
  accounts: {
    rows: [
      {
        name: "Shop cash",
        kind: "cash",
        methods: ["cash"],
        defaultMethods: true,
        paused: false,
      },
      {
        name: "Bank account",
        kind: "bank",
        methods: ["bank_transfer", "pos", "card"],
        defaultMethods: true,
        paused: false,
      },
      {
        name: "Payments awaiting settlement",
        kind: "settlement",
        methods: ["pos", "card", "other"],
        defaultMethods: true,
        paused: false,
      },
      {
        name: "palmpay 02",
        kind: "bank",
        methods: ["bank_transfer"],
        defaultMethods: false,
        paused: true,
      },
    ],
    more: false,
  },
} satisfies GeneralAnswer
const render = (value: GeneralAnswer) =>
  renderToStaticMarkup(<GeneralAnswerCard answer={value} />)

test("accounts read as named rows with plain kinds, not a count hero", () => {
  const html = render(answer)
  expect(html).toContain("Money accounts")
  for (const name of [
    "Shop cash",
    "Bank account",
    "Payments awaiting settlement",
    "palmpay 02",
  ])
    expect(html).toContain(name)
  for (const kind of [">Cash<", ">Bank<", ">Settlement<"])
    expect(html).toContain(kind)
  expect(html).not.toContain("4 accounts")
  expect(html).not.toContain("on this page")
  expect(html).not.toContain("CLEARING")
  expect(html).not.toContain("bank_transfer")
})

test("methods show only when unusual, and a pause is marked", () => {
  const html = render(answer)
  expect(html).toContain("Takes Bank transfer")
  expect(html).not.toContain("Takes Cash")
  expect(html).not.toContain("Takes POS")
  expect(html).toContain(">Paused<")
})

test("provenance sits under Details and the list opens the real page", () => {
  const html = render(answer)
  expect(html.indexOf("<summary")).toBeLessThan(
    html.indexOf("Finance Book · NGN"),
  )
  expect(html).toContain("Balances aren&#x27;t checked here.")
  expect(html).toContain('href="/finance/accounts"')
  expect(html).toContain("Open accounts")
  // No fake choices: rows are not buttons.
  expect(html.match(/<button/g)?.length ?? 0).toBe(0)
})

test("a further page says so without a total, and empty reads plainly", () => {
  expect(
    render({ ...answer, accounts: { ...answer.accounts, more: true } }),
  ).toContain("More accounts in Money accounts.")
  expect(render({ ...answer, accounts: { rows: [], more: false } })).toContain(
    "No money accounts yet.",
  )
})

test("answers without rows keep the generic card", () => {
  const { accounts: _, ...plain } = answer
  const html = render({ ...plain, title: "Sales today", value: "₦12,450.00" })
  expect(html).toContain("₦12,450.00")
  expect(html).not.toContain("Open accounts")
})

const balances = {
  ...answer,
  title: "Account balances",
  scope: "Finance Book · NGN · since 13 Oct 2026",
  accounts: {
    ...answer.accounts,
    currencyCode: "NGN",
    rows: [
      { ...answer.accounts.rows[0], balanceMinor: "2000000" },
      { ...answer.accounts.rows[1], balanceMinor: "0" },
      { ...answer.accounts.rows[2], balanceMinor: "-150000" },
      { ...answer.accounts.rows[3] },
    ],
  },
} as GeneralAnswer

test("a balances read puts recorded amounts on the right and the kind under the name", () => {
  const html = render(balances)
  expect(html).toContain("Account balances")
  expect(html).toContain("20,000.00")
  expect(html).toMatch(/₦0\.00/)
  expect(html).toMatch(/text-destructive[^>]*>-?₦?-?1,500\.00/)
  // The unpriced row shows a dash, never a made-up zero.
  expect(html).toContain(">—<")
  expect(html).toContain(">Cash<")
  expect(html).toContain("Bank · Takes Bank transfer")
  expect(html).toContain(">Paused<")
  expect(html).toContain(
    "Recorded in your books, not checked against the bank or a cash count.",
  )
  expect(html).not.toContain("Names and payment methods only")
  expect(html).not.toContain(">Total<")
})
