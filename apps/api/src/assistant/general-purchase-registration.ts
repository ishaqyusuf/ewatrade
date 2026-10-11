import { createHash } from "node:crypto"
import { generalMoney, type GeneralAction } from "@ewatrade/assistant/general/contracts"
import { getFinancePurchaseRegistrationReview, registerFinancePurchaseInTransaction } from "@ewatrade/db/queries"
import type { GeneralActionAdapter, GeneralTransactionContext } from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { assertFinanceAccess } from "../trpc/finance-procedure"
type Action = Extract<GeneralAction, { action: "purchase_register" }>
async function current(ctx: GeneralTransactionContext, payload: Action) {
  const scope = requireGeneralScope(ctx)
  assertFinanceAccess(ctx.tenantContext)
  const input = { tenantId: scope.tenantId, actorUserId: scope.userId, storeId: scope.storeId,
    bookId: payload.bookId, supplierId: payload.supplierId, description: payload.description,
    agreedAt: new Date(payload.agreedAt), lines: payload.lines }
  const review = await getFinancePurchaseRegistrationReview(ctx.db, input)
  return { input, review, target: { id: review.supplierId, revision: createHash("sha256").update(JSON.stringify(review)).digest("hex") } }
}
async function execute(ctx: GeneralTransactionContext, payload: Action, key: string, prepared?: Awaited<ReturnType<typeof current>>) {
  const { input, review } = prepared ?? await current(ctx, payload)
  const record = await registerFinancePurchaseInTransaction(ctx.db, { ...input, clientCommandId: key })
  return { kind: "finance_purchase_registration" as const, recordId: record.id, bookId: review.bookId,
    title: "Purchase agreement registered",
    detail: `${review.supplierName} · ${generalMoney(review.totalMinor,review.currencyCode)} agreed. No payable, payment, ownership or stock receipt recorded.` }
}
export const purchaseRegister = {
  stale: "Purchase agreement scope, supplier or goods configuration changed. Review again.",
  unavailable: "This purchase agreement cannot be registered now.",
  async validate(ctx,payload) { return (await current(ctx,payload)).target },
  async review(ctx,payload) {
    const { review, target } = await current(ctx,payload)
    return { target, lines: [
      `Register agreement with ${review.supplierName} (${review.supplierCode}): ${review.description}.`,
      ...review.lines.map(line => `${line.description}: ${line.enteredQuantity} ${line.enteredUnitName} · ${generalMoney(line.amountMinor,review.currencyCode)} total agreed cost.`),
      `Agreed total: ${generalMoney(review.totalMinor,review.currencyCode)} · ${review.agreedAt} (UTC).`,
      "Active Store only. This records an agreement, not an invoice, payment, ownership or physical receipt. No payable or stock is created.",
    ] }
  },
  async prepareExecution(ctx,payload) { const prepared = await current(ctx,payload); return { target: prepared.target, execute: key => execute(ctx,payload,key,prepared) } },
  execute,
} satisfies GeneralActionAdapter<Action>
