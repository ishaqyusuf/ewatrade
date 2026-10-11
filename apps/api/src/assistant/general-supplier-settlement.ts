import { createHash } from "node:crypto"
import {
  generalMoney,
  type GeneralAction,
} from "@ewatrade/assistant/general/contracts"
import {
  getFinanceSupplierAdvanceReview,
  getFinancePurchasePaymentReview,
  getFinanceSupplierAllocationReview,
  recordFinanceSupplierAdvanceInTransaction,
  payFinancePurchaseBillInTransaction,
  allocateFinanceSupplierAdvanceInTransaction,
} from "@ewatrade/db/queries"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { assertFinanceAccess } from "../trpc/finance-procedure"

type Advance = Extract<GeneralAction, { action: "supplier_advance" }>
type Allocation = Extract<
  GeneralAction,
  { action: "supplier_advance_allocate" }
>
type Payment = Extract<GeneralAction, { action: "purchase_payment" }>
function actor(ctx: GeneralTransactionContext) {
  const scope = requireGeneralScope(ctx)
  assertFinanceAccess(ctx.tenantContext)
  return { tenantId: scope.tenantId, actorUserId: scope.userId }
}
function target(id: string, review: unknown) {
  return {
    id,
    revision: createHash("sha256").update(JSON.stringify(review)).digest("hex"),
  }
}
async function currentAdvance(
  ctx: GeneralTransactionContext,
  payload: Advance,
  lockBook = false,
) {
  const input = {
    ...actor(ctx),
    bookId: payload.bookId,
    supplierId: payload.supplierId,
    moneyAccountId: payload.moneyAccountId,
    amountMinor: payload.amountMinor,
    description: payload.description,
    effectiveAt: new Date(payload.effectiveAt),
  }
  const review = await getFinanceSupplierAdvanceReview(ctx.db, input, lockBook)
  return { input, review, target: target(review.supplierId, review) }
}
async function currentPayment(
  ctx: GeneralTransactionContext,
  payload: Payment,
  lockBook = false,
) {
  const input = {
    ...actor(ctx),
    bookId: payload.bookId,
    billId: payload.billId,
    moneyAccountId: payload.moneyAccountId,
    amountMinor: payload.amountMinor,
    description: payload.description,
    effectiveAt: new Date(payload.effectiveAt),
    reference: payload.reference,
  }
  const review = await getFinancePurchasePaymentReview(ctx.db, input, lockBook)
  return { input, review, target: target(review.billId, review) }
}
async function currentAllocation(
  ctx: GeneralTransactionContext,
  payload: Allocation,
  lockBook = false,
) {
  const input = {
    ...actor(ctx),
    bookId: payload.bookId,
    billId: payload.billId,
    advanceEntryId: payload.advanceEntryId,
    amountMinor: payload.amountMinor,
    description: payload.description,
    effectiveAt: new Date(payload.effectiveAt),
  }
  const review = await getFinanceSupplierAllocationReview(
    ctx.db,
    input,
    lockBook,
  )
  return { input, review, target: target(review.billId, review) }
}
export function supplierAdvanceReviewLines(
  r: Awaited<ReturnType<typeof getFinanceSupplierAdvanceReview>>,
) {
  const money = (v: string) => generalMoney(v, r.currencyCode)
  return [
    `Record ${money(r.amountMinor)} already paid to ${r.supplierName} (${r.supplierCode}) from ${r.moneyAccountName}.`,
    `Unallocated supplier advance increases by ${money(r.unallocatedAddedMinor)}; supplier payable is unchanged.`,
    `Journal: debit ${r.advanceAccountName}; credit ${r.moneyAccountName} · ${money(r.amountMinor)} each.`,
    `Payment date: ${r.effectiveAt} (UTC). Description: ${r.description}.`,
    "This records an advance already paid. It does not allocate credit to an invoice, recognize purchase cost, change stock, send money or verify bank settlement.",
  ]
}
export function purchasePaymentReviewLines(
  r: Awaited<ReturnType<typeof getFinancePurchasePaymentReview>>,
) {
  const money = (v: string) => generalMoney(v, r.currencyCode)
  return [
    `Record ${money(r.amountMinor)} already paid to ${r.supplierName} for ${r.description} from ${r.moneyAccountName}.`,
    `Invoice total ${money(r.totalMinor)}; previously settled ${money(r.paidBeforeMinor)}. Remaining payable ${money(r.outstandingBeforeMinor)} → ${money(r.outstandingAfterMinor)}.`,
    `Journal: debit ${r.payableAccountName}; credit ${r.moneyAccountName} · ${money(r.amountMinor)} each.`,
    `Payment date: ${r.effectiveAt} (UTC).${r.reference ? ` Reference: ${r.reference}.` : ""}`,
    "This records partial or full settlement of the existing invoice. No new purchase cost, invoice, ownership or stock receipt is recorded. No money is sent or bank settlement verified.",
  ]
}
export function supplierAllocationReviewLines(
  r: Awaited<ReturnType<typeof getFinanceSupplierAllocationReview>>,
) {
  const money = (v: string) => generalMoney(v, r.currencyCode)
  return [
    `Apply ${money(r.amountMinor)} of ${r.supplierName}'s existing advance to ${r.billDescription}.`,
    `Original advance ${money(r.advanceOriginalMinor)} dated ${r.advanceEffectiveAt} (UTC). Unallocated ${money(r.advanceBeforeMinor)} → ${money(r.advanceAfterMinor)}.`,
    `Invoice total ${money(r.totalMinor)}; previously settled ${money(r.paidBeforeMinor)}. Remaining payable ${money(r.outstandingBeforeMinor)} → ${money(r.outstandingAfterMinor)}.`,
    `Journal: debit ${r.payableAccountName}; credit ${r.advanceAccountName} · ${money(r.amountMinor)} each. Allocation date: ${r.effectiveAt} (UTC).`,
    "This applies existing supplier funds to the exact invoice. No cash moves and no purchase cost, invoice, ownership or stock receipt is created.",
  ]
}
async function executeAdvance(
  ctx: GeneralTransactionContext,
  payload: Advance,
  key: string,
  prepared?: Awaited<ReturnType<typeof currentAdvance>>,
) {
  const { input, review } =
    prepared ?? (await currentAdvance(ctx, payload, true))
  await recordFinanceSupplierAdvanceInTransaction(ctx.db, {
    ...input,
    clientCommandId: key,
  })
  return {
    kind: "finance_supplier" as const,
    recordId: review.supplierId,
    bookId: review.bookId,
    title: "Supplier advance recorded",
    detail: `${generalMoney(review.amountMinor, review.currencyCode)} recorded as unallocated funds for ${review.supplierName}. No money was sent or invoice settled.`,
  }
}
async function executePayment(
  ctx: GeneralTransactionContext,
  payload: Payment,
  key: string,
  prepared?: Awaited<ReturnType<typeof currentPayment>>,
) {
  const { input, review } =
    prepared ?? (await currentPayment(ctx, payload, true))
  await payFinancePurchaseBillInTransaction(ctx.db, {
    ...input,
    clientCommandId: key,
  })
  return {
    kind: "finance_purchase_bill" as const,
    recordId: review.billId,
    bookId: review.bookId,
    title: "Purchase payment recorded",
    detail: `${generalMoney(review.amountMinor, review.currencyCode)} recorded; ${generalMoney(review.outstandingAfterMinor, review.currencyCode)} remains payable. No money was sent.`,
  }
}
async function executeAllocation(
  ctx: GeneralTransactionContext,
  payload: Allocation,
  key: string,
  prepared?: Awaited<ReturnType<typeof currentAllocation>>,
) {
  const { input, review } =
    prepared ?? (await currentAllocation(ctx, payload, true))
  await allocateFinanceSupplierAdvanceInTransaction(ctx.db, {
    ...input,
    clientCommandId: key,
  })
  return {
    kind: "finance_purchase_bill" as const,
    recordId: review.billId,
    bookId: review.bookId,
    title: "Supplier advance applied",
    detail: `${generalMoney(review.amountMinor, review.currencyCode)} applied; ${generalMoney(review.outstandingAfterMinor, review.currencyCode)} remains payable and ${generalMoney(review.advanceAfterMinor, review.currencyCode)} remains unallocated. No cash moved.`,
  }
}
export const supplierAdvance = {
  stale: "Supplier, funding account or posting period changed. Review again.",
  unavailable: "This supplier advance cannot be recorded now.",
  async validate(ctx, payload) {
    return (await currentAdvance(ctx, payload)).target
  },
  async review(ctx, payload) {
    const p = await currentAdvance(ctx, payload)
    return { target: p.target, lines: supplierAdvanceReviewLines(p.review) }
  },
  async prepareExecution(ctx, payload) {
    const p = await currentAdvance(ctx, payload, true)
    return {
      target: p.target,
      execute: (key) => executeAdvance(ctx, payload, key, p),
    }
  },
  execute: executeAdvance,
} satisfies GeneralActionAdapter<Advance>
export const purchasePayment = {
  stale:
    "Purchase invoice, payable, funding account or posting period changed. Review again.",
  unavailable: "This purchase payment cannot be recorded now.",
  async validate(ctx, payload) {
    return (await currentPayment(ctx, payload)).target
  },
  async review(ctx, payload) {
    const p = await currentPayment(ctx, payload)
    return { target: p.target, lines: purchasePaymentReviewLines(p.review) }
  },
  async prepareExecution(ctx, payload) {
    const p = await currentPayment(ctx, payload, true)
    return {
      target: p.target,
      execute: (key) => executePayment(ctx, payload, key, p),
    }
  },
  execute: executePayment,
} satisfies GeneralActionAdapter<Payment>
export const supplierAdvanceAllocate = {
  stale:
    "Purchase payable, original advance or posting period changed. Review again.",
  unavailable: "This supplier advance cannot be applied now.",
  async validate(ctx, payload) {
    return (await currentAllocation(ctx, payload)).target
  },
  async review(ctx, payload) {
    const p = await currentAllocation(ctx, payload)
    return { target: p.target, lines: supplierAllocationReviewLines(p.review) }
  },
  async prepareExecution(ctx, payload) {
    const p = await currentAllocation(ctx, payload, true)
    return {
      target: p.target,
      execute: (key) => executeAllocation(ctx, payload, key, p),
    }
  },
  execute: executeAllocation,
} satisfies GeneralActionAdapter<Allocation>
