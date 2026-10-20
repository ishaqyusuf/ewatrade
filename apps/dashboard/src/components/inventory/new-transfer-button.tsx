"use client"
import { useInventoryParams } from "@/hooks/use-inventory-params"
import { Button } from "@ewatrade/ui"
export function NewTransferButton() {
  const { setParams } = useInventoryParams()
  return (
    <Button
      className="rounded-none"
      onClick={() =>
        void setParams({
          inventoryOperation: "transfer",
          inventoryProduct: null,
          inventoryBalance: null,
          inventoryPreset: null,
        })
      }
    >
      New transfer
    </Button>
  )
}
