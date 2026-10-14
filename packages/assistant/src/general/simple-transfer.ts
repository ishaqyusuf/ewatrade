import { z } from "zod"
import { saleFactsFromText } from "./simple-sale"
const name = z.string().trim().min(1).max(200)
const id = z.string().trim().min(1).max(128)
export const simpleTransferAction = z
  .object({
    action: z.literal("money_transfer_simple"),
    amountMinor: z
      .number()
      .int()
      .positive()
      .max(100_000_000_000_000)
      .optional(),
    fromAccountName: name.optional(),
    fromMoneyAccountId: id.optional(),
    toAccountName: name.optional(),
    toMoneyAccountId: id.optional(),
    newToAccount: z
      .object({ name, kind: z.enum(["CASH", "BANK", "CLEARING"]) })
      .strict()
      .optional(),
    note: z.string().trim().max(400).default(""),
    effectiveAt: z.iso.datetime().optional(),
    attachmentIds: z.array(id).max(7).default([]),
    bookId: id.optional(),
  })
  .strict()
export type SimpleTransfer = z.infer<typeof simpleTransferAction>
export function simpleTransferStep(input: SimpleTransfer) {
  if (input.amountMinor === undefined) return "amount"
  if (!input.fromMoneyAccountId) return "from"
  if (!input.toMoneyAccountId && !input.newToAccount) return "to"
  return "review"
}
export function isSimpleTransferIntent(text: string) {
  if (
    /\b(?:stock|inventory|product|loan|refund|sale|order|expense|supplier|fees?|charges?|conversion|exchange|will|tomorrow|planning|schedule)\b/i.test(
      text,
    )
  )
    return false
  return /^(?:please\s+)?(?:move|moved|transfer|transferred|record (?:a )?transfer|money transfer)\b/i.test(
    text.trim(),
  )
}
export function transferFactsFromText(text: string): Partial<SimpleTransfer> {
  const facts: Partial<SimpleTransfer> = {}
  const amount = text.match(
    /(?:^|\b(?:move|moved|transfer|transferred|amount))\s*[:=]?\s*[₦N]?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?(?:\s*(?:k|thousand|m|million))?)(?![\d.\p{L}]|,\d)/iu,
  )?.[1]
  if (amount)
    facts.amountMinor = saleFactsFromText(`amount ${amount}`).receivedMinor
  for (const [word, field] of [
    ["from", "fromAccountName"],
    ["to", "toAccountName"],
  ] as const) {
    const match = text
      .match(
        new RegExp(
          `\\b${word}\\s+([\\p{L}][\\p{L}\\p{N} .’'-]*?)(?=\\s+(?:from|to|today|yesterday|on|by|with|at|note)\\b|[,;.!?\\n]|$)`,
          "iu",
        ),
      )?.[1]
      ?.trim()
      .replace(/\s+account$/i, "")
    if (match) facts[field] = match
  }
  const note = text.match(/\bnote\s*:\s*([^\n]+)/i)?.[1]?.trim()
  if (note) facts.note = note
  if (/^(?:no note|clear (?:the )?note)\.?$/i.test(text.trim())) facts.note = ""
  const date = text.match(
    /\b(?:on|date(?: is|:)?)\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))/i,
  )?.[1]
  if (date) facts.effectiveAt = date
  return facts
}
