"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ewatrade/ui"
import { type Table as ReactTable, flexRender } from "@tanstack/react-table"
import type { Row } from "@tanstack/react-table"

/** Plain scrollable table for short directories that do not need virtualization. */
export function SimpleDirectoryTable<TData>({
  table,
  label,
  minWidth = 640,
  onRowOpen,
}: {
  table: ReactTable<TData>
  label: string
  minWidth?: number
  onRowOpen?: (row: Row<TData>) => void
}) {
  return (
    <div className="overflow-x-auto border border-border">
      <Table aria-label={label} style={{ minWidth }}>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead
                  key={header.id}
                  scope="col"
                  className={header.column.id === "select" ? "w-12" : undefined}
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
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              tabIndex={onRowOpen ? 0 : undefined}
              className={onRowOpen ? "cursor-pointer" : undefined}
              onClick={(event) => {
                if (
                  !(event.target as Element).closest(
                    "button, a, input, select, textarea, [role='checkbox'], [role='menuitem'], [role='menuitemcheckbox'], [role='menuitemradio'], [data-row-interactive='true']",
                  )
                )
                  onRowOpen?.(row)
              }}
              onKeyDown={(event) => {
                if (
                  event.target === event.currentTarget &&
                  (event.key === "Enter" || event.key === " ")
                ) {
                  event.preventDefault()
                  onRowOpen?.(row)
                }
              }}
              data-state={row.getIsSelected() ? "selected" : undefined}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="py-3">
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
