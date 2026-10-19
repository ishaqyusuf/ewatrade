"use client"
import { INVENTORY_OPERATION_MODES } from "@/hooks/use-inventory-params"
import { parseAsString, useQueryStates } from "nuqs"
import { InventoryAuditSheet } from "./inventory-audit-sheet"
export function InventoryOperationDetailsSheet({
  storeId,
}: { storeId: string }) {
  const [{ inventoryOperation }, setParams] = useQueryStates(
    { inventoryOperation: parseAsString },
    { history: "push" },
  )
  // This URL key also selects stock-entry forms. A mode is never a record ID.
  const formMode = INVENTORY_OPERATION_MODES.some(
    (mode) => mode === inventoryOperation,
  )
  return (
    <InventoryAuditSheet
      storeId={storeId}
      record={
        inventoryOperation && !formMode
          ? { id: inventoryOperation, type: "Stock operation" }
          : null
      }
      onClose={() => void setParams({ inventoryOperation: null })}
    />
  )
}
