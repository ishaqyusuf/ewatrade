import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import {
  createStockCountInTransaction,
  finalizeStockCountInTransaction,
  getStockCountReview,
  lockInventorySourcesForReview,
  previewStockCountCreation,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import {
  inventoryCreateStockCountSchema,
  inventoryFinalizeStockCountSchema,
} from "../schemas/inventory"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { proposalDigest } from "./proposal-security"

type Create = Extract<GeneralAction, { action: "stock_count_create" }>
type Finalize = Extract<GeneralAction, { action: "stock_count_finalize" }>
async function creation(ctx: GeneralTransactionContext, payload: Create) {
  const scope = requireGeneralScope(ctx)
  const lines = await previewStockCountCreation(ctx.db, {
    ...scope,
    lines: payload.lines,
  })
  return {
    scope,
    lines,
    target: { id: scope.storeId, revision: proposalDigest(lines) },
  }
}
export const stockCountCreate: GeneralActionAdapter<Create> = {
  async validate(ctx, payload, lock) {
    if (lock)
      await lockInventorySourcesForReview(ctx.db, {
        ...requireGeneralScope(ctx),
        balanceSourceIds: payload.lines.map((line) => line.balanceSourceId),
      })
    return (await creation(ctx, payload)).target
  },
  async review(ctx, payload) {
    const { lines, target } = await creation(ctx, payload)
    return {
      target,
      lines: [
        "Save observations only. Stock does not change until a separate finalization is reviewed and confirmed.",
        ...lines.flatMap((line) => [
          `${line.productName} · ${line.variantName} · ${line.custodyType}${line.custodyReferenceId ? ` (${line.custodyReferenceId})` : ""}`,
          `System ${line.expectedQuantity}; counted ${line.observedQuantity}; variance ${line.varianceQuantity} ${line.unitName}. Reserved ${line.reservedQuantity}.`,
          ...line.entries.map(
            (entry) =>
              `Observation ${entry.enteredQuantity} · ${entry.unitName} · factor ${entry.factor} · canonical ${entry.canonicalQuantity}`,
          ),
        ]),
        `Reason: ${payload.reason}`,
      ],
    }
  },
  stale:
    "Stock or units changed. Review a fresh count before saving observations.",
  unavailable: "This count is unavailable. Check its Store, sources and units.",
  async execute(ctx, payload, key) {
    const { scope, lines } = await creation(ctx, payload)
    const parsed = inventoryCreateStockCountSchema.parse({
      storeId: scope.storeId,
      clientOperationId: key,
      schemaVersion: 1,
      actorNote: payload.reason,
      lines: payload.lines.map((line, index) => ({
        ...line,
        expectedRevision: lines[index]?.expectedRevision,
      })),
    })
    const result = await createStockCountInTransaction(ctx.db, {
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      actorUserId: scope.userId,
      clientOperationId: parsed.clientOperationId,
      schemaVersion: parsed.schemaVersion,
      reason: parsed.actorNote,
      lines: parsed.lines,
    })
    return {
      kind: "stock_count",
      recordId: result.id,
      title: "Stock count saved",
      detail: `${lines.length} stock source(s) counted. Stock unchanged; review and confirm finalization separately.`,
    }
  },
}
async function finalization(ctx: GeneralTransactionContext, payload: Finalize) {
  const scope = requireGeneralScope(ctx)
  const count = await getStockCountReview(ctx.db, {
    ...scope,
    stockCountId: payload.stockCountId,
  })
  if (!count.canFinalize)
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "This count is no longer current. Create and review fresh observations before finalization.",
    })
  return {
    scope,
    count,
    target: { id: count.id, revision: proposalDigest(count) },
  }
}
export const stockCountFinalize: GeneralActionAdapter<Finalize> = {
  async validate(ctx, payload, lock) {
    if (lock) {
      const scope = requireGeneralScope(ctx)
      const count = await getStockCountReview(ctx.db, {
        ...scope,
        stockCountId: payload.stockCountId,
      })
      await lockInventorySourcesForReview(ctx.db, {
        ...scope,
        stockCountId: count.id,
        balanceSourceIds: count.lines.map((line) => line.balanceSourceId),
      })
    }
    return (await finalization(ctx, payload)).target
  },
  async review(ctx, payload) {
    const { count, target } = await finalization(ctx, payload)
    return {
      target,
      lines: [
        "Finalize the saved count and apply its signed stock adjustment.",
        ...count.lines.map(
          (line) =>
            `${line.productName} · ${line.variantName}: ${line.expectedQuantity} → ${line.observedQuantity} ${line.unitName}; variance ${line.varianceQuantity}; reserved ${line.reservedQuantity}; available after ${line.availableAfter}.`,
        ),
        `Observation reason: ${count.reason ?? "Not recorded"}`,
        `Finalization reason: ${payload.reason}`,
        "Stock valuation and finance posting follow the canonical count rules. Unknown cost is not invented.",
      ],
    }
  },
  stale:
    "The saved count or stock changed. Create and review fresh observations.",
  unavailable:
    "This count cannot be finalized. Check its status, Store and stock changes.",
  async execute(ctx, payload, key) {
    const { scope, count } = await finalization(ctx, payload)
    const parsed = inventoryFinalizeStockCountSchema.parse({
      stockCountId: count.id,
      reason: payload.reason,
      schemaVersion: 1,
      clientOperationId: key,
    })
    await finalizeStockCountInTransaction(ctx.db, {
      ...parsed,
      tenantId: scope.tenantId,
      actorUserId: scope.userId,
    })
    return {
      kind: "stock_count",
      recordId: count.id,
      title: "Stock count finalized",
      detail: `${count.lines.length} stock source(s) reconciled to the reviewed observations.`,
    }
  },
}
