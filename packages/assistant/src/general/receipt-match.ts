/**
 * Decides what a read bank transfer receipt is, from the business's own money
 * accounts and owing orders. Pure and deterministic: the model only read the
 * printed text, and every result still goes through a reviewed draft.
 */
export type ReceiptAccount = {
  id: string
  name: string
  bankAccountNumber?: string | null
  bankAccountHolder?: string | null
  bankName?: string | null
}
export type ReceiptOrder = {
  id: string
  orderNumber: string
  customerName: string | null
  customerId: string | null
  balanceMinor: number
}
export type ReceiptFacts = {
  amountMinor: number | null
  senderName: string | null
  senderAccount: string | null
  senderBank: string | null
  recipientName: string | null
  recipientAccount: string | null
  recipientBank: string | null
  narration: string | null
  caption: string | null
}
export type ReceiptMatchReason =
  | "order_number"
  | "remark"
  | "caption"
  | "sender"
  | "typed"
export type ReceiptPurpose =
  | { type: "owner_withdrawal" }
  | { type: "expense"; categoryName: string }
export type ReceiptOutcome =
  | { kind: "unreadable" }
  | {
      kind: "order_payment"
      account: ReceiptAccount
      order: ReceiptOrder
      amountMinor: number
      excessMinor: number
      reason: ReceiptMatchReason
    }
  | { kind: "choose_order"; account: ReceiptAccount; orders: ReceiptOrder[] }
  | { kind: "ask_order"; account: ReceiptAccount }
  | { kind: "own_transfer"; from: ReceiptAccount; to: ReceiptAccount }
  | {
      kind: "money_out"
      account: ReceiptAccount
      purpose: ReceiptPurpose | null
    }
  | { kind: "unknown_account" }

const words = (value: string | null | undefined) =>
  (value ?? "")
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 2)

function editDistance(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++)
      current[j] = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    previous = current
  }
  return previous[b.length] ?? 99
}
const sameWord = (a: string, b: string) =>
  a === b ||
  (a.length >= 5 && b.length >= 5 && editDistance(a, b) <= 1) ||
  (a.length >= 4 && b.startsWith(a)) ||
  (b.length >= 4 && a.startsWith(b))

/**
 * Whether a printed or typed name refers to a saved name. Every word of the
 * shorter side must appear in the longer one, so "Chidi" finds "Chidi Eze" and
 * "IBRAHIM MUSA ABDULLAHI" finds "Musa Ibrahim", but "AMAKA EZE" never finds
 * "Chidi Eze". Small typos in longer words are tolerated.
 */
export function receiptNameMatches(given: string | null, saved: string | null) {
  const a = words(given)
  const b = words(saved)
  if (!a.length || !b.length) return false
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return short.every((word) => long.some((other) => sameWord(word, other)))
}

/** Account-number evidence: visible prefix and suffix digits around a mask. */
function printedDigits(value: string | null) {
  const raw = value?.trim() ?? ""
  if (!raw) return null
  const masked = /[*x•#X]/.test(raw)
  if (!masked) {
    const digits = raw.replace(/\D/g, "")
    return digits.length >= 4
      ? { prefix: "", suffix: digits, whole: digits.length >= 10 }
      : null
  }
  const [head = "", ...rest] = raw.split(/[*x•#X]+/)
  const prefix = head.replace(/\D/g, "")
  const suffix = rest.join("").replace(/\D/g, "")
  return prefix.length + suffix.length >= 4
    ? { prefix, suffix, whole: false }
    : null
}

/** The one business account the printed side names, or none. Never guesses between two. */
export function matchReceiptAccount(
  side: { account: string | null; name: string | null; bank: string | null },
  accounts: ReceiptAccount[],
): ReceiptAccount | null {
  const printed = printedDigits(side.account)
  const bankAgrees = (account: ReceiptAccount) =>
    !side.bank ||
    !account.bankName ||
    words(side.bank).some((word) =>
      words(account.bankName).some((other) => sameWord(word, other)),
    )
  if (printed) {
    const byNumber = accounts.filter((account) => {
      const digits = account.bankAccountNumber?.replace(/\D/g, "") ?? ""
      if (digits.length < 4) return false
      return printed.whole
        ? digits === printed.suffix
        : digits.startsWith(printed.prefix) && digits.endsWith(printed.suffix)
    })
    const narrowed =
      byNumber.length > 1
        ? byNumber.filter(
            (account) =>
              bankAgrees(account) &&
              (!side.name ||
                receiptNameMatches(
                  side.name,
                  account.bankAccountHolder ?? account.name,
                )),
          )
        : byNumber
    if (narrowed.length === 1) return narrowed[0] ?? null
    if (byNumber.length) return null
  }
  // No number on file or printed: a saved holder name plus an agreeing bank.
  const byHolder = accounts.filter(
    (account) =>
      account.bankAccountHolder &&
      receiptNameMatches(side.name, account.bankAccountHolder) &&
      words(side.name).length >= 2 &&
      bankAgrees(account) &&
      (!printed || !account.bankAccountNumber),
  )
  return byHolder.length === 1 ? (byHolder[0] ?? null) : null
}

const ORDER_NUMBER = /\b([A-Z]{1,4}-?\d{3,8})\b/gi

/** Owing orders a free-text name or order number points to. */
export function receiptOrdersFor(
  text: string | null,
  orders: ReceiptOrder[],
  mode: "number" | "name",
): ReceiptOrder[] {
  if (!text?.trim()) return []
  if (mode === "number") {
    const numbers = new Set(
      [...text.matchAll(ORDER_NUMBER)].map((match) =>
        (match[1] ?? "").replace("-", "").toUpperCase(),
      ),
    )
    return orders.filter((order) =>
      numbers.has(order.orderNumber.replace("-", "").toUpperCase()),
    )
  }
  const named = orders.filter((order) =>
    receiptNameMatches(text, order.customerName),
  )
  if (named.length) return named
  // A remark like "for Funmi Bello order" or "chidi balance": try each 1–3 word window.
  const tokens = words(text)
  const found = new Map<string, ReceiptOrder>()
  for (let size = Math.min(3, tokens.length); size >= 1 && !found.size; size--)
    for (let start = 0; start + size <= tokens.length; start++) {
      const window = tokens.slice(start, start + size)
      if (window.every((word) => FILLER.has(word))) continue
      for (const order of orders)
        if (
          window.length >= Math.min(2, words(order.customerName).length) &&
          window.every((word) =>
            words(order.customerName).some((other) => sameWord(word, other)),
          )
        )
          found.set(order.id, order)
    }
  return [...found.values()]
}
const FILLER = new Set(
  "for the order payment pay paid balance part of from to by and goods money transfer trf ft bal deposit".split(
    " ",
  ),
)

/** Same customer, several orders: the one whose balance equals the amount, else the oldest owing. */
function pickOrder(orders: ReceiptOrder[], amountMinor: number) {
  const customers = new Set(
    orders.map(
      (order) => order.customerId ?? words(order.customerName).join(" "),
    ),
  )
  if (customers.size !== 1) return null
  const exact = orders.filter((order) => order.balanceMinor === amountMinor)
  if (exact.length === 1) return exact[0] ?? null
  return orders.length === 1 ? (orders[0] ?? null) : null
}

const WITHDRAWAL =
  /\b(?:personal(?: use)?|self|upkeep|family|private|for me|my use|house ?keeping|pocket money|owner(?:'s)? (?:use|withdrawal|drawings?)|drawings?)\b/i
const EXPENSE_WORDS: [string, RegExp][] = [
  [
    "Transport",
    /\b(?:transport|delivery|logistics|dispatch|okada|keke|uber|bolt|fare|carriage|loading|offloading)\b/i,
  ],
  ["Generator fuel", /\b(?:fuel|diesel|petrol|pms|generator|gen)\b/i],
  ["Rent", /\b(?:rent|shop rent)\b/i],
  ["Salaries", /\b(?:salary|salaries|wages?|staff pay)\b/i],
  ["Packaging", /\b(?:packaging|nylons?|cartons?|bags? for packing)\b/i],
  ["Market levy", /\b(?:levy|market ticket|tax ticket|union dues?)\b/i],
  ["Electricity", /\b(?:electricity|nepa|phcn|prepaid meter|light bill)\b/i],
  ["Repairs", /\b(?:repairs?|mechanic|fix(?:ing)?)\b/i],
  ["Airtime and data", /\b(?:airtime|data|recharge)\b/i],
]

/** What money out was for, from the remark or caption. Existing category names win. */
export function receiptPurpose(
  text: string | null,
  categoryNames: string[],
): ReceiptPurpose | null {
  if (!text?.trim()) return null
  if (WITHDRAWAL.test(text)) return { type: "owner_withdrawal" }
  const saved = categoryNames.find(
    (name) =>
      words(name).length > 0 &&
      words(name).every((word) =>
        words(text).some((other) => sameWord(word, other)),
      ),
  )
  if (saved) return { type: "expense", categoryName: saved }
  const known = EXPENSE_WORDS.find(([, pattern]) => pattern.test(text))
  if (!known) return null
  const existing = categoryNames.find(
    (name) => name.toLowerCase() === known[0].toLowerCase(),
  )
  return { type: "expense", categoryName: existing ?? known[0] }
}

export function matchReceipt(input: {
  facts: ReceiptFacts
  accounts: ReceiptAccount[]
  orders: ReceiptOrder[]
  categoryNames: string[]
}): ReceiptOutcome {
  const { facts, accounts, orders } = input
  const amount = facts.amountMinor
  if (!amount || amount <= 0) return { kind: "unreadable" }
  const to = matchReceiptAccount(
    {
      account: facts.recipientAccount,
      name: facts.recipientName,
      bank: facts.recipientBank,
    },
    accounts,
  )
  const from = matchReceiptAccount(
    {
      account: facts.senderAccount,
      name: facts.senderName,
      bank: facts.senderBank,
    },
    accounts,
  )
  if (to && from && to.id !== from.id) return { kind: "own_transfer", from, to }
  if (from && !to)
    return {
      kind: "money_out",
      account: from,
      purpose: receiptPurpose(
        [facts.narration, facts.caption].filter(Boolean).join(" · ") || null,
        input.categoryNames,
      ),
    }
  if (!to) return { kind: "unknown_account" }
  return matchReceiptOrder({ account: to, amountMinor: amount, facts, orders })
}

/** Money in: order number, then remark, caption, then the sender's name. */
export function matchReceiptOrder(input: {
  account: ReceiptAccount
  amountMinor: number
  facts: Pick<ReceiptFacts, "narration" | "caption" | "senderName">
  orders: ReceiptOrder[]
  typed?: string
}): ReceiptOutcome {
  const { account, amountMinor, facts, orders } = input
  const sources: [ReceiptMatchReason, string | null, "number" | "name"][] =
    input.typed !== undefined
      ? [
          ["typed", input.typed, "number"],
          ["typed", input.typed, "name"],
        ]
      : [
          ["order_number", facts.narration, "number"],
          ["order_number", facts.caption, "number"],
          ["remark", facts.narration, "name"],
          ["caption", facts.caption, "name"],
          ["sender", facts.senderName, "name"],
        ]
  for (const [reason, text, mode] of sources) {
    const found = receiptOrdersFor(text, orders, mode)
    if (!found.length) continue
    const order = pickOrder(found, amountMinor)
    if (!order)
      return { kind: "choose_order", account, orders: found.slice(0, 9) }
    const applied = Math.min(amountMinor, order.balanceMinor)
    return {
      kind: "order_payment",
      account,
      order,
      amountMinor: applied,
      excessMinor: amountMinor - applied,
      reason,
    }
  }
  return { kind: "ask_order", account }
}
