import type {
  GeneralAction,
  GeneralReceipt,
} from "@ewatrade/assistant/general/contracts"
import { canManageSalesOperations, normalizeRole } from "@ewatrade/auth/roles"
import {
  canStaffAccessStore,
  canStaffPerform,
} from "@ewatrade/auth/store-access"
import {
  lockInventorySourcesForReview,
  transformPackagedStockInTransaction,
} from "@ewatrade/db/queries"
import type { TenantContext } from "@ewatrade/db/tenant-context"
import {
  addExactDecimals,
  compareExactDecimals,
  divideExactDecimals,
  multiplyExactDecimals,
  parseExactDecimal,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import { TRPCError } from "@trpc/server"
import { inventoryTransformationSchema } from "../schemas/inventory"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { proposalDigest } from "./proposal-security"

type Transform = Extract<GeneralAction, { action: "stock_package_transform" }>
const stale = "Packed stock changed. Review a fresh proposal before confirming."
const unavailable =
  "This repack is unavailable. Check both pack balances and your inventory access in this Store."
const refuse = (message: string): never => {
  throw new TRPCError({ code: "CONFLICT", message })
}

/**
 * The same authority as the canonical inventory procedure: scoped staff need
 * Store access and the `stock` action there (assertCanManageInventory defers
 * them to the Store guard); everyone else needs an inventory-managing role.
 * The repack Store must be the active Store.
 */
export function assertTransformAccess(tenant: TenantContext, storeId: string) {
  const access = tenant.staffAccess
  const role = normalizeRole(tenant.membership.role)
  const allowed =
    tenant.activeStore?.id === storeId &&
    tenant.stores.some((store) => store.id === storeId) &&
    (access?.mode === "SCOPED"
      ? canStaffAccessStore(access, storeId) &&
        canStaffPerform(access, "stock", storeId)
      : Boolean(role) && canManageSalesOperations(role as never))
  if (!allowed)
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Repacking stock requires inventory access in this Store, confirmed from that Store.",
    })
}

/**
 * Exact target quantity: source × sourceFactor ÷ targetFactor at the target
 * unit's transaction scale. Nothing is rounded; an amount that cannot be
 * represented in the target unit is refused.
 */
export function derivePackTarget(input: {
  sourceQuantity: string
  sourceFactor: string
  sourceScale: number
  targetFactor: string
  targetScale: number
  sourceUnitName: string
  targetUnitName: string
}) {
  let sourceQuantity: string
  try {
    sourceQuantity = parseExactDecimal(input.sourceQuantity, {
      allowZero: false,
      maxScale: input.sourceScale,
    })
  } catch {
    return refuse(
      `${input.sourceQuantity} cannot be represented in ${input.sourceUnitName}.`,
    )
  }
  const canonical = multiplyExactDecimals(sourceQuantity, input.sourceFactor)
  let targetQuantity: string
  try {
    targetQuantity = divideExactDecimals(
      canonical,
      input.targetFactor,
      input.targetScale,
    )
  } catch {
    return refuse(
      input.targetScale === 0
        ? `${sourceQuantity} ${input.sourceUnitName} does not make whole ${input.targetUnitName}.`
        : `${sourceQuantity} ${input.sourceUnitName} cannot be represented in ${input.targetUnitName}.`,
    )
  }
  if (compareExactDecimals(targetQuantity, "0") <= 0)
    return refuse(
      `${sourceQuantity} ${input.sourceUnitName} does not make any ${input.targetUnitName}.`,
    )
  return { sourceQuantity, targetQuantity, canonical }
}

const balanceInclude = {
  inventoryUnit: true,
  product: {
    select: {
      catalogItemId: true,
      catalogItem: { select: { name: true, tenantId: true } },
    },
  },
  variant: { select: { name: true, catalogItemId: true } },
} as const

async function transformReview(
  ctx: GeneralTransactionContext,
  payload: Transform,
) {
  const scope = requireGeneralScope(ctx)
  assertTransformAccess(ctx.tenantContext, scope.storeId)
  const read = (id: string) =>
    ctx.db.stockBalanceSource.findFirst({
      where: { id, tenantId: scope.tenantId, storeId: scope.storeId },
      include: balanceInclude,
    })
  const [source, target] = await Promise.all([
    read(payload.sourceBalanceSourceId),
    read(payload.targetBalanceSourceId),
  ])
  for (const balance of [source, target])
    if (
      !balance ||
      balance.tenantId !== scope.tenantId ||
      balance.storeId !== scope.storeId ||
      balance.inventoryUnitId !== balance.inventoryUnit.id ||
      balance.product.catalogItem.tenantId !== scope.tenantId
    )
      throw new TRPCError({ code: "NOT_FOUND", message: unavailable })
  if (!source || !target)
    throw new TRPCError({ code: "NOT_FOUND", message: unavailable })
  if (source.id === target.id)
    return refuse("Choose two different pack balances to repack between.")
  if (source.kind !== "PACKAGED_STOCK" || target.kind !== "PACKAGED_STOCK")
    return refuse("Only packaged stock balances can be repacked.")
  if (
    source.productId !== target.productId ||
    source.variantId !== target.variantId
  )
    return refuse("Both pack balances must be the same Product and variant.")
  if (
    source.inventoryUnit.configurationVersionId !==
    target.inventoryUnit.configurationVersionId
  )
    return refuse(
      "These pack balances use different unit configurations. Review the Product's units first.",
    )
  const derived = derivePackTarget({
    sourceQuantity: payload.sourceQuantity,
    sourceFactor: source.inventoryUnit.factor.toFixed(),
    sourceScale: source.inventoryUnit.transactionScale,
    targetFactor: target.inventoryUnit.factor.toFixed(),
    targetScale: target.inventoryUnit.transactionScale,
    sourceUnitName: source.inventoryUnit.name,
    targetUnitName: target.inventoryUnit.name,
  })
  const sourceOnHand = source.onHandQuantity.toFixed()
  const sourceReserved = source.reservedQuantity.toFixed()
  const available = subtractExactDecimals(sourceOnHand, sourceReserved)
  if (compareExactDecimals(derived.sourceQuantity, available) > 0)
    return refuse(
      `Only ${available} ${source.inventoryUnit.name} can be repacked: on hand ${sourceOnHand}, reserved ${sourceReserved}.`,
    )
  const targetOnHand = target.onHandQuantity.toFixed()
  const review = {
    storeId: scope.storeId,
    storeName: ctx.tenantContext.activeStore?.name ?? "this Store",
    catalogItemId: source.product.catalogItemId,
    productName: source.product.catalogItem.name,
    variantId: source.variantId,
    variantName: source.variant.name,
    configurationVersionId: source.inventoryUnit.configurationVersionId,
    source: {
      id: source.id,
      revision: source.revision,
      unitId: source.inventoryUnitId,
      unitName: source.inventoryUnit.name,
      factor: source.inventoryUnit.factor.toFixed(),
      scale: source.inventoryUnit.transactionScale,
      onHand: sourceOnHand,
      reserved: sourceReserved,
      available,
      after: subtractExactDecimals(sourceOnHand, derived.sourceQuantity),
    },
    target: {
      id: target.id,
      revision: target.revision,
      unitId: target.inventoryUnitId,
      unitName: target.inventoryUnit.name,
      factor: target.inventoryUnit.factor.toFixed(),
      scale: target.inventoryUnit.transactionScale,
      onHand: targetOnHand,
      reserved: target.reservedQuantity.toFixed(),
      after: addExactDecimals(targetOnHand, derived.targetQuantity),
    },
    sourceQuantity: derived.sourceQuantity,
    targetQuantity: derived.targetQuantity,
    canonical: derived.canonical,
  }
  return {
    scope,
    review,
    target: { id: source.id, revision: proposalDigest(review) },
  }
}

/** Locks the Store, then both sorted balances, as the command does. */
async function lockedTransformReview(
  ctx: GeneralTransactionContext,
  payload: Transform,
) {
  const first = await transformReview(ctx, payload)
  await lockInventorySourcesForReview(ctx.db, {
    tenantId: first.scope.tenantId,
    storeId: first.scope.storeId,
    balanceSourceIds: [first.review.source.id, first.review.target.id],
  })
  return transformReview(ctx, payload)
}

async function executeTransform(
  ctx: GeneralTransactionContext,
  payload: Transform,
  key: string,
  current?: Awaited<ReturnType<typeof transformReview>>,
): Promise<GeneralReceipt> {
  const { scope, review: r } =
    current ?? (await lockedTransformReview(ctx, payload))
  const parsed = inventoryTransformationSchema.parse({
    clientOperationId: key,
    expectedConfigurationVersionId: r.configurationVersionId,
    reason: payload.reason,
    schemaVersion: 1,
    source: "assistant",
    sourceBalanceRevision: r.source.revision,
    sourceBalanceSourceId: r.source.id,
    sourceQuantity: r.sourceQuantity,
    targetBalanceRevision: r.target.revision,
    targetBalanceSourceId: r.target.id,
    targetQuantity: r.targetQuantity,
  })
  const operation = await transformPackagedStockInTransaction(ctx.db, {
    ...parsed,
    storeId: scope.storeId,
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
  })
  return {
    kind: "inventory",
    recordId: operation.id,
    catalogItemId: r.catalogItemId,
    title: "Stock repacked",
    detail: `${r.sourceQuantity} ${r.source.unitName} → ${r.targetQuantity} ${r.target.unitName} of ${r.productName} at ${r.storeName}.`,
  }
}

export const stockPackageTransform: GeneralActionAdapter<Transform> = {
  stale,
  unavailable,
  async validate(ctx, payload, lock) {
    return (
      lock
        ? await lockedTransformReview(ctx, payload)
        : await transformReview(ctx, payload)
    ).target
  },
  async prepareExecution(ctx, payload) {
    const current = await lockedTransformReview(ctx, payload)
    return {
      target: current.target,
      execute: (key) => executeTransform(ctx, payload, key, current),
    }
  },
  async review(ctx, payload) {
    const { review: r, target } = await transformReview(ctx, payload)
    return {
      target,
      lines: [
        `Repack ${r.sourceQuantity} ${r.source.unitName} into ${r.targetQuantity} ${r.target.unitName} at ${r.storeName}.`,
        `${r.productName} · ${r.variantName} · ${r.source.unitName} ×${r.source.factor} → ${r.target.unitName} ×${r.target.factor} · ${r.canonical} canonical units conserved.`,
        `${r.source.unitName} stock ${r.source.onHand} → ${r.source.after}; reserved ${r.source.reserved}; available ${r.source.available}.`,
        `${r.target.unitName} stock ${r.target.onHand} → ${r.target.after}; reserved ${r.target.reserved}.`,
        "Repacking conserves stock exactly. Record any loss as a separate adjustment.",
        `Reason: ${payload.reason}`,
      ],
    }
  },
  execute: executeTransform,
}
