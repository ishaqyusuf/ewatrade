"use client"

import {
  type CollectionView,
  DirectoryCollection,
  DirectoryRecord,
} from "@/components/tables/core"
import type { DashboardCustomerRow } from "@/lib/sales-operations"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import type { Row } from "@tanstack/react-table"
import { formatCustomerDate, getCustomerContact } from "./columns"

export function CustomerCollection({
  rows,
  view,
  currencyCode,
}: {
  rows: Row<DashboardCustomerRow>[]
  view: CollectionView
  currencyCode: string
}) {
  return (
    <DirectoryCollection view={view} label="Customer">
      {rows.map((row) => {
        const customer = row.original
        return (
          <DirectoryRecord
            key={row.id}
            row={row}
            view={view}
            selectLabel={`Select ${customer.name}`}
            title={customer.name}
            description={getCustomerContact(customer)}
            details={[
              {
                label: "Orders",
                value: (
                  <span className="tabular-nums">{customer.orderCount}</span>
                ),
              },
              {
                label: "Total",
                value: (
                  <span className="tabular-nums">
                    {formatFinanceMoney(customer.totalMinor, currencyCode)}
                  </span>
                ),
              },
              { label: "Last order", value: customer.lastOrder.orderNumber },
              {
                label: "Last seen",
                value: formatCustomerDate(customer.lastSeenAt),
              },
            ]}
          />
        )
      })}
    </DirectoryCollection>
  )
}
