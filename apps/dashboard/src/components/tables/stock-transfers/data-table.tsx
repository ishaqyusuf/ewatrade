"use client"
import { useInventoryLedgerParams } from "@/hooks/use-inventory-ledger-params"
import { useStockTransferParams } from "@/hooks/use-stock-transfer-params"
import { stockDate, transferStatusLabel } from "@/lib/inventory-labels"
import { useTRPC } from "@/trpc/client"
import type { DirectoryView } from "@/utils/directory-view-settings"
import type { TableSettings } from "@/utils/table-settings"
import { useSuspenseQuery } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import { InventoryLedgerTable } from "../inventory-ledger/data-table"
import {
  type StockTransfer,
  TransferStatusBadge,
  transferColumns,
  transferProductDetail,
  transferQuantityText,
  transferSortFields,
} from "./columns"
import { TransfersEmpty } from "./empty-states"

/** Status filters, plus Coming in / Going out when one store is open. */
export function transferFilters(singleStore: boolean) {
  return [
    { id: "all", label: "All" },
    { id: "IN_TRANSIT", label: "On the way" },
    { id: "RECEIVED", label: "Received" },
    { id: "CANCELLED", label: "Cancelled" },
    ...(singleStore
      ? [
          { id: "incoming", label: "Coming in" },
          { id: "outgoing", label: "Going out" },
        ]
      : []),
  ]
}
const getTransferLabel = (row: StockTransfer) =>
  `${row.productName}, sent ${stockDate(row.createdAt)}`

function describeTransfer(row: StockTransfer) {
  return {
    title: row.productName,
    description: transferProductDetail(row) ?? undefined,
    badges: <TransferStatusBadge status={row.status} />,
    details: [
      {
        label: "Quantity",
        value: (
          <span className="tabular-nums">{transferQuantityText(row)}</span>
        ),
      },
      {
        label: "From → To",
        value: `${row.sourceStore.name} → ${row.targetStore.name}`,
      },
      { label: "Sent", value: stockDate(row.createdAt) },
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
            row.productName,
            row.variantName,
            row.inventoryUnitName,
            row.sourceStore.name,
            row.targetStore.name,
            transferStatusLabel(row.status),
          ]
            .join(" ")
            .toLowerCase()
            .includes(query),
      ),
    [data, params.filter, query, storeId],
  )
  return (
    <div className="grid gap-4">
      <InventoryLedgerTable
        rows={rows}
        columns={columns}
        tableId="stock-transfers"
        initialSettings={initialSettings}
        sortFields={transferSortFields}
        label="Transfers"
        summary={`${rows.length} transfer${rows.length === 1 ? "" : "s"}${data.length >= 200 ? " · showing the latest 200" : ""}`}
        viewLabel="View transfer"
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
