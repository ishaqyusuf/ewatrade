import { createHash } from "node:crypto"
import {
  generalMoney,
  type GeneralAction,
} from "@ewatrade/assistant/general/contracts"
import {
  getFinanceBillPaymentReversalReview,
  getFinanceExpenseVoidReview,
  reverseFinanceBillPaymentInTransaction,
  voidFinanceExpenseInTransaction,
} from "@ewatrade/db/queries"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { assertFinanceAccess } from "../trpc/finance-procedure"
type Action = Extract<
  GeneralAction,
  { action: "expense_void" | "bill_payment_reverse" }
>
function inputFor(ctx: GeneralTransactionContext, payload: Action) {
  const scope = requireGeneralScope(ctx)
  assertFinanceAccess(ctx.tenantContext)
  return {
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
    bookId: payload.bookId,
    effectiveAt: new Date(payload.effectiveAt),
    reason: payload.reason,
  }
}
async function current(ctx: GeneralTransactionContext, payload: Action) {
  const input = inputFor(ctx, payload)
  const review =
    payload.action === "expense_void"
      ? await getFinanceExpenseVoidReview(ctx.db, {
          ...input,
          billId: payload.billId,
        })
      : await getFinanceBillPaymentReversalReview(ctx.db, {
          ...input,
          paymentId: payload.paymentId,
        })
  return {
    input,
    review,
    target: {
      id:
        payload.action === "expense_void" ? payload.billId : payload.paymentId,
      revision: createHash("sha256")
        .update(JSON.stringify(review))
        .digest("hex"),
    },
  }
}
export function billCorrectionReviewLines(
  review: Awaited<ReturnType<typeof current>>["review"],
) {
  const money = (value: string) => generalMoney(value, review.currencyCode)
  return [
    `${"paymentId" in review ? "Reverse recorded payment" : "Void unpaid expense"}: ${review.payeeName} · ${review.description}.`,
    ...("paymentId" in review
      ? [
          `Reverse ${money(review.amountMinor)} ${review.funding === "OWNER_CAPITAL" ? "owner-funded" : "business-funded"} payment; recorded paid amount ${money(review.paidBeforeMinor)} → ${money(review.paidAfterMinor)}.`,
        ]
      : [
          `Remove expense ${money(review.totalMinor)} from active bills while retaining its history.`,
        ]),
    `Remaining payable: ${money(review.outstandingBeforeMinor)} → ${money(review.outstandingAfterMinor)}.`,
    ...review.lines.map(
      (line) =>
        `${line.accountName}: debit ${money(line.debitMinor)}, credit ${money(line.creditMinor)}.`,
    ),
    `Correction date: ${review.effectiveAt} (UTC). Reason: ${review.reason}`,
    "Bookkeeping correction only. This does not refund, recover or transfer money. Original records remain in history.",
  ]
}
async function execute(
  ctx: GeneralTransactionContext,
  payload: Action,
  key: string,
  prepared?: Awaited<ReturnType<typeof current>>,
) {
  const { input, review } = prepared ?? (await current(ctx, payload))
  if (payload.action === "expense_void")
    await voidFinanceExpenseInTransaction(ctx.db, {
      ...input,
      billId: payload.billId,
      clientCommandId: key,
    })
  else
    await reverseFinanceBillPaymentInTransaction(ctx.db, {
      ...input,
      paymentId: payload.paymentId,
      clientCommandId: key,
    })
  return {
    kind: "finance_bill" as const,
    recordId: review.billId,
    bookId: review.bookId,
    title:
      payload.action === "expense_void"
        ? "Expense voided"
        : "Bill payment reversed",
    detail: `${generalMoney(review.outstandingAfterMinor, review.currencyCode)} remains payable. Bookkeeping corrected; no money was transferred.`,
  }
}
export const billCorrection = {
  stale:
    "Expense, payment, original posting or posting period changed. Review again.",
  unavailable: "This correction cannot be recorded now.",
  async validate(ctx, payload) {
    return (await current(ctx, payload)).target
  },
  async review(ctx, payload) {
    const { review, target } = await current(ctx, payload)
    return { target, lines: billCorrectionReviewLines(review) }
  },
  async prepareExecution(ctx, payload) {
    const prepared = await current(ctx, payload)
    return {
      target: prepared.target,
      execute: (key) => execute(ctx, payload, key, prepared),
    }
  },
  execute,
} satisfies GeneralActionAdapter<Action>
