import { z } from "zod"
import { statedAmountToMinor } from "./stated-money"

const name = z.string().trim().min(1).max(160)
const id = z.string().min(1).max(128)
const money = z.number().int().positive().max(100_000_000)
/** Incomplete drafts are intentional. No monetary effect until confirmation. */
export const simpleSaleAction = z
  .object({
    action: z.literal("sale_record"),
    accountName: name.optional(),
    moneyAccountId: id.optional(),
    createAccount: z.boolean().default(false),
    method: z.enum(["cash", "bank_transfer"]).default("bank_transfer"),
    customerName: name.optional(),
    customerId: id.optional(),
    customerChoice: z.enum(["new", "walk_in"]).optional(),
    receivedMinor: money.optional(),
    totalMinor: money.optional(),
    partial: z.boolean().default(false),
    description: z.string().trim().max(200).optional(),
    attachmentIds: z.array(id).max(7).default([]),
  })
  .strict()
export type SimpleSale = z.infer<typeof simpleSaleAction>
export function simpleSaleStep(sale: SimpleSale) {
  if (sale.receivedMinor === undefined) return "received"
  if (!sale.moneyAccountId && !(sale.accountName && sale.createAccount))
    return "account"
  if (sale.customerName && !sale.customerId && !sale.customerChoice)
    return "customer"
  if (sale.customerChoice === "new" && !sale.customerName) return "customer"
  if (sale.partial && sale.totalMinor === undefined) return "total"
  return "review"
}
export const simpleSaleQuestions = {
  account: "Where do you want to record this?",
  customer: "Who is this sale for?",
  received: "How much?",
  total: "What is the full sale total?",
  review: "Review the sale, then save it.",
} as const
export function normalizedSaleName(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "")
}
/** Bounded edit distance plus token/reordered-name matching; suggestions only. */
export function similarSaleNames<T extends { name: string }>(
  query: string,
  rows: T[],
) {
  const needle = normalizedSaleName(query)
  if (!needle) return []
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  return rows
    .map((row) => {
      const value = normalizedSaleName(row.name)
      let previous = Array.from({ length: value.length + 1 }, (_, i) => i)
      for (let i = 1; i <= needle.length; i++) {
        const current = [i]
        for (let j = 1; j <= value.length; j++)
          current[j] = Math.min(
            (current[j - 1] ?? 0) + 1,
            (previous[j] ?? 0) + 1,
            (previous[j - 1] ?? 0) + (needle[i - 1] === value[j - 1] ? 0 : 1),
          )
        previous = current
      }
      const distance = previous[value.length] ?? 999
      const tokenMatch = tokens.every((token) =>
        row.name.toLowerCase().includes(token),
      )
      const score = value === needle ? 0 : tokenMatch ? 1 : distance + 1
      return {
        row,
        score,
        match:
          tokenMatch ||
          value.includes(needle) ||
          needle.includes(value) ||
          distance <= Math.max(2, Math.floor(needle.length * 0.25)),
      }
    })
    .filter((item) => item.match)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((item) => item.row)
}
/** Explicit non-sale money requests belong to their finance workflow, even with an open sale draft. */
export function isNonSaleMoneyIntent(text: string) {
  return (
    /\b(?:owner contribution|owner funds|capital contribution|transfer between accounts|customer deposit|opening balance)\b/i.test(
      text,
    ) ||
    /\b(?:no|not(?: a)?|without(?: (?:creating|recording))?(?: (?:a|an|any))?|do not (?:create|record)(?: (?:a|an))?)\s+(?:sales?|order)\b/i.test(
      text,
    )
  )
}
export function isSimpleSaleIntent(text: string) {
  return (
    !isNonSaleMoneyIntent(text) &&
    /\b(?:sales?|(?:new )?order|part(?:ly)?[ -]?paid|partial payment)\b/i.test(
      text,
    ) &&
    !/\b(?:report|summary|how many|how much.*sales|show|find|list|status|edit|replace|delete|cancel|refund|expense|transfer between)\b/i.test(
      text,
    )
  )
}
const amountPattern =
  "(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?(?:[ \t]*(?:k|thousand|m|million))?"
function textAmount(value: string) {
  const unit = value.match(/(?:k|thousand|m|million)$/i)?.[0]?.toLowerCase()
  const base = Number(
    statedAmountToMinor(value.replace(/[ \t]*(?:k|thousand|m|million)$/i, "")),
  )
  return (
    base * (unit === "k" || unit === "thousand" ? 1000 : unit ? 1000000 : 1)
  )
}
/** Reads owner text only; never takes file bytes or extraction. */
export function saleFactsFromText(text: string): Partial<SimpleSale> {
  const facts: Partial<SimpleSale> = {}
  if (/\bfully paid\b/i.test(text)) facts.partial = false
  if (/\bpart(?:ly)?[ -]?paid|\bpartial payment/i.test(text))
    facts.partial = true
  const account =
    text
      .match(
        /\b(?:to|into|in)\s+([\p{L}][\p{L}\p{N} .’'-]*?)\s+account(?=\s|[,;]|$)/iu,
      )?.[1]
      ?.trim() ??
    text
      .match(
        /\baccount(?: is|:)\s*([\p{L}][\p{L}\p{N} .’'-]*?)(?=[,;\n]|$)/iu,
      )?.[1]
      ?.trim() ??
    text
      .match(
        /\b(?:paid|transfer(?:red)?) (?:to|into)\s+([\p{L}][\p{L}\p{N} .’'-]*?)(?=\s+(?:by|for|total|customer)\b|[,;\n]|$)/iu,
      )?.[1]
      ?.trim()
  if (account) facts.accountName = account
  const customer = text
    .match(
      /\b(?:paid by|by|sale(?:s)? for|customer(?: is|:)?)[ \t]+([\p{L}][\p{L} .'’-]*?)(?=\s+(?:paid|total|transfer|into|to|received|amount)\b|[,;\n]|$)/iu,
    )?.[1]
    ?.trim()
  if (customer) facts.customerName = customer
  if (/\bkobo\b/i.test(text)) return facts
  const total = text.match(
    new RegExp(
      `\\btotal(?:\\s+is)?\\s*[:=]?\\s*[₦N]?\\s*(${amountPattern})(?![\\d.\\p{L}]|,\\d)`,
      "iu",
    ),
  )?.[1]
  if (total) facts.totalMinor = textAmount(total)
  else if (/\btotal\b/i.test(text)) facts.partial = true
  const withoutTotal = text.replace(
    new RegExp(
      `\\btotal(?:\\s+is)?\\s*[:=]?\\s*[₦N]?\\s*${amountPattern}(?![\\d.\\p{L}]|,\\d)`,
      "igu",
    ),
    "",
  )
  const explicitPaid = withoutTotal.match(
    new RegExp(
      `\\b(?:paid|received|amount)(?:\\s+is)?\\s*[:=]?\\s*[₦N]?\\s*(${amountPattern})(?![\\d.\\p{L}]|,\\d)`,
      "iu",
    ),
  )?.[1]
  const orderAmount = withoutTotal.match(
    new RegExp(
      `\\b(?:sales?|order)(?:\\s+is)?\\s*[:=]?\\s*[₦N]?\\s*(${amountPattern})(?![\\d.\\p{L}]|,\\d)`,
      "iu",
    ),
  )?.[1]
  const bareAmount = withoutTotal.match(
    new RegExp(`^\\s*[₦N]?\\s*(${amountPattern})(?![\\d.\\p{L}]|,\\d)`, "i"),
  )?.[1]
  const paid = explicitPaid ?? orderAmount ?? bareAmount
  if (facts.partial && explicitPaid && orderAmount && !total)
    facts.totalMinor = textAmount(orderAmount)
  if (paid) facts.receivedMinor = textAmount(paid)
  if (
    facts.totalMinor !== undefined &&
    facts.receivedMinor !== undefined &&
    facts.totalMinor > facts.receivedMinor
  )
    facts.partial = true
  if (/^\s*walk[ -]?in\s*$/i.test(text)) {
    facts.customerChoice = "walk_in"
    facts.customerName = undefined
    facts.customerId = undefined
  }
  return facts
}
