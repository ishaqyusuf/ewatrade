import { generalMoney } from "@ewatrade/assistant/general/contracts"
import type {
  GeneralAction,
  GeneralReceipt,
} from "@ewatrade/assistant/general/contracts"
import {
  amendCommercialOrderMetadataInTransaction,
  cancelCommercialOrderInTransaction,
  prepareCommercialOrderReplacementInTransaction,
  prepareCommercialOrderCancellationInTransaction,
  previewCommercialOrderCancellation,
  previewCommercialOrderMetadataAmendment,
  previewCommercialOrderReplacement,
  replaceCommercialOrderInTransaction,
} from "@ewatrade/db/queries"
import { z } from "zod"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { conflict } from "./general-actions"
import { requireGeneralScope } from "./general-context"
type Action = Extract<
  GeneralAction,
  { action: "order_cancel" | "order_metadata_update" | "order_replace" }
>
async function review(ctx: GeneralTransactionContext, payload: Action) {
  const scope = requireGeneralScope(ctx)
  const input = {
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    orderId: payload.orderId,
  }
  const result =
    payload.action === "order_cancel"
      ? await previewCommercialOrderCancellation(ctx.db, input)
      : payload.action === "order_metadata_update"
        ? await previewCommercialOrderMetadataAmendment(ctx.db, {
            ...input,
            patch: payload.patch,
          })
        : await previewCommercialOrderReplacement(ctx.db, {
            ...input,
            changes: payload.changes,
          })
  if (!result.eligible)
    throw conflict(
      result.blockers.map((row) => row.reason).join(" ") ||
        "This order cannot be amended through this workflow.",
    )
  const named = z
    .object({
      lines: z.array(
        z.object({
          id: z.string(),
          snapshot: z
            .object({ catalogItemName: z.string(), offeringName: z.string() })
            .nullable(),
        }),
      ),
    })
    .safeParse(result.beforeSnapshot)
  const labels = new Map(
    named.success
      ? named.data.lines.map(
          (line) =>
            [
              line.id,
              line.snapshot
                ? `${line.snapshot.catalogItemName} · ${line.snapshot.offeringName}`
                : "Order item",
            ] as const,
        )
      : [],
  )
  const lines = [`Order ${result.orderNumber}`, `Reason: ${payload.reason}`]
  if ("releases" in result)
    lines.push(
      "Cancel this unpaid, unfulfilled order.",
      ...result.releases.map(
        (row) =>
          `Release ${row.quantity} ${row.unitName} of reserved stock for ${labels.get(row.orderLineId) ?? "order item"}.`,
      ),
      "No stock leaves the Store and no refund is recorded.",
    )
  else if ("after" in result) {
    if (result.changedFields.includes("customerId"))
      lines.push(
        `Saved customer: ${result.before.customerName ?? "Walk-in"} (${result.before.customerId ?? "none"}) → ${result.after.customerName ?? "Walk-in"} (${result.after.customerId ?? "none"}).`,
      )
    const fieldLabels = {
      customerId: "Saved customer",
      customerName: "Customer name",
      customerPhone: "Customer phone",
      customerEmail: "Customer email",
      deliveryDueAt: "Delivery date",
      notes: "Notes",
    }
    for (const field of result.changedFields.filter(
      (field) => field !== "customerId",
    ))
      lines.push(
        `${fieldLabels[field]}: ${result.before[field] ?? "None"} → ${result.after[field] ?? "None"}`,
      )
    lines.push(
      "Order totals, line snapshots, stock and payments stay unchanged.",
    )
  } else {
    const currency = ctx.tenantContext.activeStore?.currencyCode ?? ""
    lines.push(
      `Original total ${generalMoney(result.terms.originalTotalMinor, currency)} → replacement ${generalMoney(result.terms.totalMinor, currency)}.`,
    )
    lines.push(
      ...result.terms.lines.map(
        (row) =>
          `${labels.get(row.orderLineId) ?? "Order item"}: quantity ${row.originalQuantity} → ${row.quantity}; item total ${generalMoney(row.originalTotalMinor, currency)} → ${generalMoney(row.totalMinor, currency)}.`,
      ),
    )
    lines.push(
      ...result.reservationChanges.map(
        (row, index) =>
          `Reserved stock ${row.releaseQuantity} → ${row.replacementQuantity} ${row.unitName} at stock source ${index + 1}.`,
      ),
      "The original order will be cancelled and linked to a new order. Original snapshots remain in history. No payment or stock movement is recorded.",
    )
  }
  return {
    scope,
    lines,
    target: { id: result.orderId, revision: result.reviewDigest },
  }
}
async function execute(
  ctx: GeneralTransactionContext,
  payload: Action,
  key: string,
  current: Awaited<ReturnType<typeof review>>,
): Promise<GeneralReceipt> {
  const input = {
    tenantId: current.scope.tenantId,
    storeId: current.scope.storeId,
    orderId: payload.orderId,
    actorUserId: current.scope.userId,
    clientOperationId: key,
    expectedReviewDigest: current.target.revision,
    reason: payload.reason,
  }
  const saved =
    payload.action === "order_cancel"
      ? await cancelCommercialOrderInTransaction(ctx.db, input)
      : payload.action === "order_metadata_update"
        ? await amendCommercialOrderMetadataInTransaction(ctx.db, {
            ...input,
            patch: payload.patch,
          })
        : await replaceCommercialOrderInTransaction(ctx.db, {
            ...input,
            changes: payload.changes,
          })
  return receipt(payload, saved)
}
function receipt(
  payload: Action,
  saved: Awaited<ReturnType<typeof replaceCommercialOrderInTransaction>>,
): GeneralReceipt {
  return {
    kind: "order",
    recordId: saved.replacementOrderId ?? saved.orderId,
    title:
      payload.action === "order_cancel"
        ? "Order cancelled"
        : payload.action === "order_replace"
          ? "Replacement order saved"
          : "Order details updated",
    detail:
      payload.action === "order_replace"
        ? "The original order and its snapshots are preserved. Open the linked replacement order."
        : payload.action === "order_cancel"
          ? "Remaining reservations were released. No refund was recorded."
          : "The reviewed details were saved without changing order totals or stock.",
  }
}
function adapter<A extends Action>(): GeneralActionAdapter<A> {
  return {
    stale:
      "Order details, ownership or stock changed. Review a fresh proposal.",
    unavailable:
      "This order needs another workflow or is unavailable in the current Store.",
    validate: async (ctx, payload) => (await review(ctx, payload)).target,
    review: async (ctx, payload) => review(ctx, payload),
    prepareExecution: async (ctx, payload, command) => {
      if (payload.action === "order_replace") {
        const scope = requireGeneralScope(ctx)
        const prepared = await prepareCommercialOrderReplacementInTransaction(
          ctx.db,
          {
            tenantId: scope.tenantId,
            storeId: scope.storeId,
            orderId: payload.orderId,
            actorUserId: scope.userId,
            reason: payload.reason,
            changes: payload.changes,
            ...command,
          },
        )
        return {
          target: prepared.target,
          execute: async () => receipt(payload, await prepared.execute()),
        }
      }
      if (payload.action === "order_cancel") {
        const scope = requireGeneralScope(ctx)
        const prepared = await prepareCommercialOrderCancellationInTransaction(
          ctx.db,
          {
            tenantId: scope.tenantId,
            storeId: scope.storeId,
            orderId: payload.orderId,
            actorUserId: scope.userId,
            reason: payload.reason,
            ...command,
          },
        )
        return {
          target: prepared.target,
          execute: async () => receipt(payload, await prepared.execute()),
        }
      }
      const current = await review(ctx, payload)
      return {
        target: current.target,
        execute: (key) => execute(ctx, payload, key, current),
      }
    },
    execute: async (ctx, payload, key) =>
      execute(ctx, payload, key, await review(ctx, payload)),
  }
}
export const orderCancel =
  adapter<Extract<Action, { action: "order_cancel" }>>()
export const orderMetadataUpdate =
  adapter<Extract<Action, { action: "order_metadata_update" }>>()
export const orderReplace =
  adapter<Extract<Action, { action: "order_replace" }>>()
