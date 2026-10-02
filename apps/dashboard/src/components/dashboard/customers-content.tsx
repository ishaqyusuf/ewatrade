import { CustomersPage } from "@/components/dashboard/customers-page"
import { getDashboardCustomerBook } from "@/lib/sales-data"
import type { TenantStore } from "@/lib/tenant"
import type { TableSettings } from "@/utils/table-settings"

export async function CustomersContent({
  store,
  tenantId,
  userId,
  role,
  search,
  initialSettings,
}: {
  store: TenantStore
  tenantId: string
  userId: string
  role: string
  search: string
  initialSettings?: Partial<TableSettings>
}) {
  const customers = await getDashboardCustomerBook({
    role,
    search: search.trim() || undefined,
    storeId: store.id,
    tenantId,
    userId,
  })
  return (
    <CustomersPage
      key={`${tenantId}:${store.id}`}
      initialQuery={search}
      initialCustomers={customers}
      initialSettings={initialSettings}
      store={store}
    />
  )
}
