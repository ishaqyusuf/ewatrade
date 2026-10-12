import { createHash } from "node:crypto"
import {
  generalMoney,
  type GeneralAction,
} from "@ewatrade/assistant/general/contracts"
import {
  getFinancePurchasePaymentReversalReview,
  prepareReviewedFinancePurchasePaymentReversalInTransaction,
} from "@ewatrade/db/queries"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { assertFinanceAccess } from "../trpc/finance-procedure"
type Action = Extract<GeneralAction, { action: "purchase_payment_reverse" }>
function inputFor(ctx: GeneralTransactionContext, payload: Action) {
  const scope = requireGeneralScope(ctx)
  assertFinanceAccess(ctx.tenantContext)
  return {
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
    bookId: payload.bookId,
    paymentId: payload.paymentId,
    effectiveAt: new Date(payload.effectiveAt),
    reason: payload.reason,
  }
}
function target(
  review: Awaited<ReturnType<typeof getFinancePurchasePaymentReversalReview>>,
) {
  return {
    id: review.paymentId,
    revision: createHash("sha256").update(JSON.stringify(review)).digest("hex"),
  }
}
async function current(ctx: GeneralTransactionContext, payload: Action) {
  const review = await getFinancePurchasePaymentReversalReview(
    ctx.db,
    inputFor(ctx, payload),
  )
  return { review, target: target(review) }
}
async function prepared(ctx: GeneralTransactionContext, payload: Action) {
  const p = await prepareReviewedFinancePurchasePaymentReversalInTransaction(
    ctx.db,
    inputFor(ctx, payload),
  )
  return { ...p, target: target(p.review) }
}
export function purchasePaymentReversalReviewLines(
  r: Awaited<ReturnType<typeof getFinancePurchasePaymentReversalReview>>,
) {
  const money = (v: string) => generalMoney(v, r.currencyCode)
  return [
    `Reverse ${money(r.amountMinor)} recorded payment to ${r.supplierName} for ${r.billDescription}.`,
    `Original payment from ${r.moneyAccountName} dated ${r.paymentEffectiveAt} (UTC).${r.reference ? ` Reference: ${r.reference}.` : ""}`,
    `Invoice settled ${money(r.paidBeforeMinor)} → ${money(r.paidAfterMinor)}; remaining payable ${money(r.outstandingBeforeMinor)} → ${money(r.outstandingAfterMinor)}.`,
    ...r.lines.map(
      (line) =>
        `${line.accountName}: debit ${money(line.debitMinor)}, credit ${money(line.creditMinor)}.`,
    ),
    `Correction date: ${r.effectiveAt} (UTC). Reason: ${r.reason}.`,
    "This reverses the whole original payment record and retains its history. It does not recover or refund money, send a transfer, release an advance, reverse purchase cost or change stock.",
  ]
}
async function execute(
  ctx: GeneralTransactionContext,
  payload: Action,
  key: string,
  preparation?: Awaited<ReturnType<typeof prepared>>,
) {
  const p = preparation ?? (await prepared(ctx, payload))
  await p.execute(key)
  return {
    kind: "finance_purchase_bill" as const,
    recordId: p.review.billId,
    bookId: p.review.bookId,
    title: "Purchase payment reversed",
    detail: `${generalMoney(p.review.amountMinor, p.review.currencyCode)} payment record reversed; ${generalMoney(p.review.outstandingAfterMinor, p.review.currencyCode)} remains payable. No money was recovered or sent.`,
  }
}
export const purchasePaymentReverse = {
  stale:
    "The original purchase payment, accounts, invoice or posting period changed. Review again.",
  unavailable: "This purchase payment cannot be reversed now.",
  async validate(ctx, payload) {
    return (await current(ctx, payload)).target
  },
  async review(ctx, payload) {
    const p = await current(ctx, payload)
    return {
      target: p.target,
      lines: purchasePaymentReversalReviewLines(p.review),
    }
  },
  async prepareExecution(ctx, payload) {
    const p = await prepared(ctx, payload)
    return { target: p.target, execute: (key) => execute(ctx, payload, key, p) }
  },
  execute,
} satisfies GeneralActionAdapter<Action>
