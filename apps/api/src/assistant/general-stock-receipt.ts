import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import {
  lockInventorySourcesForReview,
  postOrdinaryBalanceStockOperationInTransaction,
  previewOrdinaryStockReceipt,
} from "@ewatrade/db/queries"
import { inventorySingleBalanceOperationSchema } from "../schemas/inventory"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { proposalDigest } from "./proposal-security"

type Action = Extract<GeneralAction, { action: "stock_receive" }>
async function receiptTarget(ctx: GeneralTransactionContext, payload: Action) {
  const scope = requireGeneralScope(ctx)
  const preview = await previewOrdinaryStockReceipt(ctx.db, {
    ...scope,
    ...payload,
  })
  return {
    scope,
    preview,
    target: { id: preview.balanceSourceId, revision: proposalDigest(preview) },
  }
}
export const stockReceive: GeneralActionAdapter<Action> = {
  async prepare(_ctx, payload) {
    return {
      ...payload,
      effectiveAt: payload.effectiveAt ?? new Date().toISOString(),
    }
  },
  async validate(ctx, payload, lock) {
    if (lock)
      await lockInventorySourcesForReview(ctx.db, {
        ...requireGeneralScope(ctx),
        balanceSourceIds: [payload.balanceSourceId],
      })
    return (await receiptTarget(ctx, payload)).target
  },
  async review(ctx, payload) {
    const { preview: p, target } = await receiptTarget(ctx, payload)
    return {
      target,
      lines: [
        `${p.productName} · ${p.variantName}`,
        `Receive ${p.enteredQuantity} ${p.enteredUnitName} · factor ${p.factor} · canonical increase ${p.canonicalQuantity}`,
        `On hand: ${p.before} → ${p.after} ${p.balanceUnitName}`,
        `Reserved: ${p.reserved}; available after: ${p.availableAfter} ${p.balanceUnitName}`,
        `Source: ${payload.source} · Reason: ${payload.reason}`,
        ...(payload.supplierName
          ? [
              `Supplier name: ${payload.supplierName} (receipt note; no supplier account or payment entry)`,
            ]
          : []),
        ...(payload.categories
          ? [
              `Categories: ${payload.categories.map((category) => category.name).join(", ")}`,
            ]
          : []),
        `Effective: ${payload.effectiveAt}`,
        payload.unitCostMinor === undefined
          ? "Unit cost unknown; no purchase payment recorded."
          : `Reported unit cost: ${p.currencyCode} ${(payload.unitCostMinor / 100).toFixed(2)}. This is a stock cost snapshot, not purchase recognition or payment.`,
        "Receive into the current Store. Stock valuation follows the ordinary receipt rules; unknown cost remains unknown.",
      ],
    }
  },
  stale:
    "Stock or unit configuration changed. Edit and review the receipt again.",
  unavailable:
    "This stock receipt is unavailable. Check the Store, stock source and unit.",
  async execute(ctx, payload, key) {
    const { scope, preview: p } = await receiptTarget(ctx, payload)
    const command = {
      ...scope,
      actorUserId: scope.userId,
      clientOperationId: key,
      schemaVersion: 1,
      balanceSourceId: payload.balanceSourceId,
      enteredInventoryUnitId: payload.enteredInventoryUnitId,
      enteredQuantity: payload.enteredQuantity,
      expectedBalanceRevision: p.revision,
      expectedConfigurationVersionId: p.configurationVersionId,
      direction: "increase",
      type: "receipt",
      reason: payload.supplierName
        ? `${payload.reason}\nSupplier: ${payload.supplierName}`
        : payload.reason,
      categories: payload.categories,
      source: payload.source,
      effectiveAt: payload.effectiveAt
        ? new Date(payload.effectiveAt)
        : undefined,
      unitCostMinor: payload.unitCostMinor,
    }
    const {
      tenantId,
      actorUserId,
      userId: _userId,
      dataClassification: _classification,
      ...publicInput
    } = command
    const parsed = inventorySingleBalanceOperationSchema.parse(publicInput)
    const result = await postOrdinaryBalanceStockOperationInTransaction(
      ctx.db,
      { ...parsed, storeId: scope.storeId, tenantId, actorUserId },
    )
    return {
      kind: "inventory",
      recordId: result.id,
      catalogItemId: p.catalogItemId,
      title: "Stock received",
      detail: `${p.enteredQuantity} ${p.enteredUnitName} received · on hand ${p.after} ${p.balanceUnitName} · ${payload.reason}`,
    }
  },
}
