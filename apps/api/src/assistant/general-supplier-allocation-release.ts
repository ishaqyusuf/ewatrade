import { createHash } from "node:crypto"
import {
  generalMoney,
  type GeneralAction,
} from "@ewatrade/assistant/general/contracts"
import {
  getFinanceSupplierAllocationReleaseReview,
  releaseFinanceSupplierAllocationInTransaction,
} from "@ewatrade/db/queries"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { assertFinanceAccess } from "../trpc/finance-procedure"

type Action = Extract<GeneralAction, { action: "supplier_allocation_release" }>
async function current(
  ctx: GeneralTransactionContext,
  payload: Action,
  lockBook = false,
) {
  const scope = requireGeneralScope(ctx)
  assertFinanceAccess(ctx.tenantContext)
  const input = {
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
    bookId: payload.bookId,
    allocationId: payload.allocationId,
    amountMinor: payload.amountMinor,
    effectiveAt: new Date(payload.effectiveAt),
    reason: payload.reason,
  }
  const review = await getFinanceSupplierAllocationReleaseReview(
    ctx.db,
    input,
    lockBook,
  )
  return {
    input,
    review,
    target: {
      id: review.allocationId,
      revision: createHash("sha256")
        .update(JSON.stringify(review))
        .digest("hex"),
    },
  }
}
export function supplierAllocationReleaseReviewLines(
  r: Awaited<ReturnType<typeof getFinanceSupplierAllocationReleaseReview>>,
) {
  const money = (v: string) => generalMoney(v, r.currencyCode)
  return [
    `Release ${money(r.amountMinor)} of ${r.supplierName}'s advance allocation from ${r.billDescription}.`,
    `Original allocation ${money(r.allocationOriginalMinor)} dated ${r.allocationEffectiveAt} (UTC). Still applied ${money(r.allocationRemainingBeforeMinor)} → ${money(r.allocationRemainingAfterMinor)}.`,
    `Unallocated original supplier advance ${money(r.advanceBeforeMinor)} → ${money(r.advanceAfterMinor)}. Invoice settled ${money(r.paidBeforeMinor)} → ${money(r.paidAfterMinor)}; remaining payable ${money(r.outstandingBeforeMinor)} → ${money(r.outstandingAfterMinor)}.`,
    `Journal: debit ${r.advanceAccountName}; credit ${r.payableAccountName} · ${money(r.amountMinor)} each.`,
    `Release date: ${r.effectiveAt} (UTC). Reason: ${r.reason}.`,
    "This releases existing allocated supplier funds. No cash moves, no refund is issued and no purchase cost or stock changes. Original allocation and release history remain recorded.",
  ]
}
async function execute(
  ctx: GeneralTransactionContext,
  payload: Action,
  key: string,
  prepared?: Awaited<ReturnType<typeof current>>,
) {
  const { input, review } = prepared ?? (await current(ctx, payload, true))
  await releaseFinanceSupplierAllocationInTransaction(ctx.db, {
    ...input,
    clientCommandId: key,
  })
  return {
    kind: "finance_purchase_bill" as const,
    recordId: review.billId,
    bookId: review.bookId,
    title: "Supplier allocation released",
    detail: `${generalMoney(review.amountMinor, review.currencyCode)} restored to the original advance; ${generalMoney(review.outstandingAfterMinor, review.currencyCode)} remains payable on the invoice. No cash moved.`,
  }
}
export const supplierAllocationRelease = {
  stale:
    "The allocation, original advance, invoice or posting period changed. Review again.",
  unavailable: "This supplier allocation cannot be released now.",
  async validate(ctx, payload) {
    return (await current(ctx, payload)).target
  },
  async review(ctx, payload) {
    const p = await current(ctx, payload)
    return {
      target: p.target,
      lines: supplierAllocationReleaseReviewLines(p.review),
    }
  },
  async prepareExecution(ctx, payload) {
    const p = await current(ctx, payload, true)
    return { target: p.target, execute: (key) => execute(ctx, payload, key, p) }
  },
  execute,
} satisfies GeneralActionAdapter<Action>
