"use client"
import { InventoryAuditSheet } from "@/components/sheets/inventory-audit-sheet"
import { useInventoryLedgerParams } from "@/hooks/use-inventory-ledger-params"
import {
  stockChangeLabel,
  stockDate,
  stockHistoryPageInput,
} from "@/lib/inventory-labels"
import { useTRPC } from "@/trpc/client"
import type { DirectoryView } from "@/utils/directory-view-settings"
import type { TableSettings } from "@/utils/table-settings"
import { useSuspenseInfiniteQuery } from "@tanstack/react-query"
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
  // Group and search run on the server, so every page is already filtered.
  const query = useSuspenseInfiniteQuery(
    trpc.inventory.operationHistoryPage.infiniteQueryOptions(
      stockHistoryPageInput({ storeId, q: params.q, filter: params.filter }),
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        retry: false,
      },
    ),
  )
  const rows = useMemo(
    () => query.data.pages.flatMap((page) => page.rows),
    [query.data.pages],
  )
  const open = useCallback(
    (row: InventoryOperation) => void setParams({ record: row.id }),
    [setParams],
  )
  const columns = useMemo(() => operationColumns(open), [open])
  const record = rows.find((row) => row.id === params.record) ?? null
  return (
    <div className="grid gap-4">
      <InventoryLedgerTable
        rows={rows}
        columns={columns}
        tableId="inventory-operations"
        initialSettings={initialSettings}
        sortFields={operationSortFields}
        label="Stock changes"
        summary={`${rows.length} change${rows.length === 1 ? "" : "s"}${query.hasNextPage ? " loaded" : ""}`}
        view={view}
        selectionScope={JSON.stringify([
          storeId ?? "all",
          params.q,
          params.filter,
        ])}
        getRecordLabel={getOperationLabel}
        describeRecord={describeOperation}
        onOpen={open}
        pagination={{
          hasNextPage: query.hasNextPage,
          isFetchingNextPage: query.isFetchingNextPage,
          isFetchNextPageError: query.isFetchNextPageError,
          errorMessage: query.error?.message,
          fetchNextPage: () => query.fetchNextPage(),
          noun: "stock changes",
        }}
        empty={
          <OperationsEmpty
            filtered={Boolean(params.q || params.filter)}
            onClear={() => void setParams({ q: null, filter: null })}
          />
        }
      />
      {params.record && !record ? (
        <output>
          This stock change is not in the loaded list.{" "}
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
