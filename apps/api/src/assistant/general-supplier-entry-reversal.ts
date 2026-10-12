import { createHash } from "node:crypto"
import {
  generalMoney,
  type GeneralAction,
} from "@ewatrade/assistant/general/contracts"
import {
  getFinanceSupplierEntryReversalReview,
  prepareReviewedFinanceSupplierEntryReversalInTransaction,
} from "@ewatrade/db/queries"
import { assertFinanceAccess } from "../trpc/finance-procedure"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
type Action = Extract<GeneralAction, { action: "supplier_entry_reverse" }>
type Review = Awaited<ReturnType<typeof getFinanceSupplierEntryReversalReview>>
function inputFor(ctx: GeneralTransactionContext, p: Action) {
  const scope = requireGeneralScope(ctx)
  assertFinanceAccess(ctx.tenantContext)
  return {
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
    bookId: p.bookId,
    entryId: p.entryId,
    effectiveAt: new Date(p.effectiveAt),
    reason: p.reason,
  }
}
function target(r: Review) {
  return {
    id: r.entryId,
    revision: createHash("sha256").update(JSON.stringify(r)).digest("hex"),
  }
}
async function current(ctx: GeneralTransactionContext, p: Action) {
  const review = await getFinanceSupplierEntryReversalReview(
    ctx.db,
    inputFor(ctx, p),
  )
  return { review, target: target(review) }
}
async function prepared(ctx: GeneralTransactionContext, p: Action) {
  const value = await prepareReviewedFinanceSupplierEntryReversalInTransaction(
    ctx.db,
    inputFor(ctx, p),
  )
  return { ...value, target: target(value.review) }
}
export function supplierEntryReversalReviewLines(r: Review) {
  const money = (v: string) => generalMoney(v, r.currencyCode)
  return [
    `Reverse the whole original ${r.kind.toLowerCase().replaceAll("_", " ")} entry for ${r.supplierName} (${r.supplierCode}) · ${money(r.amountMinor)}.`,
    `Original entry: ${r.originalDescription}, ${r.originalEffectiveAt} (UTC). Its history remains.`,
    r.kind === "OPENING_PAYABLE"
      ? `Recorded supplier payable decreases by ${money(r.payableDecreaseMinor)}.`
      : `Original unallocated supplier advance decreases by ${money(r.unallocatedAdvanceDecreaseMinor)}. Every consumed portion must already be released.`,
    ...r.lines.map(
      (l) =>
        `${l.code} ${l.accountName}: debit ${money(l.debitMinor)}, credit ${money(l.creditMinor)}.`,
    ),
    r.kind === "ADVANCE"
      ? `The original recorded money account balance increases by ${money(r.recordedMoneyIncreaseMinor)}. This does not recover money from the supplier.`
      : "Opening balance correction does not change a money account.",
    `Correction date: ${r.effectiveAt} (UTC). Reason: ${r.reason}.`,
    "No refund, recovery, transfer, automatic allocation release, purchase cost change or physical stock movement is performed.",
  ]
}
async function execute(
  ctx: GeneralTransactionContext,
  p: Action,
  key: string,
  value?: Awaited<ReturnType<typeof prepared>>,
) {
  const result = value ?? (await prepared(ctx, p))
  await result.execute(key)
  return {
    kind: "finance_supplier" as const,
    recordId: result.review.supplierId,
    bookId: result.review.bookId,
    title: "Supplier entry reversed",
    detail: `${result.review.supplierName} · ${generalMoney(result.review.amountMinor, result.review.currencyCode)} original ${result.review.kind.toLowerCase().replaceAll("_", " ")} reversed. History retained; no money recovered or stock moved.`,
  }
}
export const supplierEntryReverse = {
  stale:
    "The original supplier entry, accounts, allocation history or posting period changed. Review again.",
  unavailable: "This supplier entry cannot be reversed now.",
  async validate(ctx, p) {
    return (await current(ctx, p)).target
  },
  async review(ctx, p) {
    const value = await current(ctx, p)
    return {
      target: value.target,
      lines: supplierEntryReversalReviewLines(value.review),
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
