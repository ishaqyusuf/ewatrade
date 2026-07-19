"use client"

import { DashboardTable } from "@/components/dashboard/dashboard-table"
import { useOrderParams } from "@/hooks/use-order-params"
import { useTRPC } from "@/trpc/client"
import { useSuspenseQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { orderColumns } from "./columns"
import { OrdersEmptyState } from "./empty-states"

export function OrdersDataTable({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
  const { query } = useOrderParams()
  const { data } = useSuspenseQuery(
    trpc.orders.list.queryOptions({ limit: 100, storeId }, { retry: false }),
  )
  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return data
    return data.filter((order) =>
      [
        order.orderNumber,
        order.customerName ?? "",
        order.customerPhone ?? "",
        ...order.lines.map((line) => line.snapshot?.catalogItemName ?? ""),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    )
  }, [data, query])

  return (
    <DashboardTable
      rows={rows}
      columns={orderColumns}
      getRowKey={(order) => order.id}
      emptyState={<OrdersEmptyState filtered={Boolean(query.trim())} />}
    />
  )
}
