"use client"
import { InventoryAuditSheet } from "@/components/sheets/inventory-audit-sheet"
import { useInventoryLedgerParams } from "@/hooks/use-inventory-ledger-params"
import { useStockHistoryCategoryParams } from "@/hooks/use-stock-history-filter-params"
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

/** Phone and List rows: what, when, why; the store only for all stores. */
function describeOperation(row: InventoryOperation, allStores: boolean) {
  const reason = operationReason(row)
  return {
    title: stockChangeLabel(row.type),
    details: [
      { label: "When", value: stockDate(row.effectiveAt) },
      ...(allStores ? [{ label: "Store", value: row.storeName }] : []),
      ...(reason ? [{ label: "Reason and note", value: reason }] : []),
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
  const categories = useStockHistoryCategoryParams()
  // Group, search and categories run on the server, so every page is already filtered.
  const query = useSuspenseInfiniteQuery(
    trpc.inventory.operationHistoryPage.infiniteQueryOptions(
      stockHistoryPageInput({
        storeId,
        q: params.q,
        filter: params.filter,
        categories: categories.filter,
      }),
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
  const describeRecord = useCallback(
    (row: InventoryOperation) => describeOperation(row, !storeId),
    [storeId],
  )
  const open = useCallback(
    (row: InventoryOperation) => void setParams({ record: row.id }),
    [setParams],
  )
  const columns = useMemo(
    () => operationColumns({ showStore: !storeId }),
    [storeId],
  )
  const record = rows.find((row) => row.id === params.record) ?? null
  return (
    <div className="grid gap-4">
      {/* Above the table: a link to a change outside the loaded pages must be seen. */}
      {params.record && !record ? (
        <output className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-4 py-3 text-sm">
          This stock change is not in the loaded list.
          <button
            type="button"
            className="underline underline-offset-4"
            onClick={() => void setParams({ record: null })}
          >
            Dismiss
          </button>
        </output>
      ) : null}
      <InventoryLedgerTable
        rows={rows}
        columns={columns}
        tableId="inventory-operations"
        initialSettings={initialSettings}
        sortFields={operationSortFields}
        label="Stock changes"
        summary={`${rows.length} change${rows.length === 1 ? "" : "s"}${query.hasNextPage ? " loaded" : ""}`}
        view={view}
        getRecordLabel={getOperationLabel}
        describeRecord={describeRecord}
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
            filtered={Boolean(
              params.q ||
                params.filter ||
                categories.filter.uncategorized ||
                categories.filter.categoryNameIds.length,
            )}
            onClear={() => {
              void setParams({ q: null, filter: null })
              void categories.clear()
            }}
          />
        }
      />
      <InventoryAuditSheet
        record={record}
        onClose={() => void setParams({ record: null })}
      />
    </div>
  )
}
