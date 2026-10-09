"use client"
import {
  DirectoryToolbar,
  SelectionBar,
  TABLE_ROW_ACCENT_CLASS,
  TABLE_ROW_RULE_CLASS,
  type TableColumnMeta,
  useLoadedRowSelection,
} from "@/components/tables/core"
import { useSortParams } from "@/hooks/use-sort-params"
import type { StaffMemberRow } from "@/lib/staff-management"
import { cn } from "@/utils"
import type { DirectoryView } from "@/utils/directory-view-settings"
import { Table, TableBody, TableCell, TableRow } from "@ewatrade/ui"
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useMemo } from "react"
import { StaffCollection } from "./collection"
import { staffColumns } from "./columns"
import { StaffEmptyState } from "./empty-states"
import { StaffSkeleton } from "./skeleton"
import { staffSortFields } from "./sort"
import { StaffTableHeader } from "./table-header"

const getStaffId = (row: StaffMemberRow) => row.id

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
  const [rowSelection, setRowSelection] = useLoadedRowSelection({
    rows,
    getRowId: getStaffId,
    scope: "",
  })
  const columns = useMemo(
    () => staffColumns({ updatingId, onUpdateStatus }),
    [updatingId, onUpdateStatus],
  )
  const table = useReactTable({
    data: rows,
    columns,
    getRowId: getStaffId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableRowSelection: !isLoading,
    onRowSelectionChange: setRowSelection,
    state: { sorting, rowSelection },
  })
  return (
    <div className="flex min-w-0 flex-col gap-3" aria-busy={isLoading}>
      <DirectoryToolbar
        table={table}
        view={staffView}
        selectAllLabel="Select all staff"
        disabled={isLoading || !rows.length}
        summary={`${rows.length} staff members${isLoading ? " · Updating…" : ""}${
          sort ? ` · sorted by ${sort.field} ${sort.direction}` : ""
        }`}
      />
      {!rows.length ? (
        isLoading ? (
          <StaffSkeleton view={staffView} />
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
        <div className="overflow-x-auto">
          <Table aria-label="Staff directory" className="min-w-[760px]">
            <StaffTableHeader
              table={table}
              sort={sort}
              toggleSort={toggleSort}
            />
            <TableBody className="border-0">
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    className={cn(
                      "group hover:bg-muted/40 data-[state=selected]:bg-muted/60",
                      TABLE_ROW_RULE_CLASS,
                    )}
                  >
                    {row.getVisibleCells().map((cell, index) => {
                      const meta = cell.column.columnDef.meta as
                        | TableColumnMeta
                        | undefined
                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            "border-r-0 py-3",
                            index === 0 && TABLE_ROW_ACCENT_CLASS,
                            meta?.align === "end" && "text-right tabular-nums",
                          )}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))
              ) : (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 border-r-0 text-center text-muted-foreground"
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
      <SelectionBar table={table} />
    </div>
  )
}
