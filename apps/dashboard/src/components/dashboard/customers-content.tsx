import { CustomersPage } from "@/components/dashboard/customers-page"
import {
  getDashboardCustomerPage,
  getDashboardOwedSummary,
} from "@/lib/sales-data"
import { canReviewCustomerBalances } from "@/lib/sales-operations"
import type { TenantStore } from "@/lib/tenant"

/**
 * First page of the customer book (search and filter from the URL, applied in
 * SQL) and the "Owed to you" aggregate; Load more reads the next pages.
 */
export async function CustomersContent({
  store,
  tenantId,
  userId,
  role,
  search,
  filter,
}: {
  store: TenantStore
  tenantId: string
  userId: string
  role: string
  search: string
  filter: "all" | "owe" | "ahead"
}) {
  const [page, owed] = await Promise.all([
    getDashboardCustomerPage({
      currencyCode: store.currencyCode,
      role,
      search: search.trim() || undefined,
      filter,
      storeId: store.id,
      tenantId,
      userId,
    }),
    getDashboardOwedSummary({
      role,
      tenantId,
      currencyCode: store.currencyCode,
    }),
  ])
  return (
    <CustomersPage
      key={`${tenantId}:${store.id}`}
      initialPage={page}
      initialOwed={owed}
      initialKey={`${search.trim()}:${filter}`}
      canSeeBalances={canReviewCustomerBalances(role)}
      store={store}
    />
  )
}
