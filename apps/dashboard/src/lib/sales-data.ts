import {
  type DashboardCustomerRow,
  canReviewCustomerBalances,
} from "@/lib/sales-operations"
import { prisma } from "@ewatrade/db"
import {
  type CustomerBookFilter,
  getCustomerBookOwedSummary,
  listCustomerBookPage,
  resolveOrderScope,
} from "@ewatrade/db/queries"

/**
 * One page of the store's customer book (50 by default) with search and the
 * balance filter applied in SQL; one statement after the order scope.
 * Balances come only for roles allowed to see them.
 */
export async function getDashboardCustomerPage(input: {
  /** Balances load in this currency; leave it out when they are not shown. */
  currencyCode?: string
  role: string
  search?: string
  filter?: CustomerBookFilter
  cursor?: string
  limit?: number
  storeId: string
  tenantId: string
  userId: string
}): Promise<{ customers: DashboardCustomerRow[]; nextCursor: string | null }> {
  const scope = await resolveOrderScope(prisma, {
    ...input,
    activeStoreId: input.storeId,
    allowedStoreIds: [input.storeId],
  })
  const balances = Boolean(
    input.currencyCode && canReviewCustomerBalances(input.role),
  )
  const page = await listCustomerBookPage(prisma, {
    ...scope,
    storeId: input.storeId,
    // Saved customers belong to the business; own-sales views leave them out.
    includeSavedCustomers: !scope.createdByUserId,
    currencyCode: balances ? input.currencyCode : undefined,
    query: input.search,
    filter: balances ? input.filter : "all",
    cursor: input.cursor,
    limit: input.limit,
  })
  return {
    customers: page.rows.map(
      (customer) =>
        ({
          ...customer,
          firstSeenAt: customer.firstSeenAt.toISOString(),
          lastOrder: customer.lastOrder
            ? {
                ...customer.lastOrder,
                createdAt: customer.lastOrder.createdAt.toISOString(),
              }
            : null,
          lastSeenAt: customer.lastSeenAt.toISOString(),
        }) satisfies DashboardCustomerRow,
    ),
    nextCursor: page.nextCursor,
  }
}

/** Global search: the first matches only. */
export async function getDashboardCustomerBook(
  input: Parameters<typeof getDashboardCustomerPage>[0],
) {
  return (
    await getDashboardCustomerPage({ ...input, limit: input.limit ?? 10 })
  ).customers
}

/** "Owed to you": one aggregate over every customer account, owners/admins. */
export async function getDashboardOwedSummary(input: {
  role: string
  tenantId: string
  currencyCode: string
}) {
  if (!canReviewCustomerBalances(input.role)) return null
  return getCustomerBookOwedSummary(prisma, input)
}
