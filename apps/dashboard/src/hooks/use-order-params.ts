"use client"

import { useQueryStates } from "nuqs"
import { parseAsString, parseAsStringEnum } from "nuqs/server"
import { type OrderFilters, orderFilterParams } from "./use-order-filter-params"

export function useOrderParams() {
  const [params, setParams] = useQueryStates({
    orderSheet: parseAsStringEnum(["create", "details"] as const),
    orderId: parseAsString,
    ...orderFilterParams,
  })
  const filter: OrderFilters = {
    query: params.orderQuery,
    status: params.orderStatus,
  }

  return {
    filter,
    hasFilters: Boolean(filter.query?.trim() || filter.status),
    query: params.orderQuery ?? "",
    setFilter: (values: Partial<OrderFilters> | null) =>
      setParams(
        values === null
          ? { orderQuery: null, orderStatus: null }
          : {
              orderQuery: values.query,
              orderStatus: values.status,
            },
      ),
    setParams,
    sheet: params.orderSheet,
    orderId: params.orderId,
  }
}
