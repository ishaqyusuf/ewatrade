"use client"
import { InventoryLedgerFilters } from "@/components/inventory/inventory-ledger-filters"
import { InventoryAuditSheet } from "@/components/sheets/inventory-audit-sheet"
import { useInventoryLedgerParams } from "@/hooks/use-inventory-ledger-params"
import { useTRPC } from "@/trpc/client"
import type { TableSettings } from "@/utils/table-settings"
import { useSuspenseQuery } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import { InventoryLedgerTable } from "../inventory-ledger/data-table"
import { inventoryLabel } from "../inventory-ledger/format"
import {
  type InventoryOperation,
  operationColumns,
  operationSortFields,
} from "./columns"
import { OperationsEmpty } from "./empty-states"
export function OperationsDataTable({
  storeId,
  initialSettings,
}: { storeId?: string; initialSettings: TableSettings }) {
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
