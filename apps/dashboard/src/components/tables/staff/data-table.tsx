"use client"
import { BottomBar } from "@/components/tables/core/bottom-bar"
import { useSortParams } from "@/hooks/use-sort-params"
import type { StaffMemberRow } from "@/lib/staff-management"
import type { DirectoryView } from "@/utils/directory-view-settings"
import { Checkbox, Table, TableBody, TableCell, TableRow } from "@ewatrade/ui"
import {
  type RowSelectionState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { AnimatePresence } from "framer-motion"
import { useEffect, useMemo, useState } from "react"
import { StaffCollection } from "./collection"
import { staffColumns } from "./columns"
import { StaffEmptyState } from "./empty-states"
import { StaffSkeleton } from "./skeleton"
import { staffSortFields } from "./sort"
import { StaffTableHeader } from "./table-header"

export function StaffDataTable({
  rows,
  view: staffView,
  isLoading,
  updatingId,
  onUpdateStatus,
}: {
  rows: StaffMemberRow[]
  view: DirectoryView
  isLoading: boolean
  updatingId: string | null
  onUpdateStatus: (staff: StaffMemberRow) => void
}) {
  const { sort, sorting, toggleSort } = useSortParams({
    fields: staffSortFields,
  })
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
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
  const columns = useMemo(
    () => staffColumns({ updatingId, onUpdateStatus }),
    [updatingId, onUpdateStatus],
  )
  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableRowSelection: !isLoading,
    onRowSelectionChange: setRowSelection,
    state: { sorting, rowSelection },
  })
  const selectedCount = table.getSelectedRowModel().rows.length
  return (
    <div className="flex min-w-0 flex-col gap-3" aria-busy={isLoading}>
      <div className="flex flex-wrap items-center gap-3">
        {staffView !== "table" ? (
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              aria-label="Select all staff"
              checked={table.getIsAllRowsSelected()}
              indeterminate={table.getIsSomeRowsSelected()}
              disabled={isLoading || !rows.length}
              onCheckedChange={(checked) =>
                table.toggleAllRowsSelected(checked)
              }
            />
            Select all
          </div>
        ) : null}
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {rows.length} staff members{isLoading ? " · Updating…" : ""}
          {sort ? ` · sorted by ${sort.field} ${sort.direction}` : ""}
        </p>
      </div>
      {!rows.length ? (
        isLoading ? (
          <StaffSkeleton />
        ) : (
          <StaffEmptyState />
        )
      ) : staffView !== "table" ? (
        <StaffCollection
          view={staffView}
          rows={table.getRowModel().rows}
          updatingId={updatingId}
          onUpdateStatus={onUpdateStatus}
        />
      ) : (
        <div className="overflow-x-auto border border-border">
          <Table className="min-w-[760px]">
            <StaffTableHeader
              table={table}
              sort={sort}
              toggleSort={toggleSort}
            />
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-3">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No staff found. Invite a staff member or adjust the current
                    filters.
                  </TableCell>
                </TableRow>
              )}
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
