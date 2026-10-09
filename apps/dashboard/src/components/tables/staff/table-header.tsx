"use client"
import {
  SELECT_COLUMN_ID,
  type TableColumnMeta,
} from "@/components/tables/core"
import type { useSortParams } from "@/hooks/use-sort-params"
import type { StaffMemberRow } from "@/lib/staff-management"
import { cn } from "@/utils"
import { Button, TableHead, TableHeader, TableRow } from "@ewatrade/ui"
import { type Table, flexRender } from "@tanstack/react-table"
import { staffSortFields } from "./sort"
type StaffSort = ReturnType<typeof useSortParams<typeof staffSortFields>>

/** Same header chrome as SimpleDirectoryTable: muted, small, no dividers. */
const QUIET_HEADER_CELL_CLASS =
  "h-9 border-r-0 text-xs font-normal [&_[data-slot=button]]:text-xs"

export function StaffTableHeader({
  table,
  sort,
  toggleSort,
}: {
  table: Table<StaffMemberRow>
  sort: StaffSort["sort"]
  toggleSort: StaffSort["toggleSort"]
}) {
  return (
    <TableHeader className="border-0">
      <TableRow className="border-b border-border hover:bg-transparent">
        {table.getFlatHeaders().map((header) => {
          const id = header.column.id
          const meta = header.column.columnDef.meta as
            | TableColumnMeta
            | undefined
          const field = staffSortFields.find((candidate) => candidate === id)
          const direction =
            field && sort?.field === field ? sort.direction : undefined
          return (
            <TableHead
              key={header.id}
              scope="col"
              aria-sort={
                field
                  ? direction === "asc"
                    ? "ascending"
                    : direction === "desc"
                      ? "descending"
                      : "none"
                  : undefined
              }
              className={cn(
                QUIET_HEADER_CELL_CLASS,
                id === SELECT_COLUMN_ID && "w-12",
                meta?.align === "end" && "text-right",
              )}
            >
              {field ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto p-0 font-normal hover:bg-transparent"
                  aria-label={`Sort by ${String(header.column.columnDef.header)}${direction ? `, currently ${direction}` : ""}`}
                  onClick={() => void toggleSort(field)}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                  <span aria-hidden="true">
                    {direction === "asc"
                      ? " ↑"
                      : direction === "desc"
                        ? " ↓"
                        : ""}
                  </span>
                </Button>
              ) : (
                flexRender(header.column.columnDef.header, header.getContext())
              )}
            </TableHead>
          )
        })}
      </TableRow>
    </TableHeader>
  )
}
