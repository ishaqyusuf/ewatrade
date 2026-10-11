import { createHash } from "node:crypto"
import { generalMoney, type GeneralAction } from "@ewatrade/assistant/general/contracts"
import { getCustomerLedgerCreditRefundReview, refundCustomerLedgerCreditInTransaction } from "@ewatrade/db/queries"
import type { GeneralActionAdapter, GeneralTransactionContext } from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { assertFinanceAccess } from "../trpc/finance-procedure"

type RefundAction = Extract<GeneralAction, { action: "held_credit_refund" }>
type Review = Awaited<ReturnType<typeof getCustomerLedgerCreditRefundReview>>
async function current(ctx: GeneralTransactionContext, payload: RefundAction) {
  const scope = requireGeneralScope(ctx)
  assertFinanceAccess(ctx.tenantContext)
  const review = await getCustomerLedgerCreditRefundReview(ctx.db, {
    tenantId: scope.tenantId, actorUserId: scope.userId,
    bookId: payload.bookId, accountId: payload.accountId, creditEntryId: payload.creditEntryId,
    amountMinor: payload.amountMinor, moneyAccountId: payload.moneyAccountId, method: payload.method,
    effectiveAt: new Date(payload.effectiveAt),
  })
  return { scope, review, target: { id: review.accountId, revision: createHash("sha256").update(JSON.stringify(review)).digest("hex") } }
}
export function heldCreditRefundReviewLines(review: Review, payload: Pick<RefundAction, "reason" | "reference">) {
  const money = (value: string) => generalMoney(value, review.currencyCode)
  return [
    `Record ${money(review.amountMinor)} already returned to ${review.customerName}.`,
    `Unused held credit: ${money(review.availableBeforeMinor)} → ${money(review.availableAfterMinor)}.`,
    `Source: ${review.creditKind === "RECEIPT" ? "Customer receipt" : "Opening credit"} · ${review.creditEntryId}.`,
    `Payout account: ${review.moneyAccountName} · ${review.method.replaceAll("_", " ")}.`,
    `Recorded payout date: ${review.effectiveAt}.`,
    "This records a completed payout. It does not send money, request a provider refund, cancel an order or create new customer credit.",
    `Reason: ${payload.reason}`,
    ...(payload.reference ? [`Reference: ${payload.reference}`] : []),
  ]
}
async function execute(ctx: GeneralTransactionContext, payload: RefundAction, key: string, prepared?: Awaited<ReturnType<typeof current>>) {
  const { scope, review } = prepared ?? await current(ctx, payload)
  await refundCustomerLedgerCreditInTransaction(ctx.db, {
    tenantId: scope.tenantId, actorUserId: scope.userId, bookId: payload.bookId,
    accountId: payload.accountId, creditEntryId: payload.creditEntryId,
    moneyAccountId: payload.moneyAccountId, amountMinor: payload.amountMinor,
    method: payload.method, effectiveAt: new Date(payload.effectiveAt),
    reason: payload.reason, reference: payload.reference,
    clientCommandId: key, expectedRevision: review.accountRevision,
  })
  return { kind: "customer" as const, recordId: review.customerId, title: "Returned customer funds recorded",
    detail: `${generalMoney(review.amountMinor, review.currencyCode)} recorded from ${review.moneyAccountName}. Unused source credit: ${generalMoney(review.availableAfterMinor, review.currencyCode)}. No money was sent by the assistant.` }
}
export const heldCreditRefund = {
  stale: "Customer funds or payout details changed. Review the refund again.",
  unavailable: "This held credit cannot be refunded now.",
  async validate(ctx, payload) { return (await current(ctx, payload)).target },
  async prepareExecution(ctx, payload) {
    const prepared = await current(ctx, payload)
    return { target: prepared.target, execute: key => execute(ctx, payload, key, prepared) }
  },
  async review(ctx, payload) {
    const { review, target } = await current(ctx, payload)
    return { target, lines: heldCreditRefundReviewLines(review, payload) }
  },
  execute,
} satisfies GeneralActionAdapter<RefundAction>
