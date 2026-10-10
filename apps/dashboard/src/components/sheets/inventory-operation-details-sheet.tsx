"use client"
import { parseAsString, useQueryStates } from "nuqs"
import { InventoryAuditSheet } from "./inventory-audit-sheet"
export function InventoryOperationDetailsSheet({
  storeId,
}: { storeId: string }) {
  const [{ inventoryOperation }, setParams] = useQueryStates(
    { inventoryOperation: parseAsString },
    { history: "push" },
  )
  return (
    <InventoryAuditSheet
      storeId={storeId}
      record={
        inventoryOperation
          ? { id: inventoryOperation, type: "Stock operation" }
          : null
      }
      onClose={() => void setParams({ inventoryOperation: null })}
    />
  )
}
