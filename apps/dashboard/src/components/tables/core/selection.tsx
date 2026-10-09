"use client"

import { Checkbox } from "@ewatrade/ui"
import type {
  ColumnDef,
  Row,
  RowSelectionState,
  Table,
} from "@tanstack/react-table"
import { AnimatePresence } from "framer-motion"
import { type ReactNode, useEffect, useState } from "react"
import { BottomBar } from "./bottom-bar"

export const SELECT_COLUMN_ID = "select"
export const SELECT_COLUMN_WIDTH = 50

/** Select-all for the loaded rows; a mixed state shows a partial selection. */
export function SelectAllCheckbox<TData>({
  table,
  label,
  disabled = false,
}: {
  table: Table<TData>
  label: string
  disabled?: boolean
}) {
  return (
    <Checkbox
      aria-label={label}
      checked={table.getIsAllRowsSelected()}
      indeterminate={table.getIsSomeRowsSelected()}
      disabled={
        disabled || !table.getRowModel().rows.some((row) => row.getCanSelect())
      }
      onCheckedChange={(checked) => table.toggleAllRowsSelected(checked)}
    />
  )
}

export function RowSelectCheckbox<TData>({
  row,
  label,
}: {
  row: Row<TData>
  label: string
}) {
  return (
    <Checkbox
      aria-label={label}
      checked={row.getIsSelected()}
      disabled={!row.getCanSelect()}
      onCheckedChange={(checked) => row.toggleSelected(checked)}
    />
  )
}

/**
 * Sticky checkbox column. Virtualized headers render their own select-all;
 * simple tables render `header`.
 */
export function selectColumn<TData>(
  getLabel: (record: TData) => string,
  selectAllLabel = "Select all loaded rows",
): ColumnDef<TData> {
  return {
    id: SELECT_COLUMN_ID,
    header: ({ table }) => (
      <SelectAllCheckbox table={table} label={selectAllLabel} />
    ),
    size: SELECT_COLUMN_WIDTH,
    minSize: SELECT_COLUMN_WIDTH,
    maxSize: SELECT_COLUMN_WIDTH,
    enableHiding: false,
    enableResizing: false,
    enableSorting: false,
    meta: {
      headerLabel: "Select",
      sticky: true,
      reorderable: false,
      className:
        "z-20 bg-background group-hover:bg-muted/40 group-focus-visible:bg-muted/40 group-aria-selected:bg-muted/60",
      skeleton: { type: "checkbox" },
    },
    cell: ({ row }) => (
      <RowSelectCheckbox row={row} label={`Select ${getLabel(row.original)}`} />
    ),
  }
}

/** Keeps selected IDs that are still loaded; returns `previous` when unchanged. */
export function pruneRowSelection(
  previous: RowSelectionState,
  loadedIds: ReadonlySet<string>,
): RowSelectionState {
  const kept = Object.entries(previous).filter(
    ([id, selected]) => selected && loadedIds.has(id),
  )
  return kept.length === Object.keys(previous).length
    ? previous
    : Object.fromEntries(kept)
}

/**
 * Ephemeral selection keyed by stable row IDs. A new `scope` (query, filter,
 * tenant or Store) clears it; IDs that are no longer loaded are dropped.
 */
export function useLoadedRowSelection<TData>({
  rows,
  getRowId,
  scope,
}: {
  rows: readonly TData[]
  getRowId: (row: TData) => string
  scope: string
}) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [selectionScope, setSelectionScope] = useState(scope)
  if (selectionScope !== scope) {
    setSelectionScope(scope)
    setRowSelection({})
  }
  useEffect(() => {
    const ids = new Set(rows.map(getRowId))
    setRowSelection((previous) => pruneRowSelection(previous, ids))
  }, [rows, getRowId])
  return [rowSelection, setRowSelection] as const
}

/** Count and Deselect all for directories without bulk actions yet. */
export function SelectionBar<TData>({
  table,
  children = null,
}: {
  table: Table<TData>
  children?: ReactNode
}) {
  const selectedCount = table.getSelectedRowModel().rows.length
  return (
    <AnimatePresence>
      {selectedCount > 0 ? (
        <BottomBar
          selectedCount={selectedCount}
          onDeselect={() => table.resetRowSelection()}
        >
          {children}
        </BottomBar>
      ) : null}
    </AnimatePresence>
  )
}
