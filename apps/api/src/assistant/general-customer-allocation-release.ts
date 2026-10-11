import { createHash } from "node:crypto"
import {
  generalMoney,
  type GeneralAction,
} from "@ewatrade/assistant/general/contracts"
import {
  getCustomerAllocationReleaseReview,
  releaseCustomerLedgerAllocationInTransaction,
} from "@ewatrade/db/queries"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { assertFinanceAccess } from "../trpc/finance-procedure"
type Action = Extract<GeneralAction, { action: "customer_allocation_release" }>
async function current(ctx: GeneralTransactionContext, payload: Action) {
  const scope = requireGeneralScope(ctx)
  assertFinanceAccess(ctx.tenantContext)
  const input = {
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
    bookId: payload.bookId,
    accountId: payload.accountId,
    amountMinor: payload.amountMinor,
    allocationId: payload.allocationId,
    reason: payload.reason,
  }
  const review = await getCustomerAllocationReleaseReview(ctx.db, input)
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
export function customerAllocationReleaseReviewLines(
  review: Awaited<ReturnType<typeof getCustomerAllocationReleaseReview>>,
  payload: Action,
) {
  const money = (amount: string) => generalMoney(amount, review.currencyCode)
  return [
    `Release ${money(review.amountMinor)} from ${review.customerName}'s existing allocation.`,
    `Remaining allocation: ${money(review.allocatedBeforeMinor)} → ${money(review.allocatedAfterMinor)}.`,
    `Available credit: ${money(review.accountCreditBeforeMinor)} → ${money(review.accountCreditAfterMinor)}.`,
    `Posted debt: ${money(review.accountDebtBeforeMinor)} → ${money(review.accountDebtAfterMinor)}.`,
    review.orderNumber
      ? `Reverse the linked credit settlement on Order ${review.orderNumber}.`
      : "Restore posted opening debt.",
    "No money is refunded. The released amount becomes available customer credit.",
    `Reason: ${payload.reason}`,
  ]
}
async function execute(
  ctx: GeneralTransactionContext,
  payload: Action,
  key: string,
  prepared?: Awaited<ReturnType<typeof current>>,
) {
  const { input, review } = prepared ?? (await current(ctx, payload))
  await releaseCustomerLedgerAllocationInTransaction(ctx.db, {
    ...input,
    clientCommandId: key,
    expectedRevision: review.accountRevision,
  })
  return {
    kind: "customer" as const,
    recordId: review.customerId,
    title: "Customer allocation released",
    detail: `${generalMoney(review.amountMinor, review.currencyCode)} allocation released. Credit and debt restored; no money was refunded.`,
  }
}
export const customerAllocationRelease = {
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
    return {
      target,
      lines: customerAllocationReleaseReviewLines(review, payload),
    }
  },
  execute,
} satisfies GeneralActionAdapter<Action>
