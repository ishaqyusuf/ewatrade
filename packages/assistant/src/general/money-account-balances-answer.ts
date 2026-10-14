import {
  type MoneyAccountPurpose,
  moneyAccountPaymentMethods,
} from "@ewatrade/utils/finance-payment-methods"
import { generalMoneyAccountsAnswer } from "./money-accounts-answer"
type Balances = {
  currencyCode: string
  startsAt: Date | string
  snapshotSequence: string
  accounts: {
    id: string
    code: string
    name: string
    purpose: string
    kind: string
    archivedAt: Date | null
    paymentsPausedAt: Date | null
    paymentMethods: readonly string[]
    balanceMinor: string
  }[]
}
/** Only recorded, active money accounts; equity, liabilities and expense totals are never balances of cash/bank accounts. */
export function generalMoneyAccountBalancesPage(
  result: Balances,
  afterCode?: string,
) {
  const eligible = result.accounts
    .filter(
      (a) =>
        !a.archivedAt &&
        a.kind === "ASSET" &&
        ["CASH", "BANK", "CLEARING"].includes(a.purpose) &&
        (afterCode === undefined || a.code > afterCode),
    )
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
  const rows = eligible.slice(0, 10)
  const page = {
    currencyCode: result.currencyCode,
    startsAt: result.startsAt,
    snapshotSequence: result.snapshotSequence,
    accounts: rows.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      purpose: a.purpose,
      balanceMinor: a.balanceMinor,
    })),
    nextCursor: eligible.length > 10 ? (rows.at(-1)?.code ?? null) : null,
  }
  const answer = generalMoneyAccountsAnswer({
    book: { currencyCode: result.currencyCode },
    accounts: rows.map((a) => ({
      name: a.name,
      purpose: a.purpose,
      paymentMethods: moneyAccountPaymentMethods({
        purpose: a.purpose as MoneyAccountPurpose,
        paymentMethods: a.paymentMethods,
      }),
      availableForPayments: !a.paymentsPausedAt,
    })),
    nextCursor: page.nextCursor,
  })
  const start = new Date(
    result.startsAt instanceof Date
      ? result.startsAt.getTime()
      : result.startsAt,
  ).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
  return {
    page,
    answer: {
      ...answer,
      title: "Account balances",
      scope: `Finance Book · ${result.currencyCode} · since ${start} · snapshot ${result.snapshotSequence}`,
      detail:
        "Recorded in your books; not checked against a bank balance or a cash count.",
      accounts: {
        ...answer.accounts,
        currencyCode: result.currencyCode,
        rows: answer.accounts.rows.map((a, i) => ({
          ...a,
          balanceMinor: rows[i]?.balanceMinor,
        })),
      },
    },
  }
}

/** Plain unfiltered balance questions have a fixed read owner, even after an older refusal. */
export function isPlainAccountBalanceRequest(text: string) {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[?.!]+$/, "")
    .replace(/\s+/g, " ")
  return /^(?:please )?(?:(?:show|check|list)(?: me)? (?:my |the |all )?(?:money )?account balances|(?:show(?: me)? )?how much (?:is )?in (?:each|every|all)(?: of my)? accounts?|(?:show(?: me)? )?(?:the )?balances? (?:in|of|for) (?:each|every|all|my) accounts?)$/.test(
    normalized,
  )
}
