import { PageHeader } from "@/components/page-header"
import { InventoryOperationMenu } from "./inventory-operation-menu"

export function InventoryHeader({ storeName }: { storeName: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <PageHeader
        eyebrow={storeName}
        title="Inventory"
        description="Know what’s on hand and ready to sell."
      />
      <InventoryOperationMenu />
    </div>
  )
}
