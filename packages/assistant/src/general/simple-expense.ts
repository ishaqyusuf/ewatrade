import { z } from "zod"
import { moneyInFactsFromText } from "./simple-money-in"
export const simpleExpenseAction = z
  .object({
    action: z.literal("expense_record_simple"),
    amountMinor: z
      .number()
      .int()
      .positive()
      .max(100_000_000_000_000)
      .optional(),
    description: z.string().trim().min(1).max(200).optional(),
    accountName: z.string().trim().min(1).max(160).optional(),
    moneyAccountId: z.string().trim().min(1).max(128).optional(),
    expenseCategoryId: z.string().trim().min(1).max(128).optional(),
    categoryName: z.string().trim().min(1).max(160).optional(),
    payeeName: z.string().trim().min(1).max(160).optional(),
    paid: z.boolean().optional(),
    effectiveAt: z.iso.datetime().optional(),
    attachmentIds: z.array(z.string().min(1).max(128)).max(7).default([]),
    bookId: z.string().trim().min(1).max(128).optional(),
  })
  .strict()
export type SimpleExpense = z.infer<typeof simpleExpenseAction>
export function simpleExpenseStep(input: SimpleExpense) {
  if (input.amountMinor === undefined) return "amount"
  if (!input.description) return "description"
  if (input.paid === undefined) return "paid"
  if (input.paid && !input.moneyAccountId) return "account"
  if (!input.expenseCategoryId || !input.bookId) return "category"
  return "review"
}
export function isSimpleExpenseIntent(text: string) {
  if (
    /\b(?:part paid|partially paid|partial payment|remaining|balance)\b/i.test(
      text,
    ) ||
    [...text.matchAll(/\b(?:spent|expense|paid|total|amount)\s*[₦N]?\s*\d/gi)]
      .length > 1
  )
    return false
  if (/^\s*(?:spend|pay)\b/i.test(text)) return false
  if (
    /\b(?:will spend|want to spend|need to spend|plan to|planning to|going to spend|budget|existing bill|pay (?:the |this |an? )?bill|supplier invoice|stock receipt|inventory purchase|loan|refund|transfer between|owner withdrawal)\b/i.test(
      text,
    )
  )
    return false
  return /\b(?:spent|spend|expense|expenses|paid .+ for|cost .+ from)\b/i.test(
    text,
  )
}
export function expenseFactsFromText(text: string): Partial<SimpleExpense> {
  const facts: Partial<SimpleExpense> = {}
  const amount = text.match(
    /(?:^|\b(?:spent|spend|paid|expense|expenses|cost|amount))(?:\s+(?:is|to))?\s*[:=]?\s*[₦N]?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?(?:\s*(?:k|thousand|m|million))?)(?![\d.\p{L}]|,\d)/iu,
  )?.[1]
  if (amount)
    facts.amountMinor = moneyInFactsFromText(`amount ${amount}`).amountMinor
  const description =
    text
      .match(
        /\b(?:on|for)\s+([\p{L}][\p{L}\p{N} .’'-]*?)(?=\s+(?:from|using|via|today|yesterday|on|paid|unpaid|to|category)\b|[,;.!?\n]|$)/iu,
      )?.[1]
      ?.trim() ??
    text.match(/^(?:description|purpose)(?: is|:)?\s+(.+)$/i)?.[1]?.trim()
  if (description) facts.description = description
  const account =
    text
      .match(
        /\b(?:from|using|via)\s+([\p{L}][\p{L}\p{N} .’'-]*?)(?=\s+(?:today|yesterday|on|for|to|category)\b|[,;.!?\n]|$)/iu,
      )?.[1]
      ?.trim()
      .replace(/\s+account$/i, "") ??
    text.match(/^account(?: is|:)?\s+(.+)$/i)?.[1]?.trim()
  if (account) facts.accountName = account
  if (
    /\b(?:unpaid|not paid|haven't paid|have not paid|still owed|on credit)\b/i.test(
      text,
    )
  )
    facts.paid = false
  else if (
    /\b(?:spent|already paid|paid)\b/i.test(text) ||
    /^paid[.!]?$/i.test(text)
  )
    facts.paid = true
  const category = text
    .match(/\bcategory(?: is|:)?\s+([^,;.!?\n]+)$/i)?.[1]
    ?.trim()
  if (category) facts.categoryName = category
  const payee = text.match(/\bpayee(?: is|:)?\s+([^,;.!?\n]+)$/i)?.[1]?.trim()
  if (payee) facts.payeeName = payee
  const date = moneyInFactsFromText(text).effectiveAt
  if (date) facts.effectiveAt = date
  return facts
}
