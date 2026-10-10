"use client"
import { InventoryLedgerFilters } from "@/components/inventory/inventory-ledger-filters"
import { useStockTransferParams } from "@/hooks/use-stock-transfer-params"
import { useInventoryLedgerParams } from "@/hooks/use-inventory-ledger-params"
import { formatInventoryQuantity } from "@/lib/inventory-view"
import { useTRPC } from "@/trpc/client"
import type { DirectoryView } from "@/utils/directory-view-settings"
import type { TableSettings } from "@/utils/table-settings"
import { Badge } from "@ewatrade/ui"
import { useSuspenseQuery } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import { InventoryLedgerTable } from "../inventory-ledger/data-table"
import { inventoryDate, inventoryLabel } from "../inventory-ledger/format"
import {
  type StockTransfer,
  transferColumns,
  transferSortFields,
} from "./columns"
import { TransfersEmpty } from "./empty-states"
const filters = [
  { id: "all", label: "All transfers" },
  { id: "incoming", label: "Incoming" },
  { id: "outgoing", label: "Outgoing" },
  { id: "IN_TRANSIT", label: "In transit" },
  { id: "RECEIVED", label: "Received" },
  { id: "CANCELLED", label: "Cancelled" },
]
const getTransferLabel = (row: StockTransfer) =>
  `${row.productName} ${row.variantName} transfer ${row.id}`

function describeTransfer(row: StockTransfer) {
  return {
    title: row.productName,
    description: row.variantName,
    badges: <Badge variant="outline">{inventoryLabel(row.status)}</Badge>,
    details: [
      {
        label: "Quantity",
        value: (
          <span className="tabular-nums">
            {formatInventoryQuantity(row.quantity)} {row.inventoryUnitName}
          </span>
        ),
      },
      { label: "From", value: row.sourceStore.name },
      { label: "To", value: row.targetStore.name },
      { label: "Created (UTC)", value: inventoryDate(row.createdAt) },
    ],
  }
}

export function TransfersDataTable({
  storeId,
  initialSettings,
  view,
}: {
  storeId?: string
  initialSettings: TableSettings
  view: DirectoryView
}) {
  const trpc = useTRPC()
  const { params, setParams } = useInventoryLedgerParams()
  const { open: openTransfer } = useStockTransferParams()
  const { data } = useSuspenseQuery(
    trpc.inventory.transfers.queryOptions({ storeId, limit: 200 }),
  )
  const open = useCallback(
    (row: StockTransfer) => void openTransfer(row.id),
    [openTransfer],
  )
  const columns = useMemo(() => transferColumns(open), [open])
  const query = (params.q ?? "").trim().toLowerCase()
  const rows = useMemo(
    () =>
      data.filter(
        (row) =>
          (!params.filter ||
            (params.filter === "incoming"
              ? row.targetStore.id === storeId
              : params.filter === "outgoing"
                ? row.sourceStore.id === storeId
                : row.status === params.filter)) &&
          [
            row.id,
            row.productName,
            row.variantName,
            row.inventoryUnitName,
            row.sourceStore.name,
            row.targetStore.name,
            inventoryLabel(row.status),
          ]
            .join(" ")
            .toLowerCase()
            .includes(query),
      ),
    [data, params.filter, query, storeId],
  )
  return (
    <div className="grid gap-4">
      <InventoryLedgerFilters
        placeholder="Search product, variant, or store..."
        filters={
          storeId
            ? filters
            : filters.filter(
                (filter) => !["incoming", "outgoing"].includes(filter.id),
              )
        }
      />
      <p className="text-xs text-muted-foreground">
        Latest 200 transfers in this view. Search and filters apply to these
        records.
      </p>
      <InventoryLedgerTable
        rows={rows}
        columns={columns}
        tableId="stock-transfers"
        initialSettings={initialSettings}
        sortFields={transferSortFields}
        label="Stock transfers"
        view={view}
        selectionScope={JSON.stringify([
          storeId ?? "all",
          query,
          params.filter,
        ])}
        getRecordLabel={getTransferLabel}
        describeRecord={describeTransfer}
        onOpen={open}
        empty={
          <TransfersEmpty
            filtered={Boolean(params.q || params.filter)}
            onClear={() => void setParams({ q: null, filter: null })}
          />
        }
      />
    </div>
  )
}
