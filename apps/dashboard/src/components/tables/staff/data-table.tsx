"use client"
import { BottomBar } from "@/components/tables/core/bottom-bar"
import { useSortParams } from "@/hooks/use-sort-params"
import type { StaffMemberRow } from "@/lib/staff-management"
import type { DirectoryView } from "@/utils/directory-view-settings"
import { Checkbox, Table, TableBody, TableCell, TableRow } from "@ewatrade/ui"
import {
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { AnimatePresence } from "framer-motion"
import { useEffect, useMemo, useState } from "react"
import type { StaffRowActions } from "./actions"
import { StaffCollection } from "./collection"
import { staffColumns } from "./columns"
import { StaffEmptyState } from "./empty-states"
import { StaffSkeleton } from "./skeleton"
import { staffSortFields } from "./sort"
import { StaffTableHeader, StaffTableSettings } from "./table-header"

// With no sort in the URL the list reads A to Z by name.
const DEFAULT_SORTING: SortingState = [{ id: "name", desc: false }]

export function StaffDataTable({
  rows,
  view: staffView,
  isLoading,
  filtered,
  actions,
}: {
  rows: StaffMemberRow[]
  view: DirectoryView
  isLoading: boolean
  filtered: boolean
  actions: StaffRowActions
}) {
  const { sort, sorting, toggleSort } = useSortParams({
    fields: staffSortFields,
  })
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  useEffect(() => {
    const ids = new Set(rows.map((row) => row.id))
    setRowSelection((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(
          ([id, selected]) => selected && ids.has(id),
        ),
      ),
    )
  }, [rows])
  const columns = useMemo(() => staffColumns(actions), [actions])
  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableRowSelection: !isLoading,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting: sort ? sorting : DEFAULT_SORTING,
      rowSelection,
      columnVisibility,
    },
  })
  const selectedCount = table.getSelectedRowModel().rows.length
  return (
    <div className="flex min-w-0 flex-col gap-3" aria-busy={isLoading}>
      <StaffTableSettings table={table} showColumns={staffView === "table"} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {staffView !== "table" && rows.length ? (
          <div className="flex items-center gap-2">
            <Checkbox
              aria-label="Select all staff"
              checked={table.getIsAllRowsSelected()}
              indeterminate={table.getIsSomeRowsSelected()}
              disabled={isLoading}
              onCheckedChange={(checked) =>
                table.toggleAllRowsSelected(checked)
              }
            />
            Select all
          </div>
        ) : null}
        <p className="text-muted-foreground" aria-live="polite">
          {rows.length === 1 ? "1 person" : `${rows.length} people`}
          {isLoading ? " · Updating…" : ""}
        </p>
      </div>
      {!rows.length ? (
        isLoading ? (
          <StaffSkeleton />
        ) : (
          <StaffEmptyState filtered={filtered} />
        )
      ) : staffView !== "table" ? (
        <StaffCollection
          view={staffView}
          rows={table.getRowModel().rows}
          actions={actions}
        />
      ) : (
        <div className="overflow-x-auto border border-border">
          <Table className="min-w-[820px]">
            <StaffTableHeader
              table={table}
              sort={sort}
              toggleSort={toggleSort}
            />
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={
                        cell.column.id === "actions" ? "w-12 py-3" : "py-3"
                      }
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <AnimatePresence>
        {selectedCount > 0 ? (
          <BottomBar
            selectedCount={selectedCount}
            onDeselect={() => table.resetRowSelection()}
          >
            {null}
          </BottomBar>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
