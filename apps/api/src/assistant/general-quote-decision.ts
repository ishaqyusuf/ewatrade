import { generalMoney } from "@ewatrade/assistant/general/contracts"
import {
  type QuoteDecisionAction,
  quoteDecisionAction,
  quoteDecisionReceipt,
} from "@ewatrade/assistant/general/quote-decision"
import { prepareReviewedQuoteDecisionInTransaction } from "@ewatrade/db/commerce-quote-decision-review"
import {
  CommerceQuoteError,
  ServiceCommercePolicyError,
  ServiceCommerceQuoteReleaseError,
  StoreConversationError,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import type { GeneralTransactionContext } from "./general-actions"
import { requireGeneralScope, type GeneralContext } from "./general-context"

async function operation<T>(run: () => Promise<T>) {
  try {
    return await run()
  } catch (error) {
    if (error instanceof StoreConversationError)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: error.message,
        cause: error,
      })
    if (error instanceof CommerceQuoteError)
      throw new TRPCError({
        code:
          error.code === "IDEMPOTENCY_MISMATCH" ||
          error.code === "QUOTE_CONFLICT"
            ? "CONFLICT"
            : "FORBIDDEN",
        message: error.message,
        cause: error,
      })
    if (
      error instanceof ServiceCommercePolicyError ||
      error instanceof ServiceCommerceQuoteReleaseError
    )
      throw new TRPCError({
        code: error.code === "CONFLICT" ? "CONFLICT" : "FORBIDDEN",
        message: error.message,
        cause: error,
      })
    throw error
  }
}
async function current(
  ctx: GeneralTransactionContext,
  raw: QuoteDecisionAction,
) {
  const payload = quoteDecisionAction.parse(raw)
  const scope = requireGeneralScope(ctx)
  return operation(() =>
    prepareReviewedQuoteDecisionInTransaction(ctx.db, {
      approvalId: payload.approvalId,
      quoteId: payload.quoteId,
      quoteVersionId: payload.quoteVersionId,
      decision:
        payload.action === "commerce_quote_approve" ? "approve" : "reject",
      reason: payload.reason,
      actorUserId: scope.userId,
      tenantId: scope.tenantId,
      storeId: scope.storeId,
    }),
  )
}
function receipt(
  result: Awaited<ReturnType<Awaited<ReturnType<typeof current>>["execute"]>>,
) {
  return quoteDecisionReceipt.parse({
    kind: "commerce_quote_decision",
    recordId: result.approvalId,
    quoteId: result.quoteId,
    quoteVersionId: result.quoteVersionId,
    decision: result.decision,
    policyRevision: result.policyRevision,
    decidedAt: result.decidedAt,
    decidedByMembershipId: result.decidedByMembershipId,
    reason: result.reason,
    releaseState: result.releaseState,
    title:
      result.decision === "approved"
        ? "Quotation approved and released"
        : "Quotation rejected",
    detail:
      result.decision === "approved"
        ? "The exact original quotation version was commercially released. This is not customer acceptance, payment or clinical release."
        : "The original decision was rejected. The version remains private; any new approval requires a revised version.",
  })
}
/** Fresh native preparation joins GENERAL signed confirmation; completed recovery uses its stored receipt. */
export const quoteApprovalDecision = {
  stale:
    "The original quotation, selected approver, policy, version or release effects changed. Review again.",
  unavailable:
    "This original quotation decision is unavailable for your current access or source.",
  async validate(ctx: GeneralTransactionContext, payload: QuoteDecisionAction) {
    return (await current(ctx, payload)).target
  },
  async review(ctx: GeneralTransactionContext, payload: QuoteDecisionAction) {
    const { target, review } = await current(ctx, payload)
    return {
      target,
      lines: [
        `Original quotation version ${review.detail.version} · ${generalMoney(review.detail.totalMinor, review.detail.currencyCode)}. Stored decision: ${review.detail.status}.`,
        `Decision: ${review.decision}. Reason: ${review.reason}.`,
        `Original release policy revision ${review.detail.policyRevision}. Expiry: ${review.detail.expiresAt?.toISOString() ?? "No recorded expiry"}.`,
        ...(review.decision === "approve"
          ? review.detail.options.flatMap((option) => [
              `${option.label}: an alternative with its own total ${generalMoney(option.totalMinor, review.detail.currencyCode)}; option totals are not added together.`,
              ...option.lines.map(
                (line) =>
                  `${line.offeringName ?? line.catalogItemName ?? "Saved item"}${line.variantName ? ` · ${line.variantName}` : ""}: ${line.outcome}; quantity ${line.quantity ?? "not quoted"}; unit ${line.unitPriceMinor === null ? "not quoted" : generalMoney(line.unitPriceMinor, review.detail.currencyCode)}; line total ${line.totalMinor === null ? "not quoted" : generalMoney(line.totalMinor, review.detail.currencyCode)}.`,
              ),
            ])
          : []),
        ...review.releaseText.flatMap((option) => [
          ...(option.customerNote
            ? [`${option.label} · customer note: ${option.customerNote}`]
            : []),
          ...(option.fulfilmentPromise
            ? [
                `${option.label} · fulfilment promise: ${option.fulfilmentPromise}`,
              ]
            : []),
          ...option.lineNotes.map(
            (text) => `${option.label} · line customer note: ${text}`,
          ),
        ]),
        ...(review.decision === "approve"
          ? [
              "Approval atomically releases this exact version, creates its public acceptance capability and records decision-audit facts.",
              review.effects.sourceIssuedFacts
                ? "The canonical command also transitions the original source to its quoted state and records its applicable source-issued facts."
                : "The source is already quoted; this decision does not fabricate a new source transition.",
              `${review.effects.linkedConversationCount} existing linked conversation(s) receive native quotation action messages and their canonical invitation/unread notification intents.`,
              "Current author Terms and configured native text screening are mandatory. Screening is not checked by this pure review and may require a live provider at execution. Provider delivery is not reported as successful.",
            ]
          : [
              "Rejection keeps this version private. It creates no release capability, customer message, stock change or payment.",
            ]),
        "Commercial approval does not authorize prescription/clinical release, customer acceptance, an Order or payment.",
      ],
    }
  },
  async prepareExecution(
    ctx: GeneralTransactionContext,
    payload: QuoteDecisionAction,
  ) {
    const prepared = await current(ctx, payload)
    return {
      target: prepared.target,
      execute: async (key: string) =>
        receipt(await operation(() => prepared.execute(key))),
    }
  },
  async execute(
    ctx: GeneralTransactionContext,
    payload: QuoteDecisionAction,
    key: string,
  ) {
    const prepared = await current(ctx, payload)
    return receipt(await operation(() => prepared.execute(key)))
  },
}

/** Pure review with original tuple and authenticated scope; no screening or execution. */
export function reviewGeneralQuoteDecision(ctx: GeneralContext, raw: unknown) {
  const payload = quoteDecisionAction.parse(raw)
  const scope = requireGeneralScope(ctx)
  return ctx.db.$transaction(
    async (tx) => ({
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      actorUserId: scope.userId,
      approvalId: payload.approvalId,
      quoteId: payload.quoteId,
      quoteVersionId: payload.quoteVersionId,
      action: payload.action,
      reason: payload.reason,
      ...(await quoteApprovalDecision.review({ ...ctx, db: tx }, payload)),
    }),
    { isolationLevel: "RepeatableRead", maxWait: 10000, timeout: 30000 },
  )
}
