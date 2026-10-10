import { generalMoney } from "@ewatrade/assistant/general/contracts"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import {
  correctStockOperationInTransaction,
  lockInventorySourcesForReview,
  postOrdinaryBalanceStockOperationInTransaction,
  previewOrdinaryStockAdjustment,
  previewOrdinaryAdjustmentCost,
  previewStockCorrection,
  readStockCorrectionTarget,
} from "@ewatrade/db/queries"
import {
  inventoryCorrectOperationSchema,
  inventorySingleBalanceOperationSchema,
} from "../schemas/inventory"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { proposalDigest } from "./proposal-security"
function costReview(cost: { status: string; currencyCode: string; valueBeforeMinor: string | null; valueAfterMinor: string | null; valueDeltaMinor: string | null }) {
  if (cost.valueAfterMinor === null) return cost.status === "NO_FINANCE_BOOK"
    ? "Cost unavailable: this Store has no finance book."
    : cost.status === "SOURCE_OWNED" ? "Cost impact follows the original source workflow."
    : "Cost unknown: the recorded valuation history does not establish a cost."
  const amount = (value: string | null) =>
    value === null ? "unknown" : generalMoney(value, cost.currencyCode)
  return `Inventory value: ${amount(cost.valueBeforeMinor)} → ${amount(cost.valueAfterMinor)}; change ${amount(cost.valueDeltaMinor)}`
}
type Adjust = Extract<GeneralAction, { action: "stock_adjust" }>
type Correct = Extract<GeneralAction, { action: "stock_correct" }>
async function adjustment(ctx: GeneralTransactionContext, payload: Adjust) {
  const scope = requireGeneralScope(ctx)
  const stock = await previewOrdinaryStockAdjustment(ctx.db, {
    ...scope,
    ...payload,
  })
  const cost = await previewOrdinaryAdjustmentCost(ctx.db, {
    tenantId: scope.tenantId,
    currencyCode: stock.currencyCode,
    balanceSourceId: stock.balanceSourceId,
    canonicalBefore: stock.canonicalBefore,
    canonicalQuantity: stock.canonicalQuantity,
    direction: payload.direction,
    effectiveAt: payload.effectiveAt
      ? new Date(payload.effectiveAt)
      : new Date(),
  })
  const preview = { ...stock, cost }
  return {
    scope,
    preview,
    target: { id: preview.balanceSourceId, revision: proposalDigest(preview) },
  }
}
export const stockAdjust: GeneralActionAdapter<Adjust> = {
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
    return (await adjustment(ctx, payload)).target
  },
  async review(ctx, payload) {
    const { preview: p, target } = await adjustment(ctx, payload)
    return {
      target,
      lines: [
        `${p.productName} · ${p.variantName}`,
        `${payload.purpose} · ${payload.direction} ${p.enteredQuantity} ${p.enteredUnitName} · factor ${p.factor} · ${p.canonicalQuantity} canonical units`,
        `On hand: ${p.before} → ${p.after} ${p.balanceUnitName}; reserved ${p.reserved}; available after ${p.availableAfter}`,
        `Reason: ${payload.reason}`,
        `Categories: ${payload.categories.map((entry) => entry.name).join(", ")}`,
        `Effective: ${payload.effectiveAt}`,
        costReview(p.cost),
        "This stock operation does not record a payment.",
      ],
    }
  },
  stale: "Stock or unit configuration changed. Review the adjustment again.",
  unavailable: "This stock adjustment is unavailable in the current Store.",
  async execute(ctx, payload, key) {
    const { scope, preview: p } = await adjustment(ctx, payload)
    const parsed = inventorySingleBalanceOperationSchema.parse({
      clientOperationId: key,
      schemaVersion: 1,
      storeId: scope.storeId,
      balanceSourceId: payload.balanceSourceId,
      enteredInventoryUnitId: payload.enteredInventoryUnitId,
      enteredQuantity: payload.enteredQuantity,
      direction: payload.direction,
      type: "adjustment",
      reason: payload.reason,
      categories: payload.categories,
      source: "assistant",
      effectiveAt: payload.effectiveAt,
      expectedBalanceRevision: p.revision,
      expectedConfigurationVersionId: p.configurationVersionId,
    })
    const result = await postOrdinaryBalanceStockOperationInTransaction(
      ctx.db,
      {
        ...parsed,
        storeId: scope.storeId,
        tenantId: scope.tenantId,
        actorUserId: scope.userId,
      },
    )
    return {
      kind: "inventory",
      recordId: result.id,
      catalogItemId: p.catalogItemId,
      title: payload.purpose === "waste" ? "Waste recorded" : "Stock adjusted",
      detail: `On hand ${p.after} ${p.balanceUnitName} · ${payload.reason}`,
    }
  },
}
async function correction(ctx: GeneralTransactionContext, payload: Correct) {
  const scope = requireGeneralScope(ctx)
  const preview = await previewStockCorrection(ctx.db, { ...scope, ...payload })
  return {
    scope,
    preview,
    target: {
      id: preview.targetOperationId,
      revision: proposalDigest(preview),
    },
  }
}
export const stockCorrect: GeneralActionAdapter<Correct> = {
  async validate(ctx, payload, lock) {
    if (lock) {
      const scope = requireGeneralScope(ctx)
      const original = await readStockCorrectionTarget(ctx.db, {
        ...scope,
        targetOperationId: payload.targetOperationId,
      })
      await lockInventorySourcesForReview(ctx.db, {
        ...scope,
        stockOperationId: original.id,
        balanceSourceIds: original.movements.map(
          (movement) => movement.balanceSourceId,
        ),
      })
    }
    return (await correction(ctx, payload)).target
  },
  async review(ctx, payload) {
    const { preview: p, target } = await correction(ctx, payload)
    return {
      target,
      lines: [
        `Original operation: ${p.targetOperationId} · ${p.originalType} · ${p.originalReason}`,
        ...p.lines.flatMap((line) => [
          `${line.productName} · ${line.variantName}: ${line.originalEnteredQuantity} → ${line.correctedQuantity} ${line.enteredUnitName} · original factor ${line.factor}`,
          `On hand: ${line.before} → ${line.afterReplacement}; reserved ${line.reserved}; available after ${line.availableAfter}`,
          costReview(line.cost),
        ]),
        `Correction reason: ${payload.reason}`,
        "The original operation remains in history. Confirmation records its reversal and replacement atomically.",
      ],
    }
  },
  stale:
    "The original operation, stock or cost changed. Review the correction again.",
  unavailable:
    "This operation must be corrected through its owning source or is unavailable in this Store.",
  async execute(ctx, payload, key) {
    const { scope, preview: p } = await correction(ctx, payload)
    const parsed = inventoryCorrectOperationSchema.parse({
      clientOperationId: key,
      schemaVersion: 1,
      source: "assistant",
      targetOperationId: payload.targetOperationId,
      reason: payload.reason,
      corrections: p.lines.map((line) => ({
        movementId: line.movementId,
        correctedEnteredQuantity: line.correctedQuantity,
        expectedBalanceRevision: line.revision,
      })),
    })
    const result = await correctStockOperationInTransaction(ctx.db, {
      ...parsed,
      tenantId: scope.tenantId,
      actorUserId: scope.userId,
    })
    return {
      kind: "inventory",
      recordId: result.id,
      catalogItemId: p.lines[0]?.catalogItemId,
      title: "Stock operation corrected",
      detail: `Original ${p.targetOperationId} · ${payload.reason}`,
    }
  },
}
