"use client"
import { useInventoryParams } from "@/hooks/use-inventory-params"
import { Button } from "@ewatrade/ui"
import { ArrowDataTransferHorizontalIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
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
      <HugeiconsIcon
        icon={ArrowDataTransferHorizontalIcon}
        data-icon="inline-start"
        aria-hidden="true"
      />
      Send stock
    </Button>
  )
}
