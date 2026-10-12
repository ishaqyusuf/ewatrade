import { z } from "zod"

const id = z.string().trim().min(1).max(160)

/** Original decision/version identity. Scope and actor always come from auth. */
export const generalQuoteApprovalReadInput = z
  .object({ approvalId: id, quoteId: id, quoteVersionId: id })
  .strict()

/** Fixed ten-candidate scan; keep the returned cursor even for an empty page. */
export const generalPendingQuoteApprovalsInput = z
  .object({ cursor: id.optional() })
  .strict()

export const quoteApprovalTargetSchema = generalQuoteApprovalReadInput
  .extend({ kind: z.literal("commerce_quote_approval") })
  .strict()

export type QuoteApprovalTarget = z.infer<typeof quoteApprovalTargetSchema>
