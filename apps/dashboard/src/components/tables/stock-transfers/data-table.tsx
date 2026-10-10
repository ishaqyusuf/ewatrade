"use client"
import { InventoryLedgerFilters } from "@/components/inventory/inventory-ledger-filters"
import { StockTransferSheet } from "@/components/sheets/stock-transfer-sheet"
import { useInventoryLedgerParams } from "@/hooks/use-inventory-ledger-params"
import { formatInventoryQuantity } from "@/lib/inventory-view"
import { useTRPC } from "@/trpc/client"
import type { DirectoryView } from "@/utils/directory-view-settings"
import type { TableSettings } from "@/utils/table-settings"
import { Badge } from "@ewatrade/ui"
import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
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
  const { data } = useSuspenseQuery(
    trpc.inventory.transfers.queryOptions({ storeId, limit: 200 }),
  )
  const open = useCallback(
    (row: StockTransfer) => void setParams({ record: row.id }),
    [setParams],
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
  const listedRecord = data.find((row) => row.id === params.record) ?? null
  const saved = useQuery(trpc.inventory.transferReview.queryOptions(
    { transferId: params.record ?? "", storeId },
    { enabled: Boolean(params.record && !listedRecord) },
  ))
  const record: StockTransfer | null = listedRecord ?? (saved.data && params.record === saved.data.id ? {
    id: saved.data.id,
    createdAt: saved.data.createdAt,
    inventoryUnitName: saved.data.unitName,
    productName: saved.data.productName,
    variantName: saved.data.variantName,
    quantity: saved.data.dispatchedQuantity,
    remainingQuantity: saved.data.transit?.quantity ?? "0",
    sourceStore: saved.data.sourceStore,
    targetStore: saved.data.targetStore,
    transitRevision: saved.data.transit?.revision ?? null,
    status: saved.data.status,
  } : null)
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
      {params.record && !record ? (
        <output>
          {saved.isPending ? "Loading saved transfer…" : "This transfer is unavailable in the selected Store. Check access to both Stores."}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => void setParams({ record: null })}
          >
            Dismiss
          </button>
        </output>
      ) : null}
      <StockTransferSheet
        key={record?.id ?? "closed"}
        record={record}
        storeId={storeId}
        onClose={() => void setParams({ record: null })}
      />
    </div>
  )
}
