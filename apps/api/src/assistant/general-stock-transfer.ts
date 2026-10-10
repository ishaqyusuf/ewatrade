import type { GeneralAction, GeneralReceipt } from "@ewatrade/assistant/general/contracts"
import {
  createAndDispatchStockTransferInTransaction,
  lockStockTransferReview,
  getStockTransferLockScope,
  previewStockTransferDispatch,
  previewStockTransferTransition,
  receiveOrCancelStockTransferInTransaction,
} from "@ewatrade/db/queries"
import {
  inventoryDispatchTransferSchema,
  inventoryTransitionTransferSchema,
} from "../schemas/inventory"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { assertGeneralTransferAccess } from "./general-transfer-access"
import { proposalDigest } from "./proposal-security"

type Dispatch = Extract<GeneralAction, { action: "stock_transfer_dispatch" }>
type Receive = Extract<GeneralAction, { action: "stock_transfer_receive" }>
type Cancel = Extract<GeneralAction, { action: "stock_transfer_cancel" }>
const stale =
  "Transfer stock or its history changed. Review a fresh proposal before confirming."
const unavailable =
  "This transfer is unavailable. Check its status and inventory access to both Stores."
const financialNote = (sourceCurrency: string, targetCurrency: string) =>
  sourceCurrency === targetCurrency
    ? "Stock carrying value follows the saved transfer records. Unknown cost is not invented."
    : "These Stores use different currencies. This changes physical stock only; no currency conversion or transfer valuation is posted."

async function dispatchReview(
  ctx: GeneralTransactionContext,
  payload: Dispatch,
) {
  const scope = requireGeneralScope(ctx)
  const review = await previewStockTransferDispatch(ctx.db, {
    ...scope,
    ...payload,
    allowedStoreIds: ctx.tenantContext.stores.map((store) => store.id),
  })
  assertGeneralTransferAccess(ctx.tenantContext, {
    sourceStoreId: review.sourceStore.id,
    targetStoreId: review.targetStore.id,
    stage: "dispatch",
  })
  return {
    scope,
    review,
    target: {
      id: review.sourceBalanceSourceId,
      revision: proposalDigest(review),
    },
  }
}
export const stockTransferDispatch: GeneralActionAdapter<Dispatch> = {
  stale,
  unavailable,
  async validate(ctx, payload, lock) {
    return (
      lock
        ? await lockedDispatchReview(ctx, payload)
        : await dispatchReview(ctx, payload)
    ).target
  },
  async prepareExecution(ctx, payload) {
    const current = await lockedDispatchReview(ctx, payload)
    return {
      target: current.target,
      execute: (key) => executeDispatch(ctx, payload, key, current),
    }
  },
  async review(ctx, payload) {
    const { review: r, target } = await dispatchReview(ctx, payload)
    return {
      target,
      lines: [
        `Send ${r.quantity} ${r.unitName}: ${r.sourceStore.name} → ${r.targetStore.name}.`,
        `${r.productName} · ${r.variantName} · factor ${r.factor} · canonical quantity ${r.canonicalQuantity}.`,
        `Source stock ${r.before} → ${r.after}; reserved ${r.reserved}; available after ${r.availableAfter}.`,
        `In transit after dispatch: ${r.inTransitAfter} ${r.unitName}. Destination stock stays unchanged until receipt is separately confirmed at ${r.targetStore.name}.`,
        financialNote(r.sourceStore.currencyCode, r.targetStore.currencyCode),
        `Reason: ${payload.reason}`,
      ],
    }
  },
  execute: executeDispatch,
}
async function executeDispatch(
  ctx: GeneralTransactionContext,
  payload: Dispatch,
  key: string,
  current?: Awaited<ReturnType<typeof dispatchReview>>,
): Promise<GeneralReceipt> {
  const { scope, review: r } = current ?? (await dispatchReview(ctx, payload))
  const parsed = inventoryDispatchTransferSchema.parse({
    clientOperationId: key,
    clientTransferId: key,
    expectedSourceRevision: r.revision,
    quantity: r.quantity,
    reason: payload.reason,
    schemaVersion: 1,
    source: "assistant",
    sourceBalanceSourceId: r.sourceBalanceSourceId,
    targetStoreId: r.targetStore.id,
  })
  const result = await createAndDispatchStockTransferInTransaction(ctx.db, {
    ...parsed,
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
  })
  return {
    kind: "stock_transfer",
    recordId: result.id,
    title: "Stock dispatched",
    detail: `${r.quantity} ${r.unitName} in transit to ${r.targetStore.name}. Destination receipt is still required.`,
  }
}
async function transitionReview(
  ctx: GeneralTransactionContext,
  payload: Receive | Cancel,
) {
  const scope = requireGeneralScope(ctx)
  const transition =
    payload.action === "stock_transfer_receive" ? "receive" : "cancel"
  const review = await previewStockTransferTransition(ctx.db, {
    ...scope,
    transferId: payload.transferId,
    transition,
    quantity:
      payload.action === "stock_transfer_receive"
        ? payload.quantity
        : undefined,
    allowedStoreIds: ctx.tenantContext.stores.map((store) => store.id),
  })
  assertGeneralTransferAccess(ctx.tenantContext, {
    sourceStoreId: review.sourceStore.id,
    targetStoreId: review.targetStore.id,
    stage: transition,
  })
  return {
    scope,
    transition,
    review,
    target: { id: review.id, revision: proposalDigest(review) },
  }
}
function transitionAdapter<
  A extends Receive | Cancel,
>(): GeneralActionAdapter<A> {
  return {
    stale,
    unavailable,
    async validate(ctx, payload, lock) {
      return (
        lock
          ? await lockedTransitionReview(ctx, payload)
          : await transitionReview(ctx, payload)
      ).target
    },
    async prepareExecution(ctx, payload) {
      const current = await lockedTransitionReview(ctx, payload)
      return {
        target: current.target,
        execute: (key) => executeTransition(ctx, payload, key, current),
      }
    },
    async review(ctx, payload) {
      const {
        review: r,
        target,
        transition,
      } = await transitionReview(ctx, payload)
      const receiving = transition === "receive"
      return {
        target,
        lines: [
          `${receiving ? "Acknowledge receipt of" : "Return remaining"} ${r.plan.quantity} ${r.unitName} at ${receiving ? r.targetStore.name : r.sourceStore.name}.`,
          `${r.productName} · ${r.variantName} · ${r.sourceStore.name} → ${r.targetStore.name}. Originally dispatched ${r.dispatchedQuantity} ${r.unitName}.`,
          `In transit ${r.plan.remainingBefore} → ${r.plan.remainingAfter}; stock at ${receiving ? r.targetStore.name : r.sourceStore.name} ${r.targetBefore} → ${r.targetAfter}; reserved ${r.targetReserved}.`,
          receiving
            ? "Confirm only the quantity actually received. Any outstanding quantity stays in transit with its history preserved."
            : "Return all remaining transit stock. Earlier receipts and their evidence stay recorded.",
          ...r.acknowledgments.map(
            (ack) =>
              `${ack.kind === "RECEIVE" ? "Earlier receipt" : "Earlier return"}: ${ack.quantity} ${r.unitName}; remaining ${ack.remainingAfter}; ${ack.reason}.`,
          ),
          ...(r.acknowledgmentHistoryLimited
            ? ["Only the first 100 acknowledgment records are shown."]
            : []),
          financialNote(r.sourceStore.currencyCode, r.targetStore.currencyCode),
          `Reason: ${payload.reason}`,
        ],
      }
    },
    execute: executeTransition,
  }
}
export const stockTransferReceive = transitionAdapter<Receive>()
export const stockTransferCancel = transitionAdapter<Cancel>()

async function executeTransition(
  ctx: GeneralTransactionContext,
  payload: Receive | Cancel,
  key: string,
  current?: Awaited<ReturnType<typeof transitionReview>>,
): Promise<GeneralReceipt> {
  const {
    scope,
    review: r,
    transition,
  } = current ?? (await transitionReview(ctx, payload))
  const parsed = inventoryTransitionTransferSchema.parse({
    clientOperationId: key,
    expectedTransitRevision: r.transit!.revision,
    quantity: r.plan.quantity,
    reason: payload.reason,
    schemaVersion: 1,
    source: "assistant",
    transferId: r.id,
    transition,
  })
  await receiveOrCancelStockTransferInTransaction(ctx.db, {
    ...parsed,
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
  })
  return {
    kind: "stock_transfer",
    recordId: r.id,
    title:
      transition === "receive"
        ? "Transfer receipt saved"
        : "Remaining transit stock returned",
    detail: `${r.plan.quantity} ${r.unitName} ${transition === "receive" ? "received" : "returned"}; ${r.plan.remainingAfter} still in transit.`,
  }
}

async function lockedDispatchReview(
  ctx: GeneralTransactionContext,
  payload: Dispatch,
) {
  const scope = requireGeneralScope(ctx)
  assertGeneralTransferAccess(ctx.tenantContext, {
    sourceStoreId: scope.storeId,
    targetStoreId: payload.targetStoreId,
    stage: "dispatch",
  })
  await lockStockTransferReview(ctx.db, {
    tenantId: scope.tenantId,
    sourceStoreId: scope.storeId,
    targetStoreId: payload.targetStoreId,
    balanceSourceIds: [payload.sourceBalanceSourceId],
  })
  return dispatchReview(ctx, payload)
}
async function lockedTransitionReview(
  ctx: GeneralTransactionContext,
  payload: Receive | Cancel,
) {
  const scope = requireGeneralScope(ctx)
  const lockScope = await getStockTransferLockScope(ctx.db, {
    ...scope,
    transferId: payload.transferId,
    allowedStoreIds: ctx.tenantContext.stores.map((store) => store.id),
  })
  assertGeneralTransferAccess(ctx.tenantContext, {
    sourceStoreId: lockScope.sourceStoreId,
    targetStoreId: lockScope.targetStoreId,
    stage: payload.action === "stock_transfer_receive" ? "receive" : "cancel",
  })
  await lockStockTransferReview(ctx.db, lockScope)
  return transitionReview(ctx, payload)
}
