import type { Prisma } from "../../../generated/prisma/client"
import type { OrdinaryStockSourceOperation } from "./inventory-ordinary-source"
import type { relocationSourceInclude } from "./inventory-relocation-source"
import type { ReviewedCostOwner } from "./reviewed-cost-owners"
import { FinanceError } from "./rules"

type LoadedMovement = Prisma.StockMovementGetPayload<{
  include: {
    purchaseReceipt: { select: { id: true } }
    valuationEvent: true
  }
}>
type LoadedBalance =
  Prisma.StockBalanceSourceGetPayload<Prisma.StockBalanceSourceDefaultArgs>
type LoadedTransfer =
  Prisma.StockTransferGetPayload<Prisma.StockTransferDefaultArgs>

type RelocationGraph = Prisma.StockOperationGetPayload<{
  include: typeof relocationSourceInclude
}>
type Graph = Omit<
  RelocationGraph & OrdinaryStockSourceOperation,
  "movements"
> & {
  movements: Array<
    RelocationGraph["movements"][number] &
      OrdinaryStockSourceOperation["movements"][number]
  >
}

function required<T>(map: Map<string, T>, id: string, label: string): T {
  const value = map.get(id)
  if (!value)
    throw new FinanceError(
      "CONFLICT",
      `Original stock source ${label} is missing from complete scope.`,
    )
  return value
}

function complete(ids: string[], rows: Array<{ id: string }>, label: string) {
  const expected = new Set(ids)
  if (
    rows.length !== expected.size ||
    new Set(rows.map((row) => row.id)).size !== rows.length ||
    rows.some((row) => !expected.has(row.id))
  )
    throw new FinanceError(
      "CONFLICT",
      `Original stock source ${label} scope changed.`,
    )
}
function grouped<T>(rows: T[], identity: (row: T) => string | null) {
  const result = new Map<string, T[]>()
  for (const row of rows) {
    const id = identity(row)
    if (id === null) continue
    const values = result.get(id) ?? []
    values.push(row)
    result.set(id, values)
  }
  return result
}

/** Flat bounded repository reads; no per-operation queries or appended stock locks. */
export async function readReviewedCostStockGraphs(
  tx: Prisma.TransactionClient,
  input: {
    owners: ReviewedCostOwner[]
    balanceSourceIds: string[]
    transferIds: string[]
    /** Original records already read in this transaction; completeness is rechecked below. */
    records?: {
      movements: LoadedMovement[]
      balances: LoadedBalance[]
      transfers: LoadedTransfer[]
    }
  },
): Promise<Graph[]> {
  if (!input.owners.length) return []
  if (
    input.owners.length > 4096 ||
    !input.balanceSourceIds.length ||
    input.balanceSourceIds.length > 128 ||
    input.transferIds.length > 4096 ||
    [
      input.owners.map((op) => op.id),
      input.balanceSourceIds,
      input.transferIds,
    ].some(
      (ids) => new Set(ids).size !== ids.length || ids.some((id) => !id.trim()),
    ) ||
    input.owners.some(
      (op) =>
        !Number.isSafeInteger(op._count.movements) || op._count.movements < 0,
    ) ||
    input.owners.reduce((n, op) => n + op._count.movements, 0) > 4096
  )
    throw new FinanceError(
      "CONFLICT",
      "Complete stock source graph exceeds connected bounds.",
    )
  const operationIds = input.owners.map((op) => op.id)
  const movements =
    input.records?.movements ??
    (await tx.stockMovement.findMany({
      where: { operationId: { in: operationIds } },
      include: {
        purchaseReceipt: { select: { id: true } },
        valuationEvent: true,
      },
      orderBy: { id: "asc" },
      take: 4097,
    }))
  if (
    movements.length !==
      input.owners.reduce((n, op) => n + op._count.movements, 0) ||
    movements.length > 4096 ||
    new Set(movements.map((movement) => movement.id)).size !== movements.length
  )
    throw new FinanceError(
      "CONFLICT",
      "Original stock source movement set is incomplete.",
    )
  const movementsByOperation = grouped(movements, (m) => m.operationId)
  if (
    input.owners.some(
      (op) =>
        (movementsByOperation.get(op.id)?.length ?? 0) !== op._count.movements,
    )
  )
    throw new FinanceError(
      "CONFLICT",
      "Original stock source operation movement coverage changed.",
    )
  const balances =
    input.records?.balances ??
    (await tx.stockBalanceSource.findMany({
      where: { id: { in: input.balanceSourceIds } },
      orderBy: { id: "asc" },
      take: 129,
    }))
  complete(input.balanceSourceIds, balances, "balance")
  const transfers =
    input.records?.transfers ??
    (input.transferIds.length
      ? await tx.stockTransfer.findMany({
          where: { id: { in: input.transferIds } },
          orderBy: { id: "asc" },
          take: 4097,
        })
      : [])
  complete(input.transferIds, transfers, "transfer")
  const unitIds = [
    ...new Set([
      ...balances.map((b) => b.inventoryUnitId),
      ...movements.map((m) => m.enteredInventoryUnitId),
      ...transfers.map((t) => t.inventoryUnitId),
    ]),
  ]
  const units = await tx.inventoryUnit.findMany({
    where: { id: { in: unitIds } },
    take: unitIds.length + 1,
  })
  complete(unitIds, units, "unit")
  const versionIds = [
    ...new Set([
      ...units.map((u) => u.configurationVersionId),
      ...transfers.map((t) => t.configurationVersionId),
    ]),
  ]
  const versions = await tx.unitConfigurationVersion.findMany({
    where: { id: { in: versionIds } },
    take: versionIds.length + 1,
  })
  complete(versionIds, versions, "unit version")
  const versionById = new Map(versions.map((v) => [v.id, v]))
  const unitById = new Map(
    units.map((u) => [
      u.id,
      {
        ...u,
        configurationVersion: required(
          versionById,
          u.configurationVersionId,
          "unit version",
        ),
      },
    ]),
  )
  const storeIds = [
    ...new Set([
      ...input.owners.map((op) => op.storeId),
      ...balances.map((b) => b.storeId),
      ...transfers.flatMap((t) => [t.sourceStoreId, t.targetStoreId]),
    ]),
  ]
  const stores = await tx.store.findMany({
    where: { id: { in: storeIds } },
    select: { id: true, tenantId: true, currencyCode: true },
    take: storeIds.length + 1,
  })
  complete(storeIds, stores, "Store")
  const productIds = [...new Set(balances.map((b) => b.productId))]
  const products = await tx.catalogProduct.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      catalogItemId: true,
      catalogItem: { select: { id: true, tenantId: true } },
    },
    take: 129,
  })
  complete(productIds, products, "Product")
  const variantIds = [...new Set(balances.map((b) => b.variantId))]
  const variants = await tx.sellableVariant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, catalogItemId: true },
    take: 129,
  })
  complete(variantIds, variants, "Variant")
  const poolIds = [
    ...new Set(
      movements.flatMap((m) =>
        m.valuationEvent ? [m.valuationEvent.poolId] : [],
      ),
    ),
  ]
  if (poolIds.length > 128)
    throw new FinanceError(
      "CONFLICT",
      "Original stock source event pools exceed connected bounds.",
    )
  const pools = poolIds.length
    ? await tx.financeInventoryPool.findMany({
        where: { id: { in: poolIds } },
        take: 129,
      })
    : []
  complete(poolIds, pools, "event pool")
  const storeById = new Map(stores.map((s) => [s.id, s]))
  const productById = new Map(products.map((p) => [p.id, p]))
  const variantById = new Map(variants.map((v) => [v.id, v]))
  const balanceRowsById = new Map(balances.map((b) => [b.id, b]))
  const poolById = new Map(pools.map((p) => [p.id, p]))
  const balanceById = new Map(
    balances.map((b) => [
      b.id,
      {
        ...b,
        store: required(storeById, b.storeId, "Store"),
        product: required(productById, b.productId, "Product"),
        variant: required(variantById, b.variantId, "Variant"),
        inventoryUnit: required(unitById, b.inventoryUnitId, "unit"),
        parentBalanceSource: b.parentBalanceSourceId
          ? required(balanceRowsById, b.parentBalanceSourceId, "custody parent")
          : null,
      },
    ]),
  )
  const transferGraphs = transfers.map((t) => ({
    ...t,
    sourceStore: required(storeById, t.sourceStoreId, "source Store"),
    targetStore: required(storeById, t.targetStoreId, "target Store"),
    sourceBalanceSource: required(
      balanceById,
      t.sourceBalanceSourceId,
      "transfer source",
    ),
    transitBalanceSource: t.transitBalanceSourceId
      ? required(balanceById, t.transitBalanceSourceId, "transit")
      : null,
    inventoryUnit: required(unitById, t.inventoryUnitId, "transfer unit"),
    configurationVersion: required(
      versionById,
      t.configurationVersionId,
      "transfer version",
    ),
  }))
  const transferById = new Map(
    transferGraphs.map((transfer) => [transfer.id, transfer]),
  )
  const dispatched = grouped(transferGraphs, (t) => t.dispatchedOperationId)
  const received = grouped(transferGraphs, (t) => t.receivedOperationId)
  const cancelled = grouped(transferGraphs, (t) => t.cancelledOperationId)
  return input.owners.map((op) => ({
    ...op,
    store: required(storeById, op.storeId, "operation Store"),
    transferAcknowledgment: op.transferAcknowledgment
      ? {
          ...op.transferAcknowledgment,
          transfer: required(
            transferById,
            op.transferAcknowledgment.transferId,
            "acknowledged transfer",
          ),
        }
      : null,
    movements: (movementsByOperation.get(op.id) ?? []).map((m) => ({
      ...m,
      enteredInventoryUnit: required(
        unitById,
        m.enteredInventoryUnitId,
        "entered unit",
      ),
      balanceSource: required(
        balanceById,
        m.balanceSourceId,
        "movement balance",
      ),
      valuationEvent: m.valuationEvent
        ? {
            ...m.valuationEvent,
            pool: required(poolById, m.valuationEvent.poolId, "event pool"),
          }
        : null,
    })),
    dispatchedTransfers: dispatched.get(op.id) ?? [],
    receivedTransfers: received.get(op.id) ?? [],
    cancelledTransfers: cancelled.get(op.id) ?? [],
  }))
}
