import {
  generalMoney,
  type GeneralAction,
} from "@ewatrade/assistant/general/contracts"
import {
  getFinancePurchaseRecordingReview,
  financePurchaseRecordingReviewDigest,
  prepareReviewedFinancePurchaseRecordingInTransaction,
} from "@ewatrade/db/queries"
import { assertFinanceAccess } from "../trpc/finance-procedure"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { purchaseRecordingPresentation } from "./purchase-recording-presentation"
type Action = Extract<GeneralAction, { action: "purchase_record" }>
type Review = Awaited<ReturnType<typeof getFinancePurchaseRecordingReview>>
function inputFor(ctx: GeneralTransactionContext, p: Action) {
  const scope = requireGeneralScope(ctx)
  assertFinanceAccess(ctx.tenantContext)
  return {
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
    storeId: scope.storeId,
    bookId: p.bookId,
    supplierId: p.supplierId,
    description: p.description,
    reference: p.reference,
    incurredAt: new Date(p.incurredAt),
    dueAt: p.dueAt ? new Date(p.dueAt) : undefined,
    lines: p.lines,
  }
}
function target(r: Review) {
  return { id: r.supplierId, revision: financePurchaseRecordingReviewDigest(r) }
}
export function purchaseRecordingReviewLines(r: Review) {
  const money = (v: string) => generalMoney(v, r.currencyCode)
  return [
    `Record supplier invoice, ownership and receipt for ${r.supplierName} (${r.supplierCode}) at ${r.storeName}: ${r.description}.`,
    `Bill date: ${r.incurredAt} (UTC).${r.dueAt ? ` Due: ${r.dueAt} (UTC).` : ""} Reference: ${r.reference ?? "none"}.`,
    ...r.goods.flatMap((g) => [
      `${g.description}: ${g.enteredQuantity} ${g.enteredUnitName} · total cost ${money(g.amountMinor)}.`,
      `${g.stock.productName} · ${g.stock.variantName}: on-hand ${g.stock.before} → ${g.stock.after} ${g.stock.balanceUnitName}; reserved ${g.stock.reserved}; available after ${g.stock.availableAfter}.`,
      `Canonical quantity ${g.valuation.quantityBefore} → ${g.valuation.quantityAfter}; added original cost ${money(g.valuation.sourceCostMinor)}. Carrying value ${g.valuation.status === "KNOWN" ? `${money(g.valuation.valueBeforeMinor!)} → ${money(g.valuation.valueAfterMinor!)}` : `unknown (${g.valuation.unknownReason}); no opening cost invented`}.`,
      `Stock categories: ${g.categories.map((c) => `${c.name}${c.willCreate ? " (created on confirmation)" : ""}`).join(", ")}.`,
    ]),
    `Invoice total and supplier payable increase: ${money(r.totalMinor)}.`,
    ...r.journal.map(
      (l) =>
        `${l.code} ${l.accountName}: debit ${money(l.debitMinor)}, credit ${money(l.creditMinor)}.`,
    ),
    "This records all received goods, original purchase cost and payable together. No payment, transfer or advance allocation occurs. Physical receipt correction requires a supplier return source.",
  ]
}
export const purchaseRecord = {
  stale:
    "The purchase, supplier, stock, categories or valuation changed. Review again.",
  unavailable: "This received purchase cannot be recorded now.",
  async validate(ctx, p) {
    return target(
      await getFinancePurchaseRecordingReview(ctx.db, inputFor(ctx, p)),
    )
  },
  async review(ctx, p) {
    const r = await getFinancePurchaseRecordingReview(ctx.db, inputFor(ctx, p))
    return {
      target: target(r),
      lines: purchaseRecordingReviewLines(r),
      presentation: purchaseRecordingPresentation(r),
    }
  },
  async prepareExecution(ctx, p, command) {
    const v = await prepareReviewedFinancePurchaseRecordingInTransaction(
      ctx.db,
      inputFor(ctx, p),
      command.expectedReviewDigest,
    )
    return {
      target: target(v.review),
      execute: async (key) => {
        const bill = await v.execute(key)
        return {
          kind: "finance_purchase_bill" as const,
          recordId: bill.id,
          bookId: v.review.bookId,
          title: "Received purchase recorded",
          detail: `${v.review.supplierName} · ${generalMoney(v.review.totalMinor, v.review.currencyCode)} payable. Goods received with original-cost valuation; no payment recorded.`,
        }
      },
    }
  },
  async execute() {
    throw Error(
      "Direct purchase requires its locked signed review preparation.",
    )
  },
} satisfies GeneralActionAdapter<Action>
