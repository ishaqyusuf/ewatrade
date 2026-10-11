import { createHash } from "node:crypto"
import {
  generalMoney,
  type GeneralAction,
} from "@ewatrade/assistant/general/contracts"
import {
  getCustomerCreditAllocationReview,
  applyCustomerLedgerCreditInTransaction,
} from "@ewatrade/db/queries"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { assertFinanceAccess } from "../trpc/finance-procedure"
type Action = Extract<GeneralAction, { action: "customer_credit_apply" }>
async function current(ctx: GeneralTransactionContext, payload: Action) {
  const scope = requireGeneralScope(ctx)
  assertFinanceAccess(ctx.tenantContext)
  const input = {
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
    bookId: payload.bookId,
    accountId: payload.accountId,
    amountMinor: payload.amountMinor,
    creditEntryId: payload.creditEntryId,
    chargeEntryId: payload.chargeEntryId,
  }
  const review = await getCustomerCreditAllocationReview(ctx.db, input)
  return {
    input,
    review,
    target: {
      id: review.accountId,
      revision: createHash("sha256")
        .update(JSON.stringify(review))
        .digest("hex"),
    },
  }
}
export function customerCreditApplyReviewLines(
  review: Awaited<ReturnType<typeof getCustomerCreditAllocationReview>>,
  payload: Action,
) {
  const money = (amount: string) => generalMoney(amount, review.currencyCode)
  return [
    `Apply ${money(review.amountMinor)} of ${review.customerName}'s existing credit.`,
    `Selected credit: ${money(review.sourceCreditBeforeMinor)} → ${money(review.sourceCreditAfterMinor)}.`,
    `Selected debt: ${money(review.sourceDebtBeforeMinor)} → ${money(review.sourceDebtAfterMinor)}.`,
    review.orderNumber
      ? `Settle posted Order ${review.orderNumber} with existing credit.`
      : "Apply to posted opening debt.",
    "No money is collected and no new customer deposit is recorded.",
  ]
}
async function execute(
  ctx: GeneralTransactionContext,
  payload: Action,
  key: string,
  prepared?: Awaited<ReturnType<typeof current>>,
) {
  const { input, review } = prepared ?? (await current(ctx, payload))
  await applyCustomerLedgerCreditInTransaction(ctx.db, {
    ...input,
    clientCommandId: key,
    expectedRevision: review.accountRevision,
  })
  return {
    kind: "customer" as const,
    recordId: review.customerId,
    title: "Customer credit applied",
    detail: `${generalMoney(review.amountMinor, review.currencyCode)} of existing credit applied. No money was collected.`,
  }
}
export const customerCreditApply = {
  stale:
    "Customer credit or debt changed. Review the current allocation again.",
  unavailable: "This customer credit operation is unavailable now.",
  async validate(ctx, payload) {
    return (await current(ctx, payload)).target
  },
  async prepareExecution(ctx, payload) {
    const prepared = await current(ctx, payload)
    return {
      target: prepared.target,
      execute: (key) => execute(ctx, payload, key, prepared),
    }
  },
  async review(ctx, payload) {
    const { review, target } = await current(ctx, payload)
    return { target, lines: customerCreditApplyReviewLines(review, payload) }
  },
  execute,
} satisfies GeneralActionAdapter<Action>
