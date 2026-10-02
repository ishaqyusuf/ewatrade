import type { Prisma } from "../../../generated/prisma/client"
import { FinanceError } from "./rules"

/** Read-only original receipt ownership, including uncosted/no-Book legacy roots. */
export async function findInventoryOpeningOwnerInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    storeId: string
    payloadHash: string
    clientOperationId: string
    source: string
    catalogItemIds: string[]
  },
) {
  const graduation = input.source === "service_commerce_catalog_graduation"
  if (!graduation && input.source !== "catalog_setup") return null
  if (input.catalogItemIds.length === 0) return null
  const itemIds = [...new Set(input.catalogItemIds)]
  if (itemIds.length !== 1)
    throw new FinanceError(
      "CONFLICT",
      "An opening cannot mix unrelated Catalog owners.",
    )
  const candidates = await tx.catalogCommandReceipt.findMany({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      catalogItemId: itemIds[0],
      payloadHash: input.payloadHash,
      commandType: graduation
        ? "GRADUATE_CATALOG_OFFERING"
        : "CREATE_CATALOG_ITEM",
    },
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      catalogItemId: true,
      payloadHash: true,
      commandType: true,
      clientOperationId: true,
    },
    take: 2,
  })
  const owners = candidates.filter((receipt) => {
    const prefix = `${receipt.clientOperationId}:opening-stock`
    return (
      receipt.tenantId === input.tenantId &&
      receipt.storeId === input.storeId &&
      receipt.catalogItemId === itemIds[0] &&
      receipt.payloadHash === input.payloadHash &&
      receipt.commandType ===
        (graduation ? "GRADUATE_CATALOG_OFFERING" : "CREATE_CATALOG_ITEM") &&
      (graduation
        ? input.clientOperationId === prefix
        : input.clientOperationId.startsWith(`${prefix}:`) &&
          input.clientOperationId.length > prefix.length + 1)
    )
  })
  if (candidates.length > 1 || owners.length > 1)
    throw new FinanceError(
      "CONFLICT",
      "Opening receipt ownership is ambiguous.",
    )
  return owners[0] ?? null
}
