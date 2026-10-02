import type { DashboardCustomerRow } from "@/lib/sales-operations"
import { prisma } from "@ewatrade/db"
import { listCustomerOrderDirectory } from "@ewatrade/db/queries"

export async function getDashboardCustomerBook(input: {
  role: string
  search?: string
  storeId: string
  tenantId: string
  userId: string
}) {
  const customers = await listCustomerOrderDirectory(prisma, {
    query: input.search,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })

  return customers.map(
    (customer) =>
      ({
        ...customer,
        firstSeenAt: customer.firstSeenAt.toISOString(),
        lastOrder: {
          ...customer.lastOrder,
          createdAt: customer.lastOrder.createdAt.toISOString(),
        },
        lastSeenAt: customer.lastSeenAt.toISOString(),
      }) satisfies DashboardCustomerRow,
  )
}
