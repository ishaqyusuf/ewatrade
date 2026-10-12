import { z } from "zod"

const id = z.string().trim().min(1).max(128)
export const cashCountAction = z
  .object({
    action: z.literal("cash_count_record"),
    bookId: id,
    accountId: id,
    asOf: z.iso.datetime(),
    observedBalanceMinor: z
      .string()
      .regex(/^(0|[1-9]\d{0,18})$/)
      .refine(
        (value) =>
          /^(0|[1-9]\d{0,18})$/.test(value) &&
          BigInt(value) <= 9223372036854775807n,
        "Count exceeds the cash-count storage limit.",
      ),
    reference: z.string().trim().min(1).max(200),
    cashPhysicallyCounted: z.literal(true),
  })
  .strict()
export type GeneralCashCountAction = z.infer<typeof cashCountAction>
export const generalCashCountLookupInput = z
  .object({
    bookId: id,
    search: z.string().trim().max(160).optional(),
    afterCode: z
      .string()
      .regex(/^[A-Z0-9_-]{1,32}$/i)
      .optional(),
  })
  .strict()
export const generalCashCountReadInput = z
  .object({ bookId: id, countId: id })
  .strict()
export const generalDayCloseInput = z
  .object({
    bookId: id,
    through: z.iso
      .datetime()
      .refine(
        (value) => value.endsWith("T23:59:59.999Z"),
        "Choose an exact completed UTC day cutoff.",
      ),
  })
  .strict()
export const generalCashCountHistoryInput = z
  .object({
    bookId: id,
    accountId: id.optional(),
    cursor: id.optional(),
  })
  .strict()
export const cashCountDraftInstructions =
  "Resolve the current Finance Book and active cash account by name/code before drafting. Ask for an exact count time, physically observed cash amount (zero is valid) and reference. Never infer observed cash from the ledger. Record only an observation; do not adjust variance or close a fiscal period. Show the original count and its variance separately from later review status. Day-close readiness is an advisory canonical checklist for a completed UTC cutoff; unresolved reviews and coverage gaps remain blockers for assistant close. Inventory closeout is a separate stock workflow."
