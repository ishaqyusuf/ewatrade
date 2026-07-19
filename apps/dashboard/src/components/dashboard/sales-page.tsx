import { OrdersHeader } from "@/components/orders/orders-header"
import { OrderCreateSheet } from "@/components/sheets/order-create-sheet"
import { OrdersDataTable } from "@/components/tables/orders/data-table"
type StoreSummary = { currencyCode: string; id: string; name: string }

export function SalesPage({ store }: { store: StoreSummary }) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <OrdersHeader storeName={store.name} />
      <OrdersDataTable storeId={store.id} />
      <OrderCreateSheet store={store} />
    </div>
  )
}
