"use client"
import { InventoryLedgerFilters } from "@/components/inventory/inventory-ledger-filters"
import { InventoryAuditSheet } from "@/components/sheets/inventory-audit-sheet"
import { useInventoryLedgerParams } from "@/hooks/use-inventory-ledger-params"
import { useTRPC } from "@/trpc/client"
import type { DirectoryView } from "@/utils/directory-view-settings"
import type { TableSettings } from "@/utils/table-settings"
import { useSuspenseQuery } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import { InventoryLedgerTable } from "../inventory-ledger/data-table"
import { inventoryDate, inventoryLabel } from "../inventory-ledger/format"
import {
  type InventoryOperation,
  operationColumns,
  operationSortFields,
} from "./columns"
import { OperationsEmpty } from "./empty-states"
const getOperationLabel = (row: InventoryOperation) =>
  `${inventoryLabel(row.type)} ${row.id}`

function describeOperation(row: InventoryOperation) {
  const categories = row.categories.map((category) => category.name).join(", ")
  return {
    title: inventoryLabel(row.type),
    description: row.id,
    details: [
      { label: "Effective (UTC)", value: inventoryDate(row.effectiveAt) },
      { label: "Store", value: row.storeName },
      { label: "Categories", value: categories || "—" },
      { label: "Reason", value: row.reason || "—" },
      {
        label: "Movements",
        value: <span className="tabular-nums">{row.movementCount}</span>,
      },
    ],
  }
}

export function OperationsDataTable({
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
    trpc.inventory.operationHistory.queryOptions({ storeId, limit: 200 }),
  )
  const open = useCallback(
    (row: InventoryOperation) => void setParams({ record: row.id }),
    [setParams],
  )
  const columns = useMemo(() => operationColumns(open), [open])
  const query = (params.q ?? "").trim().toLowerCase()
  const rows = useMemo(
    () =>
      data.filter(
        (row) =>
          (!params.filter || row.type === params.filter) &&
          [
            row.id,
            inventoryLabel(row.type),
            row.reason,
            row.storeName,
            ...row.categories.map((c) => c.name),
          ]
            .join(" ")
            .toLowerCase()
            .includes(query),
      ),
    [data, params.filter, query],
  )
  const filters = useMemo(
    () => [
      { id: "all", label: "All operations" },
      ...Array.from(new Set(data.map((row) => row.type))).map((type) => ({
        id: type,
        label: inventoryLabel(type),
      })),
    ],
    [data],
  )
  const record = data.find((row) => row.id === params.record) ?? null
  return (
    <div className="grid gap-4">
      <InventoryLedgerFilters
        placeholder="Search operation, reason, or category..."
        filters={filters}
      />
      <p className="text-xs text-muted-foreground">
        Latest 200 operations in this view. Search and filters apply to these
        records.
      </p>
      <InventoryLedgerTable
        rows={rows}
        columns={columns}
        tableId="inventory-operations"
        initialSettings={initialSettings}
        sortFields={operationSortFields}
        label="Inventory operations"
        view={view}
        selectionScope={JSON.stringify([
          storeId ?? "all",
          query,
          params.filter,
        ])}
        getRecordLabel={getOperationLabel}
        describeRecord={describeOperation}
        onOpen={open}
        empty={
          <OperationsEmpty
            filtered={Boolean(params.q || params.filter)}
            onClear={() => void setParams({ q: null, filter: null })}
          />
        }
      />
      {params.record && !record ? (
        <output>
          This operation is not in the latest records for this store.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => void setParams({ record: null })}
          >
            Dismiss
          </button>
        </output>
      ) : null}
      <InventoryAuditSheet
        record={record}
        onClose={() => void setParams({ record: null })}
      />
    </div>
  )
}
