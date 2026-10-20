"use client"
import type { useSortParams } from "@/hooks/use-sort-params"
import type { StaffMemberRow } from "@/lib/staff-management"
import { Button, TableHead, TableHeader, TableRow } from "@ewatrade/ui"
import { type Table, flexRender } from "@tanstack/react-table"
import { staffSortFields } from "./sort"
type StaffSort = ReturnType<typeof useSortParams<typeof staffSortFields>>
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
    <TableHeader>
      <TableRow>
        {table.getFlatHeaders().map((header) => {
          const id = header.column.id
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
            >
              {field ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto rounded-none p-0 font-normal hover:bg-transparent"
                  aria-label={`Sort by ${String(header.column.columnDef.header)}${direction ? `, currently ${direction}` : ""}`}
                  onClick={() => void toggleSort(field)}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                  {direction === "asc"
                    ? " ↑"
                    : direction === "desc"
                      ? " ↓"
                      : ""}
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
