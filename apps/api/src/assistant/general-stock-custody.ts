import type {
  GeneralAction,
  GeneralReceipt,
} from "@ewatrade/assistant/general/contracts"
import { custodyMoveKind } from "@ewatrade/assistant/general/stock-custody"
import { canManageSalesOperations, normalizeRole } from "@ewatrade/auth/roles"
import {
  canStaffAccessStore,
  canStaffPerform,
} from "@ewatrade/auth/store-access"
import {
  lockInventorySourcesForReview,
  moveInventoryCustodyInTransaction,
  serviceAssigneeWhere,
} from "@ewatrade/db/queries"
import type { TenantContext } from "@ewatrade/db/tenant-context"
import {
  addExactDecimals,
  compareExactDecimals,
  multiplyExactDecimals,
  parseExactDecimal,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import { TRPCError } from "@trpc/server"
import { inventoryMoveCustodySchema } from "../schemas/inventory"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { proposalDigest } from "./proposal-security"

type Move = Extract<GeneralAction, { action: "stock_custody_move" }>

export {
  custodyMoveKind,
  type CustodySource,
} from "@ewatrade/assistant/general/stock-custody"

const stale =
  "Custody stock changed. Review a fresh proposal before confirming."
const unavailable =
  "This custody move is unavailable. Check the stock, the staff member and your inventory access in this Store."
const refuse = (message: string): never => {
  throw new TRPCError({ code: "CONFLICT", message })
}

/** Inventory management in the custody Store, from fresh trusted context. */
export function assertCustodyAccess(tenant: TenantContext, storeId: string) {
  const role = normalizeRole(tenant.membership.role)
  if (
    !role ||
    !canManageSalesOperations(role) ||
    tenant.activeStore?.id !== storeId ||
    !tenant.stores.some((store) => store.id === storeId) ||
    (tenant.staffAccess &&
      (!canStaffAccessStore(tenant.staffAccess, storeId) ||
        !canStaffPerform(tenant.staffAccess, "stock", storeId)))
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Moving stock custody requires inventory access in this Store, confirmed from that Store.",
    })
}

/**
 * The review binds exact identities and revisions: Product, variant, unit,
 * source custody and revision, and the target balance as either absent or
 * present at its revision. Any change makes the signed draft stale.
 */
async function custodyReview(ctx: GeneralTransactionContext, payload: Move) {
  const scope = requireGeneralScope(ctx)
  assertCustodyAccess(ctx.tenantContext, scope.storeId)
  const source = await ctx.db.stockBalanceSource.findFirst({
    where: {
      id: payload.sourceBalanceSourceId,
      tenantId: scope.tenantId,
      storeId: scope.storeId,
    },
    include: {
      inventoryUnit: true,
      product: {
        select: {
          catalogItemId: true,
          catalogItem: { select: { name: true, tenantId: true } },
        },
      },
      variant: { select: { id: true, name: true, catalogItemId: true } },
    },
  })
  if (
    !source ||
    source.tenantId !== scope.tenantId ||
    source.storeId !== scope.storeId ||
    source.inventoryUnitId !== source.inventoryUnit.id ||
    source.product.catalogItem.tenantId !== scope.tenantId ||
    source.variant.catalogItemId !== source.product.catalogItemId
  )
    throw new TRPCError({ code: "NOT_FOUND", message: unavailable })
  const move = custodyMoveKind(
    {
      custodyType: source.custodyType,
      custodyReferenceId: source.custodyReferenceId,
    },
    payload.target,
  )
  if ("refused" in move) return refuse(move.refused)

  // Assignment: the target must be a current eligible member of this Store
  // (the canonical service-assignee rule). Return: the holder may have left;
  // returning their stock to the Store stays possible and names them only if
  // they are still known to this business.
  const holder = await ctx.db.membership.findFirst({
    where:
      move.kind === "assignment"
        ? serviceAssigneeWhere({
            tenantId: scope.tenantId,
            storeId: scope.storeId,
            userId: move.staffUserId,
          })
        : { tenantId: scope.tenantId, userId: move.staffUserId },
    select: {
      id: true,
      userId: true,
      status: true,
      user: { select: { name: true, displayName: true } },
    },
  })
  if (move.kind === "assignment" && !holder)
    return refuse(
      "That staff member can't hold stock for this Store. Choose an active staff member with access here.",
    )
  const holderName =
    holder?.user.displayName || holder?.user.name || "a former staff member"

  const targetBalance = await ctx.db.stockBalanceSource.findUnique({
    where: {
      storeId_variantId_inventoryUnitId_custodyType_custodyReferenceId: {
        storeId: source.storeId,
        variantId: source.variantId,
        inventoryUnitId: source.inventoryUnitId,
        custodyType: move.kind === "assignment" ? "STAFF" : "STORE",
        custodyReferenceId: move.kind === "assignment" ? move.staffUserId : "",
      },
    },
    select: {
      id: true,
      tenantId: true,
      revision: true,
      onHandQuantity: true,
    },
  })
  if (targetBalance && targetBalance.tenantId !== scope.tenantId)
    throw new TRPCError({ code: "NOT_FOUND", message: unavailable })

  const quantity = parseExactDecimal(payload.quantity, {
    allowZero: false,
    maxScale: source.inventoryUnit.transactionScale,
  })
  const onHand = source.onHandQuantity.toFixed()
  const reserved = source.reservedQuantity.toFixed()
  const available = subtractExactDecimals(onHand, reserved)
  if (compareExactDecimals(quantity, available) > 0)
    return refuse(
      `Only ${available} ${source.inventoryUnit.name} can move: on hand ${onHand}, reserved ${reserved}.`,
    )
  const targetOnHand = targetBalance?.onHandQuantity.toFixed() ?? "0"
  const review = {
    kind: move.kind,
    storeId: scope.storeId,
    storeName: ctx.tenantContext.activeStore?.name ?? "this Store",
    sourceBalanceSourceId: source.id,
    sourceRevision: source.revision,
    sourceCustody: {
      type: source.custodyType,
      referenceId: source.custodyReferenceId,
    },
    catalogItemId: source.product.catalogItemId,
    productName: source.product.catalogItem.name,
    variantId: source.variantId,
    variantName: source.variant.name,
    inventoryUnitId: source.inventoryUnitId,
    configurationVersionId: source.inventoryUnit.configurationVersionId,
    unitName: source.inventoryUnit.name,
    factor: source.inventoryUnit.factor.toFixed(),
    staff: {
      userId: move.staffUserId,
      membershipId: holder?.id ?? null,
      name: holderName,
    },
    target: targetBalance
      ? {
          state: "present" as const,
          id: targetBalance.id,
          revision: targetBalance.revision,
        }
      : { state: "absent" as const },
    quantity,
    canonicalQuantity: multiplyExactDecimals(
      quantity,
      source.inventoryUnit.factor.toFixed(),
      18,
    ),
    onHand,
    reserved,
    available,
    sourceAfter: subtractExactDecimals(onHand, quantity),
    targetBefore: targetOnHand,
    targetAfter: addExactDecimals(targetOnHand, quantity),
  }
  return {
    scope,
    review,
    target: { id: source.id, revision: proposalDigest(review) },
  }
}

/** Locks the Store, then the sorted source/target rows, as the command does. */
async function lockedCustodyReview(
  ctx: GeneralTransactionContext,
  payload: Move,
) {
  const first = await custodyReview(ctx, payload)
  await lockInventorySourcesForReview(ctx.db, {
    tenantId: first.scope.tenantId,
    storeId: first.scope.storeId,
    balanceSourceIds: [
      first.review.sourceBalanceSourceId,
      ...(first.review.target.state === "present"
        ? [first.review.target.id]
        : []),
    ],
  })
  return custodyReview(ctx, payload)
}

async function executeMove(
  ctx: GeneralTransactionContext,
  payload: Move,
  key: string,
  current?: Awaited<ReturnType<typeof custodyReview>>,
): Promise<GeneralReceipt> {
  const { scope, review: r } =
    current ?? (await lockedCustodyReview(ctx, payload))
  const parsed = inventoryMoveCustodySchema.parse({
    clientOperationId: key,
    expectedSourceRevision: r.sourceRevision,
    // An absent target is created at revision 0 by the command; one created
    // and changed after review is refused there rather than silently used.
    expectedTargetRevision:
      r.target.state === "present" ? r.target.revision : 0,
    quantity: r.quantity,
    reason: payload.reason,
    schemaVersion: 1,
    source: "assistant",
    sourceBalanceSourceId: r.sourceBalanceSourceId,
    targetCustodyReferenceId: r.kind === "assignment" ? r.staff.userId : "",
    targetCustodyType: r.kind === "assignment" ? "staff" : "store",
  })
  const operation = await moveInventoryCustodyInTransaction(ctx.db, {
    ...parsed,
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
  })
  return {
    kind: "inventory",
    recordId: operation.id,
    catalogItemId: r.catalogItemId,
    title: r.kind === "assignment" ? "Stock assigned" : "Stock returned",
    detail:
      r.kind === "assignment"
        ? `${r.quantity} ${r.unitName} of ${r.productName} now with ${r.staff.name}.`
        : `${r.quantity} ${r.unitName} of ${r.productName} returned to the Store from ${r.staff.name}.`,
  }
}

export const stockCustodyMove: GeneralActionAdapter<Move> = {
  stale,
  unavailable,
  async validate(ctx, payload, lock) {
    return (
      lock
        ? await lockedCustodyReview(ctx, payload)
        : await custodyReview(ctx, payload)
    ).target
  },
  async prepareExecution(ctx, payload) {
    const current = await lockedCustodyReview(ctx, payload)
    return {
      target: current.target,
      execute: (key) => executeMove(ctx, payload, key, current),
    }
  },
  async review(ctx, payload) {
    const { review: r, target } = await custodyReview(ctx, payload)
    const assigning = r.kind === "assignment"
    return {
      target,
      lines: [
        assigning
          ? `Give ${r.quantity} ${r.unitName} to ${r.staff.name} at ${r.storeName}.`
          : `Return ${r.quantity} ${r.unitName} from ${r.staff.name} to ${r.storeName}.`,
        `${r.productName} · ${r.variantName} · factor ${r.factor} · canonical quantity ${r.canonicalQuantity}.`,
        `${assigning ? `${r.storeName} Store` : `${r.staff.name}'s`} stock ${r.onHand} → ${r.sourceAfter}; reserved ${r.reserved}; could move ${r.available}.`,
        `${assigning ? `${r.staff.name}'s` : `${r.storeName} Store`} stock ${r.targetBefore} → ${r.targetAfter}${r.target.state === "absent" ? " (new custody balance)" : ""}.`,
        "Stock stays in this Store; only who holds it changes. Carrying value follows the saved records.",
        `Reason: ${payload.reason}`,
      ],
    }
  },
  execute: executeMove,
}
