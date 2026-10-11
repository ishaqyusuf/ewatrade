import { createHash } from "node:crypto"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import { createFinanceSupplierInTransaction, getFinanceSupplierCreationReview } from "@ewatrade/db/queries"
import type { GeneralActionAdapter, GeneralTransactionContext } from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { assertFinanceAccess } from "../trpc/finance-procedure"

type Action = Extract<GeneralAction, { action: "supplier_create" }>
async function current(ctx: GeneralTransactionContext, payload: Action) {
  const scope = requireGeneralScope(ctx)
  assertFinanceAccess(ctx.tenantContext)
  const input = {
    tenantId: scope.tenantId, actorUserId: scope.userId,
    bookId: payload.bookId, code: payload.code, name: payload.name,
  }
  const review = await getFinanceSupplierCreationReview(ctx.db, input)
  return { input, review, target: {
    id: review.bookId,
    revision: createHash("sha256").update(JSON.stringify(review)).digest("hex"),
  } }
}
async function execute(ctx: GeneralTransactionContext, payload: Action, key: string,
  prepared?: Awaited<ReturnType<typeof current>>) {
  const { input, review } = prepared ?? await current(ctx, payload)
  const supplier = await createFinanceSupplierInTransaction(ctx.db, { ...input, clientCommandId: key })
  return {
    kind: "finance_supplier" as const, recordId: supplier.id, bookId: review.bookId,
    title: "Supplier created",
    detail: `${review.name} (${review.code}). No opening balance, purchase, stock receipt or payment was recorded.`,
  }
}
export const supplierCreate = {
  stale: "Supplier identity or Finance Book changed. Review again.",
  unavailable: "This supplier cannot be created now.",
  async validate(ctx, payload) { return (await current(ctx, payload)).target },
  async review(ctx, payload) {
    const { review, target } = await current(ctx, payload)
    return { target, lines: [
      `Create supplier: ${review.name} (${review.code}).`,
      `Finance Book: ${review.bookId} · ${review.currencyCode}.`,
      "Starts with no payable or advance balance. Purchases, opening balances, payments and stock receipts are separate operations.",
    ] }
  },
  async prepareExecution(ctx, payload) {
    const prepared = await current(ctx, payload)
    return { target: prepared.target, execute: (key) => execute(ctx, payload, key, prepared) }
  },
  execute,
} satisfies GeneralActionAdapter<Action>
