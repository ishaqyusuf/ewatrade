import { createHash } from "node:crypto"
import {
  generalMoney,
  type GeneralAction,
} from "@ewatrade/assistant/general/contracts"
import {
  getFinanceBillPaymentReview,
  payFinanceBillInTransaction,
  type FinanceBillPaymentInput,
} from "@ewatrade/db/queries"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { assertFinanceAccess } from "../trpc/finance-procedure"
type Action = Extract<GeneralAction, { action: "bill_payment" }>
async function current(ctx: GeneralTransactionContext, payload: Action) {
  const scope = requireGeneralScope(ctx)
  assertFinanceAccess(ctx.tenantContext)
  if (payload.funding === "BUSINESS_ACCOUNT" && !payload.accountId)
    throw Error("Choose a payment account.")
  const input = {
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
    bookId: payload.bookId,
    billId: payload.billId,
    amountMinor: payload.amountMinor,
    effectiveAt: new Date(payload.effectiveAt),
    reference: payload.reference,
    ...(payload.funding === "OWNER_CAPITAL"
      ? { funding: "OWNER_CAPITAL" as const }
      : {
          funding: "BUSINESS_ACCOUNT" as const,
          accountId: payload.accountId!,
        }),
  }
  const review = await getFinanceBillPaymentReview(ctx.db, input)
  return {
    input,
    review,
    target: {
      id: review.billId,
      revision: createHash("sha256")
        .update(JSON.stringify(review))
        .digest("hex"),
    },
  }
}
export function billPaymentReviewLines(
  review: Awaited<ReturnType<typeof getFinanceBillPaymentReview>>,
) {
  const money = (value: string) => generalMoney(value, review.currencyCode)
  return [
    `Record payment to ${review.payeeName} for ${review.description}.`,
    `${money(review.amountMinor)} already paid from ${review.accountName}${review.funding === "OWNER_CAPITAL" ? " (owner funds)" : ""}.`,
    `Bill total: ${money(review.totalMinor)}. Previously paid: ${money(review.paidBeforeMinor)}.`,
    `Remaining payable: ${money(review.outstandingBeforeMinor)} → ${money(review.outstandingAfterMinor)}.`,
    `Payment date: ${review.effectiveAt} (UTC).${review.reference ? ` Reference: ${review.reference}` : ""}`,
    "This records a payment already made. The assistant does not send money or create another expense.",
  ]
}
async function execute(
  ctx: GeneralTransactionContext,
  payload: Action,
  key: string,
  prepared?: Awaited<ReturnType<typeof current>>,
) {
  const { input, review } = prepared ?? (await current(ctx, payload))
  await payFinanceBillInTransaction(ctx.db, {
    ...input,
    clientCommandId: key,
  } satisfies FinanceBillPaymentInput)
  return {
    kind: "finance_bill" as const,
    recordId: review.billId,
    bookId: review.bookId,
    title: "Bill payment recorded",
    detail: `${generalMoney(review.amountMinor, review.currencyCode)} recorded; ${generalMoney(review.outstandingAfterMinor, review.currencyCode)} remains payable. No money was sent.`,
  }
}
export const billPayment = {
  stale:
    "Bill balance, funding account or posting period changed. Review again.",
  unavailable: "This bill payment cannot be recorded now.",
  async validate(ctx, payload) {
    return (await current(ctx, payload)).target
  },
  async review(ctx, payload) {
    const { review, target } = await current(ctx, payload)
    return { target, lines: billPaymentReviewLines(review) }
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
