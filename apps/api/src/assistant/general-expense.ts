import { createHash } from "node:crypto"
import {
  generalMoney,
  type GeneralAction,
} from "@ewatrade/assistant/general/contracts"
import {
  getFinanceExpenseReview,
  recordFinanceExpenseInTransaction,
  type FinanceExpenseInput,
} from "@ewatrade/db/queries"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { assertFinanceAccess } from "../trpc/finance-procedure"
type Action = Extract<GeneralAction, { action: "expense_record" }>
async function current(ctx: GeneralTransactionContext, payload: Action) {
  const scope = requireGeneralScope(ctx)
  assertFinanceAccess(ctx.tenantContext)
  const payment = payload.payment
  const input: Omit<FinanceExpenseInput, "clientCommandId"> = {
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
    storeId: scope.storeId,
    bookId: payload.bookId,
    payeeName: payload.payeeName,
    description: payload.description,
    reference: payload.reference,
    incurredAt: new Date(payload.incurredAt),
    dueAt: payload.dueAt ? new Date(payload.dueAt) : undefined,
    lines: payload.lines,
    payment: payment
      ? {
          amountMinor: payment.amountMinor,
          effectiveAt: new Date(payment.effectiveAt),
          reference: payment.reference,
          ...(payment.funding === "OWNER_CAPITAL"
            ? { funding: "OWNER_CAPITAL" as const }
            : {
                funding: "BUSINESS_ACCOUNT" as const,
                accountId: payment.accountId,
              }),
        }
      : undefined,
  }
  const review = await getFinanceExpenseReview(ctx.db, input)
  return {
    input,
    review,
    target: {
      id: review.bookId,
      revision: createHash("sha256")
        .update(JSON.stringify(review))
        .digest("hex"),
    },
  }
}
export function expenseReviewLines(
  review: Awaited<ReturnType<typeof getFinanceExpenseReview>>,
) {
  const money = (value: string) => generalMoney(value, review.currencyCode)
  return [
    `Record expense for ${review.payeeName}: ${money(review.totalMinor)}.`,
    ...review.lines.map(
      (line) =>
        `${line.accountName}: ${money(line.amountMinor)} · ${line.description}`,
    ),
    `Incurred: ${review.incurredAt} (UTC).${review.dueAt ? ` Due: ${review.dueAt} (UTC).` : ""}`,
    `Description: ${review.description}${review.reference ? ` · Reference: ${review.reference}` : ""}`,
    review.payment
      ? `Already paid ${money(review.payment.amountMinor)} from ${review.payment.accountName}${review.payment.funding === "OWNER_CAPITAL" ? " (owner funds)" : ""} on ${review.payment.effectiveAt} (UTC).${review.payment.reference ? ` Reference: ${review.payment.reference}` : ""}`
      : "No payment recorded.",
    `Remaining payable: ${money(review.outstandingMinor)}.`,
    "This records an incurred expense and any payment already made. The assistant does not send money.",
  ]
}
async function execute(
  ctx: GeneralTransactionContext,
  payload: Action,
  key: string,
  prepared?: Awaited<ReturnType<typeof current>>,
) {
  const { input, review } = prepared ?? (await current(ctx, payload))
  const result = await recordFinanceExpenseInTransaction(ctx.db, {
    ...input,
    clientCommandId: key,
  })
  return {
    kind: "finance_bill" as const,
    recordId: result.id,
    bookId: review.bookId,
    title: "Expense recorded",
    detail: `${generalMoney(review.totalMinor, review.currencyCode)} expense; ${generalMoney(review.outstandingMinor, review.currencyCode)} remains payable. No money was sent.`,
  }
}
export const expenseRecord = {
  stale:
    "Expense categories, payment accounts or posting period changed. Review again.",
  unavailable: "This expense cannot be recorded now.",
  async validate(ctx, payload) {
    return (await current(ctx, payload)).target
  },
  async review(ctx, payload) {
    const { review, target } = await current(ctx, payload)
    return { target, lines: expenseReviewLines(review) }
  },
  async prepareExecution(ctx, payload) {
    const prepared = await current(ctx, payload)
    return {
      target: prepared.target,
      execute: (key) => execute(ctx, payload, key, prepared),
    }
  },
  execute,
} satisfies GeneralActionAdapter<Action>
