import type { Prisma } from "../../../generated/prisma/client"
import { stockOwnerInclude } from "./inventory-stock-owner-include"
import { readReviewedCostStockGraphs } from "./reviewed-cost-stock-graphs"
import { FinanceError } from "./rules"

/** Load each shared entity once instead of repeating a deep graph per movement. */
export async function readInventoryRelocationGraph(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; stockOperationId: string },
) {
  const identity = await tx.stockOperation.findFirst({
    where: { id: input.stockOperationId, tenantId: input.tenantId },
    include: {
      store: stockOwnerInclude.store,
      transferAcknowledgment: stockOwnerInclude.transferAcknowledgment,
      committedReservation: stockOwnerInclude.committedReservation,
      _count: stockOwnerInclude._count,
    },
  })
  if (!identity)
    throw new FinanceError("NOT_FOUND", "Stock operation not found.")
  if (identity.id !== input.stockOperationId || identity.tenantId !== input.tenantId)
    throw new FinanceError("CONFLICT", "Inventory relocation owner scope changed.")
  const hasCompetingOwners =
    identity._count.purchaseReceipts > 0 ||
    identity._count.productFulfillments > 0 ||
    identity._count.productReturns > 0
  const competing = hasCompetingOwners
    ? await tx.stockOperation.findFirst({
        where: { id: identity.id, tenantId: input.tenantId },
        select: {
          purchaseReceipts: stockOwnerInclude.purchaseReceipts,
          productFulfillments: stockOwnerInclude.productFulfillments,
          productReturns: stockOwnerInclude.productReturns,
        },
      })
    : { purchaseReceipts: [], productFulfillments: [], productReturns: [] }
  if (!competing)
    throw new FinanceError(
      "CONFLICT",
      "Inventory relocation owner disappeared.",
    )
  const owner = { ...identity, ...competing }
  if (owner._count.movements !== 2)
    throw new FinanceError(
      "CONFLICT",
      "Inventory relocation requires exactly two movements.",
    )
  const movements = await tx.stockMovement.findMany({
    where: { operationId: owner.id },
    include: {
      purchaseReceipt: { select: { id: true } },
      valuationEvent: true,
    },
    take: 3,
  })
  if (movements.length !== 2)
    throw new FinanceError(
      "CONFLICT",
      "Inventory relocation movement set changed.",
    )
  const transfers = await tx.stockTransfer.findMany({
    where: {
      OR: [
        { dispatchedOperationId: owner.id },
        { receivedOperationId: owner.id },
        { cancelledOperationId: owner.id },
        ...(owner.transferAcknowledgment
          ? [{ id: owner.transferAcknowledgment.transferId }]
          : []),
      ],
    },
    take: 4,
  })
  if (transfers.length > 1)
    throw new FinanceError(
      "CONFLICT",
      "Inventory relocation has conflicting transfer owners.",
    )
  const directIds = [
    ...new Set([
      ...movements.map((movement) => movement.balanceSourceId),
      ...transfers.flatMap((transfer) => [
        transfer.sourceBalanceSourceId,
        ...(transfer.transitBalanceSourceId
          ? [transfer.transitBalanceSourceId]
          : []),
      ]),
    ]),
  ]
  const balances = await tx.stockBalanceSource.findMany({
    where: { id: { in: directIds } },
    take: directIds.length + 1,
  })
  if (
    balances.length !== directIds.length ||
    balances.some((balance) => !directIds.includes(balance.id))
  )
    throw new FinanceError(
      "CONFLICT",
      "Inventory relocation balance set changed.",
    )
  const balanceSourceIds = [
    ...new Set([
      ...directIds,
      ...balances.flatMap((balance) =>
        balance.parentBalanceSourceId ? [balance.parentBalanceSourceId] : [],
      ),
    ]),
  ]
  const parentIds = balanceSourceIds.filter((id) => !directIds.includes(id))
  const parents = parentIds.length
    ? await tx.stockBalanceSource.findMany({
        where: { id: { in: parentIds } },
        take: parentIds.length + 1,
      })
    : []
  const graphs = await readReviewedCostStockGraphs(tx, {
    owners: [owner],
    balanceSourceIds,
    transferIds: transfers.map((transfer) => transfer.id),
    records: { movements, balances: [...balances, ...parents], transfers },
  })
  const graph = graphs[0]
  if (!graph)
    throw new FinanceError(
      "CONFLICT",
      "Inventory relocation graph is incomplete.",
    )
  return graph
}
