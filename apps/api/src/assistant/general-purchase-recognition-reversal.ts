import { createHash } from "node:crypto"
import {
  generalMoney,
  type GeneralAction,
} from "@ewatrade/assistant/general/contracts"
import {
  getFinancePurchaseRecognitionReversalReview,
  prepareReviewedFinancePurchaseRecognitionReversalInTransaction,
} from "@ewatrade/db/queries"
import { assertFinanceAccess } from "../trpc/finance-procedure"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
type Action = Extract<GeneralAction, { action: "purchase_recognition_reverse" }>
type Review = Awaited<
  ReturnType<typeof getFinancePurchaseRecognitionReversalReview>
>
function inputFor(ctx: GeneralTransactionContext, p: Action) {
  const scope = requireGeneralScope(ctx)
  assertFinanceAccess(ctx.tenantContext)
  return {
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
    bookId: p.bookId,
    recognitionId: p.recognitionId,
    eventId: p.eventId,
    effectiveAt: new Date(p.effectiveAt),
    reason: p.reason,
  }
}
function target(r: Review) {
  return {
    id: r.eventId,
    revision: createHash("sha256").update(JSON.stringify(r)).digest("hex"),
  }
}
async function current(ctx: GeneralTransactionContext, p: Action) {
  const review = await getFinancePurchaseRecognitionReversalReview(
    ctx.db,
    inputFor(ctx, p),
  )
  return { review, target: target(review) }
}
async function prepared(ctx: GeneralTransactionContext, p: Action) {
  const result =
    await prepareReviewedFinancePurchaseRecognitionReversalInTransaction(
      ctx.db,
      inputFor(ctx, p),
    )
  return { ...result, target: target(result.review) }
}
export function purchaseRecognitionReversalReviewLines(r: Review) {
  const money = (v: string) => generalMoney(v, r.currencyCode)
  return [
    `Reverse the original ${r.stage.toLowerCase()} fact for ${r.description} · ${r.supplierName} · ${r.storeName}.`,
    `Original fact: ${r.originalEffectiveAt} (UTC), reference ${r.reference}. Whole agreed cost ${money(r.totalMinor)}.`,
    ...r.goods.map(
      (l) =>
        `${l.description}: ${l.enteredQuantity} ${l.enteredUnitName} · ${money(l.amountMinor)} original cost retained.`,
    ),
    `Journal reversal: debit ${r.debit.code} ${r.debit.accountName}; credit ${r.credit.code} ${r.credit.accountName} · ${money(r.totalMinor)} each.`,
    r.invoiceWillBeVoided
      ? `The original unpaid invoice is voided; payable decreases by ${money(r.payableDecreaseMinor)}. All active payments and consumed advances must already be corrected.`
      : "No supplier invoice is voided and no payable is removed.",
    `Correction date: ${r.effectiveAt} (UTC). Reason: ${r.reason}.`,
    "The original agreement, goods costs and fact history remain. No physical receipt or stock correction, advance release, refund, money recovery or transfer is performed.",
  ]
}
async function execute(
  ctx: GeneralTransactionContext,
  p: Action,
  key: string,
  preparation?: Awaited<ReturnType<typeof prepared>>,
) {
  const value = preparation ?? (await prepared(ctx, p))
  await value.execute(key)
  return {
    kind: "finance_purchase_registration" as const,
    recordId: value.review.recognitionId,
    bookId: value.review.bookId,
    title: value.review.invoiceWillBeVoided
      ? "Purchase invoice fact reversed"
      : "Purchase ownership fact reversed",
    detail: `${value.review.supplierName} · ${generalMoney(value.review.totalMinor, value.review.currencyCode)} original ${value.review.stage.toLowerCase()} fact reversed. ${value.review.invoiceWillBeVoided ? "Original unpaid invoice voided. " : " "}No money or stock moved.`,
  }
}
export const purchaseRecognitionReverse = {
  stale:
    "The purchase fact, original journal, dependent facts, settlement or posting period changed. Review again.",
  unavailable: "This purchase fact cannot be reversed now.",
  async validate(ctx, p) {
    return (await current(ctx, p)).target
  },
  async review(ctx, p) {
    const value = await current(ctx, p)
    return {
      target: value.target,
      lines: purchaseRecognitionReversalReviewLines(value.review),
    }
  },
  async prepareExecution(ctx, p) {
    const value = await prepared(ctx, p)
    return {
      target: value.target,
      execute: (key) => execute(ctx, p, key, value),
    }
  },
  execute,
} satisfies GeneralActionAdapter<Action>
