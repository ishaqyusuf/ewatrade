import {
  type DashboardCustomerRow,
  type DashboardSaleRow,
  type DashboardSessionRow,
  getSalesActorScope,
} from "@/lib/sales-operations"
import { prisma } from "@ewatrade/db"
import {
  getRetailOpsCustomerBook,
  listRetailOpsCreditSales,
  listRetailOpsPaymentReconciliation,
  listRetailOpsRecentSales,
  listRetailOpsSessions,
} from "@ewatrade/db/queries"

function toJson<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export async function getDashboardSalesOperations(input: {
  role: string
  sessionStatus?: "all" | "closed" | "open"
  storeId: string
  tenantId: string
  userId: string
}) {
  const actorUserId = getSalesActorScope(input.role, input.userId)
  const [sales, creditSales, sessions, reconciliation] = await Promise.all([
    listRetailOpsRecentSales(prisma, {
      actorUserId,
      limit: 50,
      storeId: input.storeId,
      tenantId: input.tenantId,
    }),
    listRetailOpsCreditSales(prisma, {
      actorUserId,
      limit: 50,
      storeId: input.storeId,
      tenantId: input.tenantId,
    }),
    listRetailOpsSessions(prisma, {
      limit: 50,
      status: input.sessionStatus ?? "all",
      storeId: input.storeId,
      tenantId: input.tenantId,
      userId: actorUserId,
    }),
    listRetailOpsPaymentReconciliation(prisma, {
      storeId: input.storeId,
      tenantId: input.tenantId,
      userId: actorUserId,
    }),
  ])

  return {
    creditSales: toJson<unknown[]>(creditSales),
    reconciliation: toJson<DashboardSessionRow[]>(reconciliation),
    sales: toJson<DashboardSaleRow[]>(sales),
    sessions: toJson<DashboardSessionRow[]>(sessions),
  }
}

export async function getDashboardCustomerBook(input: {
  role: string
  search?: string
  storeId: string
  tenantId: string
  userId: string
}) {
  const customers = await getRetailOpsCustomerBook(prisma, {
    actorUserId: getSalesActorScope(input.role, input.userId),
    limit: 75,
    search: input.search,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })

  return toJson<DashboardCustomerRow[]>(customers)
}
