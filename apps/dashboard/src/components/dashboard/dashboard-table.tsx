"use client"

import { cn } from "@/utils"
import type { ReactNode } from "react"

const loadingRows = [
  "loading-1",
  "loading-2",
  "loading-3",
  "loading-4",
  "loading-5",
]

type Column<T> = {
  className?: string
  header: string
  key: string
  render: (row: T) => ReactNode
}

type DashboardTableProps<T> = {
  columns: Column<T>[]
  emptyState: ReactNode
  getRowKey: (row: T) => string
  isLoading?: boolean
  onSelectionChange?: (keys: Set<string>) => void
  rows: T[]
  selectedKeys?: Set<string>
}

export function DashboardTable<T>({
  columns,
  emptyState,
  getRowKey,
  isLoading,
  onSelectionChange,
  rows,
  selectedKeys = new Set<string>(),
}: DashboardTableProps<T>) {
  const rowKeys = rows.map(getRowKey)
  const allSelected =
    rowKeys.length > 0 && rowKeys.every((key) => selectedKeys.has(key))
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs font-medium uppercase text-muted-foreground">
            <tr>
              {onSelectionChange ? (
                <th scope="col" className="w-12 px-4 py-3">
                  <input
                    aria-label="Select all rows"
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) =>
                      onSelectionChange(
                        event.target.checked ? new Set(rowKeys) : new Set(),
                      )
                    }
                  />
                </th>
              ) : null}
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn("px-4 py-3", column.className)}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading
              ? loadingRows.map((rowKey) => (
                  <tr key={rowKey}>
                    {onSelectionChange ? (
                      <td className="px-4 py-4">
                        <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                      </td>
                    ) : null}
                    {columns.map((column) => (
                      <td key={column.key} className="px-4 py-4">
                        <div className="h-4 w-full max-w-[160px] animate-pulse rounded bg-muted" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => (
                  <tr key={getRowKey(row)} className="hover:bg-muted/40">
                    {onSelectionChange ? (
                      <td className="px-4 py-4 align-middle">
                        <input
                          aria-label={`Select row ${getRowKey(row)}`}
                          type="checkbox"
                          checked={selectedKeys.has(getRowKey(row))}
                          onChange={(event) => {
                            const next = new Set(selectedKeys)
                            if (event.target.checked) next.add(getRowKey(row))
                            else next.delete(getRowKey(row))
                            onSelectionChange(next)
                          }}
                        />
                      </td>
                    ) : null}
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cn(
                          "px-4 py-4 align-middle",
                          column.className,
                        )}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {!isLoading && rows.length === 0 ? (
        <div className="border-t border-border p-10">{emptyState}</div>
      ) : null}
    </div>
  )
}
