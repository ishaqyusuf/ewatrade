"use client"
import type { LedgerEntry } from "@/components/customer-ledger/types"
import {
  SelectionBar,
  VirtualRow,
  useLoadedRowSelection,
} from "@/components/tables/core"
import { useStickyColumns } from "@/hooks/use-sticky-columns"
import { useTableDnd } from "@/hooks/use-table-dnd"
import { useTableScroll } from "@/hooks/use-table-scroll"
import { useTableSettings } from "@/hooks/use-table-settings"
import {
  type TableId,
  type TableSettings,
  getColumnIds,
  tableIds,
} from "@/utils/table-settings"
import { DndContext, closestCenter } from "@dnd-kit/core"
import { Table, TableBody } from "@ewatrade/ui"
import {
  type ColumnOrderState,
  type ColumnSizingState,
  type VisibilityState,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useMemo, useState } from "react"
import { customerLedgerColumns } from "./columns"
import {
  CustomerLedgerTableHeader,
  CustomerLedgerTableSettings,
} from "./table-header"
const STICKY = [
  { id: "select", width: 50 },
  { id: "date", width: 170 },
  { id: "actions", width: 96, side: "right" as const },
]
const FIXED = ["select", "date"]
const getEntryId = (entry: LedgerEntry) => entry.id
type Props = {
  entries: LedgerEntry[]
  currencyCode: string
  onOpen: (id: string) => void
  initialSettings?: Partial<TableSettings>
}
type Controls = Pick<
  ReturnType<typeof useTableSettings>,
  | "columnVisibility"
  | "columnSizing"
  | "columnOrder"
  | "setColumnVisibility"
  | "setColumnSizing"
  | "setColumnOrder"
>

export function CustomerLedgerDataTable(props: Props) {
  // The parent owns the shared registry; once registered, existing scoped persistence is used.
  const registeredId = tableIds.find((id) => String(id) === "customer-ledger")
  return registeredId ? (
    <PersistentTable {...props} tableId={registeredId} />
  ) : (
    <LocalTable {...props} />
  )
}
function PersistentTable(props: Props & { tableId: TableId }) {
  const columns = useMemo(
    () => customerLedgerColumns(props.currencyCode, props.onOpen),
    [props.currencyCode, props.onOpen],
  )
  const controls = useTableSettings({
    tableId: props.tableId,
    initialSettings: props.initialSettings,
    columnIds: getColumnIds(columns),
    fixedColumnIds: FIXED,
  })
  return (
    <div className="grid gap-3">
      {controls.persistenceError ? (
        <div role="alert">
          {controls.persistenceError}
          <button type="button" onClick={controls.retryPersistence}>
            Try again
          </button>
        </div>
      ) : null}
      <StatementTable {...props} controls={controls} />
    </div>
  )
}
function LocalTable(props: Props) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({})
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([])
  return (
    <StatementTable
      {...props}
      controls={{
        columnVisibility,
        columnSizing,
        columnOrder,
        setColumnVisibility,
        setColumnSizing,
        setColumnOrder,
      }}
    />
  )
}
function StatementTable({
  entries,
  currencyCode,
  onOpen,
  controls,
}: Props & { controls: Controls }) {
  const columns = useMemo(
    () => customerLedgerColumns(currencyCode, onOpen),
    [currencyCode, onOpen],
  )
  const {
    columnVisibility,
    columnSizing,
    columnOrder,
    setColumnVisibility,
    setColumnSizing,
    setColumnOrder,
  } = controls
  // Entry selection only; balances and totals stay statement-level summaries.
  const [rowSelection, setRowSelection] = useLoadedRowSelection({
    rows: entries,
    getRowId: getEntryId,
    scope: "",
  })
  const table = useReactTable({
    data: entries,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: getEntryId,
    onRowSelectionChange: setRowSelection,
    columnResizeMode: "onChange",
    enableColumnResizing: true,
    state: { columnVisibility, columnSizing, columnOrder, rowSelection },
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    onColumnOrderChange: setColumnOrder,
  })
  const scroll = useTableScroll({ useColumnWidths: true })
  const sticky = useStickyColumns({ table, stickyColumns: STICKY })
  const dnd = useTableDnd(table, { fixedColumnIds: FIXED })
  const rows = table.getRowModel().rows
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroll.containerRef.current,
    estimateSize: () => 57,
    overscan: 10,
  })
  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex justify-end">
        <CustomerLedgerTableSettings table={table} />
      </div>
      <DndContext
        sensors={dnd.sensors}
        collisionDetection={closestCenter}
        onDragEnd={dnd.handleDragEnd}
      >
        <div
          ref={scroll.setContainerRef}
          className="relative max-h-[520px] overflow-auto overscroll-contain"
          // biome-ignore lint/a11y/useSemanticElements: Shared scroll hook binds a div.
          role="region"
          aria-label="Customer statement entries"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Wide statement region needs keyboard scrolling.
          tabIndex={0}
        >
          <Table
            className="relative block w-full"
            style={{ minWidth: table.getTotalSize() }}
          >
            <CustomerLedgerTableHeader
              table={table}
              sortableColumnIds={dnd.sortableColumnIds}
              {...sticky}
              tableScroll={scroll}
            />
            <TableBody
              className="relative block"
              style={{ height: virtual.getTotalSize() }}
            >
              {virtual.getVirtualItems().map((item) => {
                const row = rows[item.index]
                return row ? (
                  <VirtualRow
                    key={row.id}
                    row={row}
                    virtualStart={item.start}
                    rowHeight={57}
                    getStickyStyle={sticky.getStickyStyle}
                    getStickyClassName={sticky.getStickyClassName}
                    isSelected={row.getIsSelected()}
                    onRowOpen={(r) => onOpen(r.original.id)}
                  />
                ) : null
              })}
            </TableBody>
          </Table>
        </div>
      </DndContext>
      <SelectionBar table={table} />
    </div>
  )
}
