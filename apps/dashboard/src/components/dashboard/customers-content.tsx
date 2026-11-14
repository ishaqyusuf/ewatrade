import { CustomersPage } from "@/components/dashboard/customers-page"
import { getDashboardCustomerBook } from "@/lib/sales-data"
import { canReviewCustomerBalances } from "@/lib/sales-operations"
import type { TenantStore } from "@/lib/tenant"

/** Loads the whole customer book once; search and filters run on the device. */
export async function CustomersContent({
  store,
  tenantId,
  userId,
  role,
}: {
  store: TenantStore
  tenantId: string
  userId: string
  role: string
}) {
  const customers = await getDashboardCustomerBook({
    currencyCode: store.currencyCode,
    role,
    storeId: store.id,
    tenantId,
    userId,
  })
  return (
    <CustomersPage
      key={`${tenantId}:${store.id}`}
      initialCustomers={customers}
      canSeeBalances={canReviewCustomerBalances(role)}
      store={store}
    />
  )
}
