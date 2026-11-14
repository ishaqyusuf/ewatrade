"use client"

import { useQueryStates } from "nuqs"
import { parseAsString, parseAsStringEnum } from "nuqs/server"
import { type OrderFilters, orderFilterParams } from "./use-order-filter-params"

export const orderSheetParams = {
  orderSheet: parseAsStringEnum(["create", "details"] as const),
  orderId: parseAsString,
}

export function useOrderParams() {
  const [params, setParams] = useQueryStates({
    ...orderSheetParams,
    ...orderFilterParams,
  })
  const filter: OrderFilters = {
    query: params.orderQuery,
    status: params.orderStatus,
    owing: params.orderOwing === true,
  }

  return {
    filter,
    hasFilters: Boolean(filter.query?.trim() || filter.status || filter.owing),
    query: params.orderQuery ?? "",
    setFilter: (values: Partial<OrderFilters> | null) =>
      setParams(
        values === null
          ? { orderQuery: null, orderStatus: null, orderOwing: null }
          : {
              orderQuery: values.query,
              orderStatus: values.status,
              orderOwing:
                values.owing === undefined ? undefined : values.owing || null,
            },
      ),
    setParams,
    sheet: params.orderSheet,
    orderId: params.orderId,
  }
}
