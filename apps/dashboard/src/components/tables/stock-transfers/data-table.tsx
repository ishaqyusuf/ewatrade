"use client"
import { InventoryLedgerFilters } from "@/components/inventory/inventory-ledger-filters"
import { StockTransferSheet } from "@/components/sheets/stock-transfer-sheet"
import { useInventoryLedgerParams } from "@/hooks/use-inventory-ledger-params"
import { useTRPC } from "@/trpc/client"
import type { TableSettings } from "@/utils/table-settings"
import { useSuspenseQuery } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import { InventoryLedgerTable } from "../inventory-ledger/data-table"
import { inventoryLabel } from "../inventory-ledger/format"
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
export function TransfersDataTable({
  storeId,
  initialSettings,
}: { storeId?: string; initialSettings: TableSettings }) {
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
  const record = data.find((row) => row.id === params.record) ?? null
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
          This transfer is not in the latest records for this store.{" "}
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
