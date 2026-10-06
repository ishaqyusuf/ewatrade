"use client"

import {
  DirectoryCollection,
  DirectoryRecord,
  DirectoryToolbar,
  HorizontalPagination,
  SelectionBar,
  VirtualRow,
  useLoadedRowSelection,
} from "@/components/tables/core"
import { useStickyColumns } from "@/hooks/use-sticky-columns"
import { useTableDnd } from "@/hooks/use-table-dnd"
import { useTableScroll } from "@/hooks/use-table-scroll"
import { useTableSettings } from "@/hooks/use-table-settings"
import type { DirectoryView } from "@/utils/directory-view-settings"
import type { TableSettings } from "@/utils/table-settings"
import { DndContext, type DragEndEvent, closestCenter } from "@dnd-kit/core"
import { Button, Table, TableBody } from "@ewatrade/ui"
import { getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useMemo } from "react"
import { StoreConversationActionMenu } from "./action-menu"
import {
  type StoreConversationQueueItem,
  StoreConversationResponse,
  createStoreConversationColumns,
  formatStoreConversationDate,
  formatStoreConversationRequestKind,
  formatStoreConversationStatus,
} from "./columns"
import {
  StoreConversationColumnSettings,
  StoreConversationRichTableHeader,
} from "./rich-table-header"

const ROW_HEIGHT = 57
const STICKY_COLUMNS = [
  { id: "select", width: 50 },
  { id: "conversation", width: 240 },
  { id: "actions", side: "right" as const, width: 90 },
]

const FIXED_COLUMN_IDS = ["select", "conversation"]
const getConversationId = (item: StoreConversationQueueItem) =>
  item.conversationId

function requestSummary(item: StoreConversationQueueItem) {
  return item.requests.map((request, index) => (
    <span className="block" key={`${request.id}:${index}`}>
      {formatStoreConversationRequestKind(request.kind)} ·{" "}
      {formatStoreConversationStatus(request.status)}
      {request.lifecycle === "terminal" ? " (closed)" : ""}
    </span>
  ))
}

export function StoreConversationDataTable({
  items,
  view,
  selectionScope,
  onOpen,
  timeZone,
  sort,
  toggleSort,
  fetchError,
  retry,
  persistenceError,
  retryPersistence,
  initialSettings,
}: {
  items: StoreConversationQueueItem[]
  view: DirectoryView
  selectionScope: string
  onOpen: (conversationId: string) => void
  timeZone: string
  sort: ["last_customer_activity" | "response_due_at", "asc" | "desc"]
  toggleSort: (field: "last_customer_activity" | "response_due_at") => void
  fetchError?: string
  retry?: () => void
  persistenceError?: string | null
  retryPersistence?: () => void
  initialSettings?: Partial<TableSettings>
}) {
  const columns = useMemo(
    () => createStoreConversationColumns(timeZone, onOpen),
    [onOpen, timeZone],
  )
  const columnIds = useMemo(
    () =>
      columns.map(
        (column) =>
          column.id ??
          ("accessorKey" in column ? String(column.accessorKey) : ""),
      ),
    [columns],
  )
  const settings = useTableSettings({
    tableId: "store-conversations",
    initialSettings,
    columnIds,
    fixedColumnIds: FIXED_COLUMN_IDS,
  })
  const [rowSelection, setRowSelection] = useLoadedRowSelection({
    rows: items,
    getRowId: getConversationId,
    scope: selectionScope,
  })
  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: getConversationId,
    onRowSelectionChange: setRowSelection,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    state: {
      columnVisibility: settings.columnVisibility,
      columnSizing: settings.columnSizing,
      columnOrder: settings.columnOrder,
      rowSelection,
    },
    onColumnVisibilityChange: settings.setColumnVisibility,
    onColumnSizingChange: settings.setColumnSizing,
    onColumnOrderChange: settings.setColumnOrder,
  })
  const { sensors, handleDragEnd, sortableColumnIds } = useTableDnd(table, {
    fixedColumnIds: FIXED_COLUMN_IDS,
  })
  const { getStickyStyle, getStickyClassName, isVisible } = useStickyColumns({
    table,
    stickyColumns: STICKY_COLUMNS,
  })
  const scroll = useTableScroll({ useColumnWidths: true })
  const rows = table.getRowModel().rows
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroll.containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  })

  return (
    <div className="grid gap-3">
      {fetchError ? (
        <div className="flex items-center justify-between gap-3" role="alert">
          <p className="text-sm text-destructive">{fetchError}</p>
          <Button variant="outline" onClick={retry} appearance="form">
            Try again
          </Button>
        </div>
      ) : null}
      {(persistenceError ?? settings.persistenceError) ? (
        <div className="flex items-center justify-between gap-3" role="alert">
          <p className="text-sm text-destructive">
            {persistenceError ?? settings.persistenceError}
          </p>
          <Button
            variant="outline"
            onClick={retryPersistence ?? settings.retryPersistence}
            appearance="form"
          >
            Retry saving columns
          </Button>
        </div>
      ) : null}
      <DirectoryToolbar
        table={table}
        view={view}
        selectAllLabel="Select all loaded conversations"
        summary={`${items.length} conversations on this page`}
      >
        {view === "table" ? (
          <StoreConversationColumnSettings table={table} />
        ) : null}
      </DirectoryToolbar>
      {view !== "table" ? (
        <DirectoryCollection view={view} label="Conversation">
          {rows.map((row) => {
            const item = row.original
            return (
              <DirectoryRecord
                key={row.id}
                row={row}
                view={view}
                selectLabel={`Select conversation ${item.conversationId}`}
                title={item.conversationId}
                onOpen={() => onOpen(item.conversationId)}
                description={formatStoreConversationDate(
                  item.lastCustomerActivityAt,
                  timeZone,
                )}
                badges={<StoreConversationResponse item={item} />}
                details={[
                  { label: "Requests", value: requestSummary(item) },
                  {
                    label: "Assignment",
                    value: item.assignment.label ?? "Unassigned",
                  },
                ]}
                actions={
                  <StoreConversationActionMenu
                    onOpen={() => onOpen(item.conversationId)}
                  />
                }
              />
            )
          })}
        </DirectoryCollection>
      ) : (
        <section
          ref={scroll.setContainerRef}
          className="max-h-[560px] overflow-auto overscroll-contain border border-border bg-background"
          aria-label="Store conversations"
        >
          <DndContext
            id="store-conversations-dnd"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <Table
              className="block text-sm"
              style={{ width: table.getTotalSize(), minWidth: "100%" }}
            >
              <StoreConversationRichTableHeader
                table={table}
                sortableColumnIds={sortableColumnIds}
                sort={sort}
                toggleSort={toggleSort}
                getStickyStyle={getStickyStyle}
                getStickyClassName={getStickyClassName}
                isVisible={isVisible}
                scrollControls={
                  scroll.isScrollable ? (
                    <HorizontalPagination
                      canScrollLeft={scroll.canScrollLeft}
                      canScrollRight={scroll.canScrollRight}
                      onScrollLeft={scroll.scrollLeft}
                      onScrollRight={scroll.scrollRight}
                      className="hidden md:flex"
                    />
                  ) : null
                }
              />
              <TableBody
                className="relative block w-full border-0"
                style={{ height: `${virtualizer.getTotalSize()}px` }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const row = rows[virtualRow.index]
                  if (!row) return null
                  return (
                    <VirtualRow
                      key={row.id}
                      row={row}
                      virtualStart={virtualRow.start}
                      rowHeight={ROW_HEIGHT}
                      getStickyStyle={getStickyStyle}
                      getStickyClassName={getStickyClassName}
                      columnSizing={table.getState().columnSizing}
                      columnOrder={table.getState().columnOrder}
                      columnVisibility={table.getState().columnVisibility}
                      isSelected={row.getIsSelected()}
                      onRowOpen={(selected) =>
                        onOpen(selected.original.conversationId)
                      }
                    />
                  )
                })}
              </TableBody>
            </Table>
          </DndContext>
        </section>
      )}
      <SelectionBar table={table} />
    </div>
  )
}
