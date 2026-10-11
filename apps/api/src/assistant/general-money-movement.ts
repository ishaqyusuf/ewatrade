import { createHash } from "node:crypto"
import { z } from "zod"
import {
  generalMoney,
  type GeneralAction,
} from "@ewatrade/assistant/general/contracts"
import {
  getFinanceMoneyMovementReview,
  recordFinanceMoneyMovementInTransaction,
  type FinanceMoneyInput,
} from "@ewatrade/db/queries"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { assertFinanceAccess } from "../trpc/finance-procedure"
type Action = Extract<GeneralAction, { action: "money_movement" }>
async function current(ctx: GeneralTransactionContext, payload: Action) {
  const scope = requireGeneralScope(ctx)
  assertFinanceAccess(ctx.tenantContext)
  const base = {
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
    storeId: scope.storeId,
    bookId: payload.bookId,
    accountId: payload.accountId,
    amountMinor: payload.amountMinor,
    description: payload.description,
    effectiveAt: new Date(payload.effectiveAt),
  }
  if (payload.kind === "TRANSFER" && !payload.destinationAccountId)
    throw Error("Choose a destination account.")
  const input =
    payload.kind === "TRANSFER"
      ? {
          ...base,
          kind: payload.kind,
          destinationAccountId: payload.destinationAccountId!,
        }
      : { ...base, kind: payload.kind }
  const review = await getFinanceMoneyMovementReview(ctx.db, input)
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
export function moneyMovementReviewLines(
  review: Awaited<ReturnType<typeof getFinanceMoneyMovementReview>>,
) {
  return [
    `Record ${generalMoney(review.amountMinor, review.currencyCode)} · ${review.kind.toLowerCase().replaceAll("_", " ")}.`,
    review.kind === "TRANSFER"
      ? `From ${review.accountName} to ${review.oppositeAccountName}.`
      : review.kind === "OWNER_CONTRIBUTION"
        ? `Owner funds received into ${review.accountName}.`
        : `Owner funds taken from ${review.accountName}.`,
    `Posting date: ${review.effectiveAt} (UTC).`,
    `Description: ${review.description}`,
    "This records a movement that already happened. The assistant does not transfer money or verify bank settlement.",
  ]
}
async function execute(
  ctx: GeneralTransactionContext,
  payload: Action,
  key: string,
  prepared?: Awaited<ReturnType<typeof current>>,
) {
  const { input, review } = prepared ?? (await current(ctx, payload))
  const result = await recordFinanceMoneyMovementInTransaction(ctx.db, {
    ...input,
    clientCommandId: key,
  } satisfies FinanceMoneyInput)
  const receipt = z.object({ entryId: z.string().min(1) }).parse(result)
  return {
    kind: "finance_movement" as const,
    recordId: receipt.entryId,
    bookId: review.bookId,
    title: "Money movement recorded",
    detail: `${generalMoney(review.amountMinor, review.currencyCode)} recorded. No money was transferred by the assistant.`,
  }
}
export const moneyMovement = {
  stale: "Money accounts or posting period changed. Review the movement again.",
  unavailable: "This money movement cannot be recorded now.",
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
    return { target, lines: moneyMovementReviewLines(review) }
  },
  execute,
} satisfies GeneralActionAdapter<Action>
