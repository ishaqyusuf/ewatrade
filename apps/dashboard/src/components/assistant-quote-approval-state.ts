import {
  type QuoteApprovalTarget,
  quoteApprovalTargetSchema,
} from "@ewatrade/assistant/general/quote-reads"

export function parseAssistantQuoteApproval(raw: string | null) {
  if (raw === null) return null
  try {
    const parsed = quoteApprovalTargetSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function assistantQuoteApprovalOpenParams(target: QuoteApprovalTarget) {
  return {
    assistantQuoteApproval: JSON.stringify(
      quoteApprovalTargetSchema.parse(target),
    ),
  }
}

export const assistantQuoteApprovalCloseParams = {
  assistantQuoteApproval: null,
} as const

/** Cached facts cannot stand in for a current original-tuple authorization read. */
export function assistantQuoteApprovalReadState(
  target: QuoteApprovalTarget,
  query: {
    isPending: boolean
    isFetching: boolean
    isPaused: boolean
    isError: boolean
    isSuccess: boolean
    isFetchedAfterMount: boolean
    data?: { id: string; quoteId: string; quoteVersionId: string }
  },
) {
  if (query.isPending || query.isFetching || query.isPaused)
    return "loading" as const
  if (query.isError) return "unavailable" as const
  if (!query.isFetchedAfterMount) return "loading" as const
  if (
    !query.isSuccess ||
    !query.data ||
    query.data.id !== target.approvalId ||
    query.data.quoteId !== target.quoteId ||
    query.data.quoteVersionId !== target.quoteVersionId
  ) {
    return "unavailable" as const
  }
  return "ready" as const
}
