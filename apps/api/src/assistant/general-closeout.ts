import type {
  GeneralAction,
  GeneralReceipt,
} from "@ewatrade/assistant/general/contracts"
import {
  createInventoryCloseoutInTransaction,
  finalizeInventoryCloseoutInTransaction,
  getInventoryCloseoutReview,
  lockInventoryCloseoutReview,
  lockInventorySourcesForReview,
  previewInventoryCloseoutCreation,
} from "@ewatrade/db/queries"
import {
  inventoryCreateCloseoutSchema,
  inventoryFinalizeCloseoutSchema,
} from "../schemas/inventory"
import {
  type GeneralActionAdapter,
  type GeneralTransactionContext,
  conflict,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { proposalDigest } from "./proposal-security"

type Create = Extract<GeneralAction, { action: "inventory_closeout_create" }>
type Finalize = Extract<
  GeneralAction,
  { action: "inventory_closeout_finalize" }
>
const stale =
  "Custody stock or the saved declarations changed. Review a fresh proposal."
const unavailable =
  "This custody closeout is unavailable or has unresolved reconciliation conflicts."
async function creation(
  ctx: GeneralTransactionContext,
  payload: Create,
  lock = false,
) {
  const scope = requireGeneralScope(ctx)
  if (lock)
    await lockInventorySourcesForReview(ctx.db, {
      ...scope,
      balanceSourceIds: payload.declarations.map(
        (line) => line.balanceSourceId,
      ),
    })
  const lines = await previewInventoryCloseoutCreation(ctx.db, {
    ...scope,
    ...payload,
  })
  return {
    scope,
    lines,
    target: {
      id: scope.storeId,
      revision: proposalDigest({
        custodyType: payload.custodyType,
        custodyReferenceId: payload.custodyReferenceId,
        lines,
      }),
    },
  }
}
async function executeCreate(
  ctx: GeneralTransactionContext,
  payload: Create,
  key: string,
  current?: Awaited<ReturnType<typeof creation>>,
): Promise<GeneralReceipt> {
  const { scope, lines } = current ?? (await creation(ctx, payload, true))
  const parsed = inventoryCreateCloseoutSchema.parse({
    custodyType: payload.custodyType,
    custodyReferenceId: payload.custodyReferenceId,
    declarations: lines.map((line) => ({
      balanceSourceId: line.balanceSourceId,
      declaredQuantity: line.declaredQuantity,
      expectedRevision: line.expectedRevision,
    })),
    reason: payload.reason,
    clientOperationId: key,
    schemaVersion: 1,
    storeId: scope.storeId,
  })
  const saved = await createInventoryCloseoutInTransaction(ctx.db, {
    ...parsed,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    actorUserId: scope.userId,
  })
  return {
    kind: "inventory_closeout",
    recordId: saved.id,
    title: "Custody declarations saved",
    detail: `${lines.length} declaration(s) saved. Stock is unchanged; finalization requires separate review and confirmation.`,
  }
}
export const closeoutCreate: GeneralActionAdapter<Create> = {
  stale,
  unavailable,
  async validate(ctx, payload, lock) {
    return (await creation(ctx, payload, lock)).target
  },
  async prepareExecution(ctx, payload) {
    const current = await creation(ctx, payload, true)
    return {
      target: current.target,
      execute: (key) => executeCreate(ctx, payload, key, current),
    }
  },
  async review(ctx, payload) {
    const { target, lines } = await creation(ctx, payload)
    return {
      target,
      lines: [
        `Save ${payload.custodyType} custody declarations for ${payload.custodyReferenceId}. Stock stays unchanged.`,
        ...lines.map(
          (line) =>
            `${line.productName} · ${line.variantName}: system ${line.expectedQuantity}; declared ${line.declaredQuantity}; variance ${line.varianceQuantity} ${line.unitName}. Reserved ${line.reservedQuantity}.${line.preservesReservations ? "" : " Declaration is below reserved stock; finalization is blocked until reconciled."}`,
        ),
        `Reason: ${payload.reason}`,
        "This is an inventory custody closeout, not a financial period close.",
      ],
    }
  },
  execute: executeCreate,
}
async function finalization(
  ctx: GeneralTransactionContext,
  payload: Finalize,
  lock = false,
) {
  const scope = requireGeneralScope(ctx)
  if (lock)
    await lockInventoryCloseoutReview(ctx.db, {
      ...scope,
      closeoutId: payload.closeoutId,
    })
  const closeout = await getInventoryCloseoutReview(ctx.db, {
    ...scope,
    closeoutId: payload.closeoutId,
  })
  if (!closeout.canFinalize)
    throw conflict(
      "Closeout stock, reservations or status no longer permit finalization. Reconcile the original declarations first.",
    )
  return {
    scope,
    closeout,
    target: { id: closeout.id, revision: proposalDigest(closeout) },
  }
}
async function executeFinalize(
  ctx: GeneralTransactionContext,
  payload: Finalize,
  key: string,
  current?: Awaited<ReturnType<typeof finalization>>,
): Promise<GeneralReceipt> {
  const { scope, closeout } =
    current ?? (await finalization(ctx, payload, true))
  const parsed = inventoryFinalizeCloseoutSchema.parse({
    closeoutId: closeout.id,
    reason: payload.reason,
    clientOperationId: key,
    schemaVersion: 1,
  })
  await finalizeInventoryCloseoutInTransaction(ctx.db, {
    ...parsed,
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
  })
  return {
    kind: "inventory_closeout",
    recordId: closeout.id,
    title: "Custody closeout finalized",
    detail: `${closeout.lines.length} original declaration(s) reconciled. Stock and applicable valuation follow the saved closeout evidence.`,
  }
}
export const closeoutFinalize: GeneralActionAdapter<Finalize> = {
  stale,
  unavailable,
  async validate(ctx, payload, lock) {
    return (await finalization(ctx, payload, lock)).target
  },
  async prepareExecution(ctx, payload) {
    const current = await finalization(ctx, payload, true)
    return {
      target: current.target,
      execute: (key) => executeFinalize(ctx, payload, key, current),
    }
  },
  async review(ctx, payload) {
    const { closeout, target } = await finalization(ctx, payload)
    return {
      target,
      lines: [
        `Finalize saved ${closeout.custodyType.toLowerCase()} custody closeout ${closeout.id}.`,
        ...closeout.lines.map(
          (line) =>
            `${line.productName} · ${line.variantName}: ${line.expectedQuantity} → ${line.declaredQuantity} ${line.unitName}; variance ${line.varianceQuantity}; reserved ${line.reservedQuantity}.`,
        ),
        `Original reason: ${closeout.reason ?? "Not recorded"}`,
        `Finalization reason: ${payload.reason}`,
        "Saved reconciliation evidence controls stock and any applicable financial posting. Unknown cost is not invented. This does not close a financial period.",
      ],
    }
  },
  execute: executeFinalize,
}
