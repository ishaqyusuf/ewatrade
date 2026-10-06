import { z } from "zod"
import { financeBookSchema } from "./finance"

const id = z.string().trim().min(1).max(128)
const revision = z.string().regex(/^(0|[1-9]\d{0,18})$/)
const signed = z.string().regex(/^(0|-?[1-9]\d{0,18})$/)
export const financeBankStatementImportSchema = financeBookSchema
  .extend({
    accountId: id,
    clientCommandId: id,
    expectedRevision: revision,
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
    reference: z.string().trim().min(1).max(160),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    openingBalanceMinor: signed,
    closingBalanceMinor: signed,
    csv: z.string().min(1).max(524288),
    columns: z
      .object({ transactionId: id, date: id, amount: id, description: id })
      .strict(),
    units: z.enum(["MINOR", "MAJOR"]),
  })
  .strict()
export const financeBankStatementSchema = financeBookSchema
  .extend({ statementId: id })
  .strict()
export const financeBankStatementsSchema = financeBookSchema
  .extend({
    accountId: id.optional(),
    cursor: id.optional(),
    limit: z.number().int().min(1).max(50).default(30),
  })
  .strict()
const review = financeBookSchema.extend({
  accountId: id,
  clientCommandId: id,
  expectedRevision: revision,
  expectedSnapshotSequence: revision,
  reason: z.string().trim().min(1).max(400),
})
export const financeBankMatchSchema = review
  .extend({
    bankRowIds: z.array(id).min(1).max(50),
    journalLineIds: z.array(id).min(1).max(50),
  })
  .strict()
export const financeBankUnmatchSchema = review.extend({ matchId: id }).strict()
export const financeBankMatchHistorySchema = financeBookSchema
  .extend({
    accountId: id,
    cursor: revision.optional(),
    snapshotRevision: revision.optional(),
    limit: z.number().int().min(1).max(50).default(30),
  })
  .strict()

export const financeBankCorrectionSourceSchema = financeBookSchema
  .extend({ accountId: id, entryId: id })
  .strict()
