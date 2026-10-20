import {
  type DashboardCustomerRow,
  canReviewCustomerBalances,
} from "@/lib/sales-operations"
import { prisma } from "@ewatrade/db"
import {
  listCustomerBook,
  listCustomerLedgerBalances,
  resolveOrderScope,
} from "@ewatrade/db/queries"

export async function getDashboardCustomerBook(input: {
  /** Balances load in this currency; leave it out when they are not shown. */
  currencyCode?: string
  role: string
  search?: string
  storeId: string
  tenantId: string
  userId: string
}) {
  const scope = await resolveOrderScope(prisma, {
    ...input,
    activeStoreId: input.storeId,
    allowedStoreIds: [input.storeId],
  })
  const customers = await listCustomerBook(prisma, {
    ...scope,
    query: input.search,
    storeId: input.storeId,
    // Saved customers belong to the business; own-sales views leave them out.
    includeSavedCustomers: !scope.createdByUserId,
  })
  const balances =
    input.currencyCode && canReviewCustomerBalances(input.role)
      ? await listCustomerLedgerBalances(prisma, {
          tenantId: input.tenantId,
          currencyCode: input.currencyCode,
          customerIds: [
            ...new Set(
              customers.flatMap((customer) =>
                customer.customerId ? [customer.customerId] : [],
              ),
            ),
          ],
        })
      : new Map()

  return customers.map((customer) => {
    const balance = customer.customerId
      ? balances.get(customer.customerId)
      : undefined
    return {
      ...customer,
      balance: balance
        ? {
            owedMinor: balance.outstandingDebtMinor,
            paidAheadMinor: balance.availableCreditMinor,
            netMinor: balance.netBalanceMinor,
          }
        : null,
      firstSeenAt: customer.firstSeenAt.toISOString(),
      lastOrder: customer.lastOrder
        ? {
            ...customer.lastOrder,
            createdAt: customer.lastOrder.createdAt.toISOString(),
          }
        : null,
      lastSeenAt: customer.lastSeenAt.toISOString(),
    } satisfies DashboardCustomerRow
  })
}
