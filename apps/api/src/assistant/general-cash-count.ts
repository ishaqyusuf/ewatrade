import { createHash } from "node:crypto"
import { generalMoney } from "@ewatrade/assistant/general/contracts"
import {
  type GeneralCashCountAction,
  cashCountAction,
} from "@ewatrade/assistant/general/contracts"
import {
  getFinanceCashCountInTransaction,
  getFinanceCashCountReviewInTransaction,
  recordFinanceCashCountInTransaction,
} from "@ewatrade/db/queries"
import { assertFinanceAccess } from "../trpc/finance-procedure"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"

async function current(
  ctx: GeneralTransactionContext,
  raw: GeneralCashCountAction,
) {
  const payload = cashCountAction.parse(raw)
  const scope = requireGeneralScope(ctx)
  assertFinanceAccess(ctx.tenantContext)
  if (
    !(await ctx.db.store.findFirst({
      where: { id: scope.storeId, tenantId: scope.tenantId, status: "ACTIVE" },
      select: { id: true },
    }))
  )
    throw new Error("The selected Store is no longer available.")
  const input = {
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
    bookId: payload.bookId,
    accountId: payload.accountId,
    asOf: new Date(payload.asOf),
    observedBalanceMinor: payload.observedBalanceMinor,
    reference: payload.reference,
  }
  const review = await getFinanceCashCountReviewInTransaction(ctx.db, input)
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

export function cashCountReviewLines(
  review: Awaited<ReturnType<typeof getFinanceCashCountReviewInTransaction>>,
) {
  const money = (value: string) => generalMoney(value, review.currencyCode)
  return [
    `Cash count · ${review.accountName} (${review.accountCode}) · current business Finance Book · ${review.currencyCode}.`,
    `Count time: ${review.asOf} (UTC). Reference: ${review.reference}.`,
    `Posted balance at snapshot ${review.snapshotSequence}: ${money(review.expectedBalanceMinor)}.`,
    `Cash physically counted: ${money(review.observedBalanceMinor)}. Difference: ${money(review.differenceMinor)}.`,
    review.differenceMinor === "0"
      ? "This observation matches the posted balance at the count time. It does not certify complete reconciliation."
      : "The difference remains unresolved. Investigate missing or incorrect transactions separately.",
    "Confirmation saves this original observation only. No balancing journal, stock closeout, date lock or fiscal close is performed.",
  ]
}

async function execute(
  ctx: GeneralTransactionContext,
  payload: GeneralCashCountAction,
  key: string,
  prepared?: Awaited<ReturnType<typeof current>>,
) {
  const { input } = prepared ?? (await current(ctx, payload))
  const result = await recordFinanceCashCountInTransaction(ctx.db, {
    ...input,
    clientCommandId: key,
  })
  // Build the receipt from the immutable original result, including on native command replay.
  const original = await getFinanceCashCountInTransaction(ctx.db, {
    ...input,
    countId: result.id,
  })
  return {
    kind: "finance_cash_count" as const,
    recordId: original.id,
    bookId: original.bookId,
    title: "Cash count recorded",
    detail: `${generalMoney(original.observedBalanceMinor, original.currencyCode)} physically counted; original difference ${generalMoney(original.differenceMinor, original.currencyCode)}. No adjustment or close performed.`,
  }
}

/** Registered only by the coordinator's integration patch; model tools cannot invoke execute. */
export const cashCountRecord = {
  stale: "The cash account, Book or posted count basis changed. Review again.",
  unavailable: "This cash count cannot be recorded now.",
  async validate(
    ctx: GeneralTransactionContext,
    payload: GeneralCashCountAction,
  ) {
    return (await current(ctx, payload)).target
  },
  async review(
    ctx: GeneralTransactionContext,
    payload: GeneralCashCountAction,
  ) {
    const { review, target } = await current(ctx, payload)
    return { target, lines: cashCountReviewLines(review) }
  },
  async prepareExecution(
    ctx: GeneralTransactionContext,
    payload: GeneralCashCountAction,
  ) {
    const prepared = await current(ctx, payload)
    return {
      target: prepared.target,
      execute: (key: string) => execute(ctx, payload, key, prepared),
    }
  },
  execute,
} satisfies GeneralActionAdapter<GeneralCashCountAction>
