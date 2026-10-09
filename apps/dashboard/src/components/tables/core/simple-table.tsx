"use client"

import { cn } from "@/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ewatrade/ui"
import { type Table as ReactTable, flexRender } from "@tanstack/react-table"
import { TABLE_ROW_ACCENT_CLASS, TABLE_ROW_RULE_CLASS } from "./types"

/** Plain scrollable table for short directories that do not need virtualization. */
export function SimpleDirectoryTable<TData>({
  table,
  label,
  minWidth = 640,
}: {
  table: ReactTable<TData>
  label: string
  minWidth?: number
}) {
  return (
    <div className="overflow-x-auto">
      <Table aria-label={label} style={{ minWidth }}>
        <TableHeader className="border-0">
          {table.getHeaderGroups().map((group) => (
            <TableRow
              key={group.id}
              className="border-b border-border hover:bg-transparent"
            >
              {group.headers.map((header) => (
                <TableHead
                  key={header.id}
                  scope="col"
                  className={cn(
                    "h-9 border-r-0 text-xs font-normal [&_[data-slot=button]]:text-xs",
                    header.column.id === "select" && "w-12",
                  )}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody className="border-0">
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() ? "selected" : undefined}
              className={cn(
                "group hover:bg-muted/40 data-[state=selected]:bg-muted/60",
                TABLE_ROW_RULE_CLASS,
              )}
            >
              {row.getVisibleCells().map((cell, index) => (
                <TableCell
                  key={cell.id}
                  className={cn(
                    "border-r-0 py-3",
                    index === 0 && TABLE_ROW_ACCENT_CLASS,
                  )}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
