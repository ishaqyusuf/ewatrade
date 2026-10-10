import { Prisma } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import { lockInventoryFinancialStores } from "./inventory-finance-locks"

/** Same order as posting: financial Books, transfer, then sorted balance rows. */
export async function lockStockTransferReview(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    sourceStoreId: string
    targetStoreId: string
    transferId?: string
    balanceSourceIds: string[]
  },
) {
  const ids = [...new Set(input.balanceSourceIds)].sort()
  if (
    !ids.length ||
    ids.length > 3 ||
    ids.some((id) => !id.trim()) ||
    input.sourceStoreId === input.targetStoreId
  )
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Transfer review scope is invalid.",
    )
  await lockInventoryFinancialStores(tx, {
    tenantId: input.tenantId,
    storeIds: [input.sourceStoreId, input.targetStoreId],
  })
  if (input.transferId) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "StockTransfer"
      WHERE "id" = ${input.transferId} AND "tenantId" = ${input.tenantId}
        AND "sourceStoreId" = ${input.sourceStoreId} AND "targetStoreId" = ${input.targetStoreId}
      FOR UPDATE
    `
    if (rows.length !== 1 || rows[0]?.id !== input.transferId)
      throw new CatalogError(
        "INVALID_STOCK_OPERATION",
        "Transfer changed before review.",
      )
  }
  const balances = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "StockBalanceSource"
    WHERE "id" IN (${Prisma.join(ids)}) AND "tenantId" = ${input.tenantId}
      AND "storeId" IN (${Prisma.join([input.sourceStoreId, input.targetStoreId])})
    ORDER BY "id" FOR UPDATE
  `
  if (
    balances.length !== ids.length ||
    new Set(balances.map((row) => row.id)).size !== ids.length ||
    balances.some((row) => !ids.includes(row.id))
  )
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Transfer balances changed before review.",
    )
}
