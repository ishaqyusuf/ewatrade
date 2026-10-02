import { createLoader, parseAsString, parseAsStringEnum } from "nuqs/server"

export const ORDER_STATUSES = [
  "DRAFT",
  "PENDING",
  "CONFIRMED",
  "FULFILLING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
] as const

export const orderFilterParams = {
  orderQuery: parseAsString,
  orderStatus: parseAsStringEnum(ORDER_STATUSES),
}

export type OrderFilters = {
  query: string | null
  status: (typeof ORDER_STATUSES)[number] | null
}

const loadOrderFilterState = createLoader(orderFilterParams)

export async function loadOrderFilterParams(
  searchParams: Parameters<typeof loadOrderFilterState>[0],
): Promise<OrderFilters> {
  const params = await loadOrderFilterState(searchParams)
  return {
    query: params.orderQuery,
    status: params.orderStatus,
  }
}

export function getOrderListPageInput(filter: OrderFilters) {
  return {
    limit: 25,
    query: filter.query?.trim().slice(0, 160) || undefined,
    queryMode: "all" as const,
    statuses: filter.status ? [filter.status] : undefined,
  }
}
