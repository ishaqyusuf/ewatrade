import { generalMoney } from "@ewatrade/assistant/general/contracts"
import {
  generalPendingQuoteApprovalsInput,
  generalQuoteApprovalReadInput,
  quoteApprovalTargetSchema,
} from "@ewatrade/assistant/general/quote-reads"
import {
  getCommerceQuoteApprovalReadOnlyInTransaction,
  listPendingCommerceQuoteApprovalsReadOnlyInTransaction,
} from "@ewatrade/db/queries"
import type { Prisma } from "@ewatrade/db/types"
import { requireGeneralScope, type GeneralContext } from "./general-context"

async function read<T>(
  ctx: GeneralContext,
  operation: (
    tx: Prisma.TransactionClient,
    scope: { actorUserId: string; storeId: string; tenantId: string },
  ) => Promise<T>,
) {
  const scope = requireGeneralScope(ctx)
  return ctx.db.$transaction(
    (tx) =>
      operation(tx, {
        actorUserId: scope.userId,
        storeId: scope.storeId,
        tenantId: scope.tenantId,
      }),
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}

export function readGeneralQuoteApproval(ctx: GeneralContext, raw: unknown) {
  const input = generalQuoteApprovalReadInput.parse(raw)
  return read(ctx, (tx, scope) =>
    getCommerceQuoteApprovalReadOnlyInTransaction(tx, { ...input, ...scope }),
  )
}

export function readGeneralPendingQuoteApprovals(
  ctx: GeneralContext,
  raw: unknown,
) {
  const input = generalPendingQuoteApprovalsInput.parse(raw)
  return read(ctx, (tx, scope) =>
    listPendingCommerceQuoteApprovalsReadOnlyInTransaction(tx, {
      ...input,
      ...scope,
    }),
  )
}

type Detail = Awaited<
  ReturnType<typeof getCommerceQuoteApprovalReadOnlyInTransaction>
>

/** Central saved-answer target registration is part of the root handoff. */
export function generalQuoteApprovalAnswer(detail: Detail, storeName: string) {
  return {
    id: `quote_approval_${crypto.randomUUID()}`,
    title: `Quotation version ${detail.version}`,
    value: generalMoney(detail.totalMinor, detail.currencyCode),
    scope: storeName.slice(0, 300),
    asOf: new Date().toISOString(),
    detail: `Stored decision: ${detail.status}. ${detail.currentReview.reason ?? (detail.actions.canApprove ? "Currently eligible for a separate native approval review." : "Current actor cannot approve this version.")} This read changes no decision and releases no quotation.`,
    target: quoteApprovalTargetSchema.parse({
      kind: "commerce_quote_approval",
      approvalId: detail.id,
      quoteId: detail.quoteId,
      quoteVersionId: detail.quoteVersionId,
    }),
  }
}
