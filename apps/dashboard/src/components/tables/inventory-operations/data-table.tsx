"use client"
import { InventoryAuditSheet } from "@/components/sheets/inventory-audit-sheet"
import { useInventoryLedgerParams } from "@/hooks/use-inventory-ledger-params"
import {
  stockChangeGroup,
  stockChangeLabel,
  stockDate,
} from "@/lib/inventory-labels"
import { useTRPC } from "@/trpc/client"
import type { DirectoryView } from "@/utils/directory-view-settings"
import type { TableSettings } from "@/utils/table-settings"
import { useSuspenseQuery } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import { InventoryLedgerTable } from "../inventory-ledger/data-table"
import {
  type InventoryOperation,
  operationColumns,
  operationReason,
  operationSortFields,
  productsChangedText,
} from "./columns"
import { OperationsEmpty } from "./empty-states"
const getOperationLabel = (row: InventoryOperation) =>
  `${stockChangeLabel(row.type)}, ${stockDate(row.effectiveAt)}`

function describeOperation(row: InventoryOperation) {
  return {
    title: stockChangeLabel(row.type),
    description: `${stockDate(row.effectiveAt)} · ${row.storeName}`,
    details: [
      { label: "Reason and note", value: operationReason(row) || "—" },
      {
        label: "Products changed",
        value: productsChangedText(row.movementCount),
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
          (!params.filter || stockChangeGroup(row) === params.filter) &&
          [
            stockChangeLabel(row.type),
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
  const record = data.find((row) => row.id === params.record) ?? null
  return (
    <div className="grid gap-4">
      <InventoryLedgerTable
        rows={rows}
        columns={columns}
        tableId="inventory-operations"
        initialSettings={initialSettings}
        sortFields={operationSortFields}
        label="Stock changes"
        summary={`${rows.length} change${rows.length === 1 ? "" : "s"}${data.length >= 200 ? " · showing the latest 200" : ""}`}
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
          This stock change is too old to show here.{" "}
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
