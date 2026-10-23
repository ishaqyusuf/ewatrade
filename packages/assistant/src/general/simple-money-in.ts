import { z } from "zod"
import { collectedDetailsText } from "./collected-details"
import { saleFactsFromText } from "./simple-sale"
export const simpleMoneyInAction = z
  .object({
    action: z.literal("money_in_record"),
    amountMinor: z
      .number()
      .int()
      .positive()
      .max(100_000_000_000_000)
      .optional(),
    accountName: z.string().trim().min(1).max(200).optional(),
    moneyAccountId: z.string().trim().min(1).max(128).optional(),
    createAccount: z.boolean().default(false),
    effectiveAt: z.iso.datetime().optional(),
    description: z.string().trim().max(400).default(""),
    attachmentIds: z.array(z.string().min(1).max(128)).max(7).default([]),
  })
  .strict()
export type SimpleMoneyIn = z.infer<typeof simpleMoneyInAction>
export function simpleMoneyInStep(input: SimpleMoneyIn) {
  if (input.amountMinor === undefined) return "amount"
  if (!input.moneyAccountId && !(input.createAccount && input.accountName))
    return "account"
  return "review"
}
export function isSimpleMoneyInIntent(text: string) {
  if (
    /\b(?:customer deposit|loan|borrow|refund|expense|opening balance|transfer between|from .* to |withdraw|take money out)\b/i.test(
      text,
    )
  )
    return false
  if (
    /\b(?:sale|sales|order)\b/i.test(text) &&
    !/\b(?:no sale|not a sale|without (?:creating )?(?:a )?sale|no order)\b/i.test(
      text,
    )
  )
    return false
  return (
    /\b(?:put|drop|add|deposit)\b[\s\S]*\b(?:into|to|in)\b/i.test(text) ||
    /\b(?:owner contribution|owner funds|capital contribution)\b/i.test(text)
  )
}
export function moneyInFactsFromText(input: string): Partial<SimpleMoneyIn> {
  const text = collectedDetailsText(input)
  const facts: Partial<SimpleMoneyIn> = {}
  const amount = text.match(
    /(?:^|\b(?:put|drop|add|deposit|amount|contribution|received|money))(?:\s+(?:is|to))?\s*[:=]?\s*[₦N]?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?(?:\s*(?:k|thousand|m|million))?)(?![\d.\p{L}]|,\d)/iu,
  )?.[1]
  if (amount)
    facts.amountMinor = saleFactsFromText(`amount ${amount}`).receivedMinor
  const name =
    text
      .match(
        /\b(?:into|to|in)\s+([\p{L}][\p{L}\p{N} .’'-]*?)(?=\s+(?:today|yesterday|on|by|with|at|from)\b|[,;.!?\n]|$)/iu,
      )?.[1]
      ?.trim()
      .replace(/\s+account$/i, "") ??
    text
      .match(/^account(?: is|:)?\s+([\p{L}][\p{L}\p{N} .’'-]*)$/imu)?.[1]
      ?.trim()
  if (name) facts.accountName = name
  const note = text.match(/\b(?:description|note)\s*:\s*([^\n]+)/i)?.[1]?.trim()
  if (note) facts.description = note
  if (
    /^(?:no description|clear (?:the )?(?:description|note))\.?$/i.test(
      text.trim(),
    )
  )
    facts.description = ""
  const date = text.match(
    /\b(?:on|date(?: is|:)?)\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))/i,
  )?.[1]
  if (date) facts.effectiveAt = date
  return facts
}
