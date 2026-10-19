import { createHash } from "node:crypto"
import { quoteIssueIntent } from "@ewatrade/assistant/general/quote-issue-intent"
import type { CommerceQuoteIssueReviewInput } from "@ewatrade/db/commerce-quote-issue-review"

export type QuoteIssueProposalIdentity = {
  /** Allocated by the authenticated proposal owner, before preparation/signing. */
  clientOperationId: string
  /** Loaded from the exact canonical source Quote, never from editable intent. */
  existingClientQuoteId?: string
}

function identity(value: string) {
  if (!value || value !== value.trim() || value.length > 191)
    throw new Error("Keep the server-owned quotation operation identity.")
  return value
}

/** Pure construction only; the caller still owes authenticated source review. */
export function generalQuoteIssueNativeInput(
  raw: unknown,
  scope: { actorUserId: string; tenantId: string; storeId: string },
  command: QuoteIssueProposalIdentity,
): CommerceQuoteIssueReviewInput {
  const input = quoteIssueIntent.parse(raw)
  const serverScope = {
    actorUserId: identity(scope.actorUserId),
    tenantId: identity(scope.tenantId),
    storeId: identity(scope.storeId),
  }
  const operationId = identity(command.clientOperationId)
  const commandDigest = createHash("sha256")
    .update(
      JSON.stringify({
        version: "assistant_quote_command:v1",
        ...serverScope,
        source: input.source,
        operationId,
      }),
    )
    .digest("hex")
  const clientVersionId = `assistant_quote_version_${commandDigest}`
  const clientQuoteId =
    input.operation.kind === "revise"
      ? identity(command.existingClientQuoteId ?? "")
      : `assistant_quote_${commandDigest}`
  return {
    ...serverScope,
    sourceId: input.source.id,
    sourceType: input.source.kind,
    operation: input.operation,
    clientQuoteId,
    clientVersionId,
    ...(input.expiresAt ? { expiresAt: new Date(input.expiresAt) } : {}),
    options: input.options.map((option, index) => ({
      ...option,
      clientOptionId: `${clientVersionId}:option:${index}`,
    })),
  }
}
