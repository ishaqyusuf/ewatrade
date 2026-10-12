import { createHash } from "node:crypto"
import {
  generalMoney,
  type GeneralAction,
} from "@ewatrade/assistant/general/contracts"
import {
  getFinanceSupplierOpeningReview,
  prepareReviewedFinanceSupplierOpeningInTransaction,
} from "@ewatrade/db/queries"
import { assertFinanceAccess } from "../trpc/finance-procedure"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
type Action = Extract<GeneralAction, { action: "supplier_opening" }>
type Review = Awaited<ReturnType<typeof getFinanceSupplierOpeningReview>>
function inputFor(ctx: GeneralTransactionContext, p: Action) {
  const scope = requireGeneralScope(ctx)
  assertFinanceAccess(ctx.tenantContext)
  return {
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
    bookId: p.bookId,
    supplierId: p.supplierId,
    kind: p.kind,
    amountMinor: p.amountMinor,
    description: p.description,
  }
}
function target(r: Review) {
  return {
    id: r.supplierId,
    revision: createHash("sha256").update(JSON.stringify(r)).digest("hex"),
  }
}
async function current(ctx: GeneralTransactionContext, p: Action) {
  const review = await getFinanceSupplierOpeningReview(ctx.db, inputFor(ctx, p))
  return { review, target: target(review) }
}
async function prepared(ctx: GeneralTransactionContext, p: Action) {
  const value = await prepareReviewedFinanceSupplierOpeningInTransaction(
    ctx.db,
    inputFor(ctx, p),
  )
  return { ...value, target: target(value.review) }
}
export function supplierOpeningReviewLines(r: Review) {
  const money = (v: string) => generalMoney(v, r.currencyCode)
  return [
    `Record an opening ${r.kind.toLowerCase()} for ${r.supplierName} (${r.supplierCode}) · ${money(r.amountMinor)}.`,
    `Bookkeeping start date: ${r.effectiveAt} (UTC). The opening must use this date.`,
    r.kind === "PAYABLE"
      ? `Supplier payable increases by ${money(r.payableIncreaseMinor)}; unallocated advance is unchanged.`
      : `Unallocated supplier advance increases by ${money(r.unallocatedAdvanceIncreaseMinor)}; payable is unchanged.`,
    ...r.lines.map(
      (l) =>
        `${l.code} ${l.accountName}: debit ${money(l.debitMinor)}, credit ${money(l.creditMinor)}.`,
    ),
    `Description: ${r.description}.`,
    "Only one opening of this kind is allowed, including reversed history. This records a pre-existing balance; no money account, transfer, invoice payment, purchase cost or stock movement is created.",
  ]
}
async function execute(
  ctx: GeneralTransactionContext,
  p: Action,
  key: string,
  value?: Awaited<ReturnType<typeof prepared>>,
) {
  const v = value ?? (await prepared(ctx, p))
  await v.execute(key)
  return {
    kind: "finance_supplier" as const,
    recordId: v.review.supplierId,
    bookId: v.review.bookId,
    title: "Supplier opening recorded",
    detail: `${v.review.supplierName} · ${generalMoney(v.review.amountMinor, v.review.currencyCode)} opening ${v.review.kind.toLowerCase()} at the Book start. No money sent or stock moved.`,
  }
}
export const supplierOpening = {
  stale:
    "The supplier, opening history, control accounts or Book start/period changed. Review again.",
  unavailable: "This supplier opening cannot be recorded now.",
  async validate(ctx, p) {
    return (await current(ctx, p)).target
  },
  async review(ctx, p) {
    const v = await current(ctx, p)
    return { target: v.target, lines: supplierOpeningReviewLines(v.review) }
  },
  async prepareExecution(ctx, p) {
    const v = await prepared(ctx, p)
    return { target: v.target, execute: (key) => execute(ctx, p, key, v) }
  },
  execute,
} satisfies GeneralActionAdapter<Action>
