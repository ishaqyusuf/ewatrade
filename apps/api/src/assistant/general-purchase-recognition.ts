import { createHash } from "node:crypto"
import { generalMoney, type GeneralAction } from "@ewatrade/assistant/general/contracts"
import { getFinancePurchaseRecognitionReview, recognizeFinancePurchaseInTransaction } from "@ewatrade/db/queries"
import type { GeneralActionAdapter, GeneralTransactionContext } from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { assertFinanceAccess } from "../trpc/finance-procedure"

type Action = Extract<GeneralAction, { action: "purchase_recognize" }>
type Review = Awaited<ReturnType<typeof getFinancePurchaseRecognitionReview>>

async function current(ctx: GeneralTransactionContext, payload: Action) {
  const scope = requireGeneralScope(ctx)
  assertFinanceAccess(ctx.tenantContext)
  const input = {
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
    bookId: payload.bookId,
    recognitionId: payload.recognitionId,
    stage: payload.stage,
    effectiveAt: new Date(payload.effectiveAt),
    reference: payload.reference,
    ...(payload.invoiceAmountMinor !== undefined ? { invoiceAmountMinor: payload.invoiceAmountMinor } : {}),
    ...(payload.dueAt !== undefined ? { dueAt: new Date(payload.dueAt) } : {}),
  }
  const review = await getFinancePurchaseRecognitionReview(ctx.db, input)
  return { input, review, target: {
    id: review.recognitionId,
    revision: createHash("sha256").update(JSON.stringify(review)).digest("hex"),
  } }
}

export function purchaseRecognitionReviewLines(review: Review) {
  const money = (value: string) => generalMoney(value, review.currencyCode)
  const control = (account: Review["debit"]) =>
    `${account.code} ${account.accountName}${account.willCreate ? " (created on confirmation)" : ""}`
  return [
    `Record ${review.stage === "INVOICE" ? "supplier invoice" : "ownership of agreed goods"} for ${review.description}.`,
    `Recorded supplier: ${review.supplierName}. Store: ${review.storeName}.`,
    ...review.goods.map(line => `${line.description}: ${line.enteredQuantity} ${line.enteredUnitName} · ${money(line.amountMinor)} agreed cost.`),
    `Exact whole-agreement total: ${money(review.totalMinor)}. Supplier payable increases by ${money(review.payableIncreaseMinor)}.`,
    `Journal: debit ${control(review.debit)}; credit ${control(review.credit)} · ${money(review.totalMinor)} each.`,
    `Fact date: ${review.effectiveAt} (UTC). Reference: ${review.reference}.${review.dueAt ? ` Due: ${review.dueAt} (UTC).` : ""}`,
    `Previously recorded facts: ${review.priorEvents.length ? review.priorEvents.map(event => `${event.stage} · ${event.effectiveAt} (UTC)`).join("; ") : "none"}.`,
    review.stage === "INVOICE"
      ? "This creates one purchase invoice and payable. It does not declare ownership or record physical receipt, stock or payment."
      : "This records ownership using the existing agreed costs. It creates no new supplier payable, physical receipt, stock or payment.",
    "No money is sent. Cost differences and split deliveries require their own source workflow.",
  ]
}

async function execute(ctx: GeneralTransactionContext, payload: Action, key: string, prepared?: Awaited<ReturnType<typeof current>>) {
  const { input, review } = prepared ?? await current(ctx, payload)
  await recognizeFinancePurchaseInTransaction(ctx.db, { ...input, clientCommandId: key })
  return {
    kind: "finance_purchase_registration" as const,
    recordId: review.recognitionId,
    bookId: review.bookId,
    title: review.stage === "INVOICE" ? "Purchase invoice recognized" : "Purchase ownership recognized",
    detail: `${review.supplierName} · ${generalMoney(review.totalMinor, review.currencyCode)} · ${review.stage.toLowerCase()} recorded. No physical receipt, stock or payment recorded.`,
  }
}

export const purchaseRecognize = {
  stale: "Purchase facts, costs, Book, Store or posting accounts changed. Review again.",
  unavailable: "This purchase fact cannot be recognized now.",
  async validate(ctx, payload) { return (await current(ctx, payload)).target },
  async review(ctx, payload) {
    const { review, target } = await current(ctx, payload)
    return { target, lines: purchaseRecognitionReviewLines(review) }
  },
  async prepareExecution(ctx, payload) {
    const prepared = await current(ctx, payload)
    return { target: prepared.target, execute: key => execute(ctx, payload, key, prepared) }
  },
  execute,
} satisfies GeneralActionAdapter<Action>
