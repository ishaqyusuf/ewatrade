import { createHash } from "node:crypto"
import {
  generalMoney,
  type GeneralAction,
} from "@ewatrade/assistant/general/contracts"
import {
  getCustomerLedgerReceiptReview,
  recordCustomerLedgerReceiptInTransaction,
} from "@ewatrade/db/queries"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { assertFinanceAccess } from "../trpc/finance-procedure"
type ReceiptAction = Extract<GeneralAction, { action: "customer_receipt" }>
async function current(ctx: GeneralTransactionContext, payload: ReceiptAction) {
  const scope = requireGeneralScope(ctx)
  assertFinanceAccess(ctx.tenantContext)
  const input = {
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
    storeId: scope.storeId,
    bookId: payload.bookId,
    accountId: payload.accountId,
    moneyAccountId: payload.moneyAccountId,
    amountMinor: payload.amountMinor,
    method: payload.method,
    description: payload.description,
    reference: payload.reference,
  }
  const review = await getCustomerLedgerReceiptReview(ctx.db, input)
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
export function customerReceiptReviewLines(
  review: Awaited<ReturnType<typeof getCustomerLedgerReceiptReview>>,
  payload: Pick<ReceiptAction, "description" | "reference">,
) {
  const money = (amount: string) => generalMoney(amount, review.currencyCode)
  return [
    `Record ${money(review.amountMinor)} already received from ${review.customerName}.`,
    `Unallocated customer credit: ${money(review.availableBeforeMinor)} → ${money(review.availableAfterMinor)}.`,
    `Posted debt stays ${money(review.outstandingDebtMinor)}; this receipt does not apply credit to orders.`,
    `Received into ${review.moneyAccountName} · ${review.method.replaceAll("_", " ")}.`,
    "Recorded at confirmation time. This does not collect money, record an order payment or create opening debt. Do not record money already recorded as an order payment again.",
    `Description: ${payload.description}`,
    ...(payload.reference ? [`Reference: ${payload.reference}`] : []),
  ]
}
async function execute(
  ctx: GeneralTransactionContext,
  payload: ReceiptAction,
  key: string,
  prepared?: Awaited<ReturnType<typeof current>>,
) {
  const { input, review } = prepared ?? (await current(ctx, payload))
  await recordCustomerLedgerReceiptInTransaction(ctx.db, {
    ...input,
    clientCommandId: key,
    expectedRevision: review.accountRevision,
  })
  return {
    kind: "customer" as const,
    recordId: review.customerId,
    title: "Customer funds received recorded",
    detail: `${generalMoney(review.amountMinor, review.currencyCode)} recorded in ${review.moneyAccountName}. Unallocated credit: ${generalMoney(review.availableAfterMinor, review.currencyCode)}. No money was collected by the assistant; no order was settled.`,
  }
}
export const customerReceipt = {
  stale: "Customer funds or receipt account changed. Review the receipt again.",
  unavailable: "This customer receipt cannot be recorded now.",
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
    return { target, lines: customerReceiptReviewLines(review, payload) }
  },
  execute,
} satisfies GeneralActionAdapter<ReceiptAction>
