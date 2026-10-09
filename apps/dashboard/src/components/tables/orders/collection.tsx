"use client"

import { OrderStatusDot } from "@/components/orders/order-status"
import {
  type CollectionView,
  DirectoryCollection,
  DirectoryRecord,
} from "@/components/tables/core"
import { useOrderParams } from "@/hooks/use-order-params"
import { formatOrderItemGroups } from "@/lib/order-item-descriptions"
import type { Row } from "@tanstack/react-table"
import { OrderActionsMenu } from "./action-menu"
import { type OrderRow, formatOrderMoney, getOrderCustomer } from "./columns"

export function OrdersCollection({
  rows,
  view,
}: {
  rows: Row<OrderRow>[]
  view: CollectionView
}) {
  const { setParams } = useOrderParams()
  return (
    <DirectoryCollection view={view} label="Order">
      {rows.map((row) => {
        const order = row.original
        return (
          <DirectoryRecord
            key={row.id}
            row={row}
            view={view}
            selectLabel={`Select ${order.orderNumber}`}
            title={order.orderNumber}
            onOpen={() =>
              void setParams({ orderSheet: "details", orderId: order.id })
            }
            description={getOrderCustomer(order)}
            badges={<OrderStatusDot status={order.status} />}
            details={[
              {
                label: "Items",
                value: formatOrderItemGroups(order.lines)
                  .map((group) => group.name)
                  .join(", "),
              },
              {
                label: "Total",
                value: (
                  <span className="tabular-nums">
                    {formatOrderMoney(order.totalMinor, order.currencyCode)}
                  </span>
                ),
              },
            ]}
            actions={<OrderActionsMenu order={order} />}
          />
        )
      })}
    </DirectoryCollection>
  )
}
