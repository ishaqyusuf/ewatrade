import { InventoryHeader } from "@/components/inventory/inventory-header"
import { InventoryOperationSheet } from "@/components/sheets/inventory-operation-sheet"
import { InventoryDataTable } from "@/components/tables/inventory/data-table"
type StoreSummary = { currencyCode: string; id: string; name: string }

export function InventoryPage({ store }: { store: StoreSummary }) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <InventoryHeader storeName={store.name} />
      <InventoryDataTable storeId={store.id} />
      <InventoryOperationSheet store={store} />
    </div>
  )
}
